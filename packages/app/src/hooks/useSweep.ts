'use client'

import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useAccount, useWalletClient } from 'wagmi'
import { encodeFunctionData } from 'viem'
import {
  selectedTokensAtom,
  destinationAtom,
  sweepPlanAtom,
  sweepStateAtom,
  scannedTokensAtom,
} from '@/atoms/walletAtoms'
import type { ScannedToken, Quote, SweepPlan, SweepState, ChainSweepState } from '@/config/types'

const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

const erc20ApproveAbi = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

export function useSweep() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const selectedTokens = useAtomValue(selectedTokensAtom)
  const destination = useAtomValue(destinationAtom)
  const [sweepPlan, setSweepPlan] = useAtom(sweepPlanAtom)
  const [sweepState, setSweepState] = useAtom(sweepStateAtom)
  const setSelectedTokens = useSetAtom(selectedTokensAtom)
  const setScannedTokens = useSetAtom(scannedTokensAtom)
  const setDestination = useSetAtom(destinationAtom)

  const isQuoting = sweepState?.phase === 'quoting'
  const isExecuting =
    sweepState !== null &&
    sweepState.phase !== 'idle' &&
    sweepState.phase !== 'quoting' &&
    sweepState.phase !== 'complete' &&
    sweepState.phase !== 'error'

  // -------------------------------------------------------------------------
  // fetchQuotes — call /api/quote for each selected token, build SweepPlan
  // -------------------------------------------------------------------------
  async function fetchQuotes(): Promise<void> {
    if (!address || selectedTokens.length === 0) return

    // Set quoting phase
    setSweepState({
      phase: 'quoting',
      chains: [],
      destinationChainId: destination.chainId,
      destinationAddress: destination.address,
      totalValueUsd: 0,
      totalGasUsd: 0,
      netProceedsUsd: 0,
    })

    try {
      const quotePromises = selectedTokens.map(async (token: ScannedToken): Promise<Quote | null> => {
        const isNative = token.address === '0x0'
        const quoteType = token.chainId === destination.chainId ? 'swap' : 'bridge'

        try {
          const res = await fetch('/api/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromChainId: token.chainId,
              fromToken: isNative ? NATIVE_TOKEN_ADDRESS : token.address,
              toChainId: destination.chainId,
              toToken: NATIVE_TOKEN_ADDRESS,
              fromAmount: token.balance.toString(),
              fromAddress: address,
              toAddress: destination.address || address,
              type: quoteType,
            }),
          })

          if (!res.ok) {
            console.warn(`Quote failed for ${token.symbol} on chain ${token.chainId}`)
            return null
          }

          return (await res.json()) as Quote
        } catch (err) {
          console.warn(`Quote error for ${token.symbol}:`, err)
          return null
        }
      })

      const results = await Promise.all(quotePromises)
      const validQuotes = results.filter((q): q is Quote => q !== null)

      const totalValueUsd = validQuotes.reduce((sum, q) => sum + q.toAmountUsd, 0)
      const totalGasUsd = validQuotes.reduce((sum, q) => sum + q.gasEstimateUsd, 0)
      const netProceedsUsd = totalValueUsd - totalGasUsd

      const plan: SweepPlan = {
        selectedTokens,
        quotes: validQuotes,
        destinationChainId: destination.chainId,
        destinationAddress: destination.address || address,
        totalValueUsd,
        totalGasUsd,
        netProceedsUsd,
      }

      setSweepPlan(plan)

      // Reset phase back to idle after quoting
      setSweepState(null)
    } catch (err) {
      console.error('fetchQuotes failed:', err)
      setSweepState({
        phase: 'error',
        chains: [],
        destinationChainId: destination.chainId,
        destinationAddress: destination.address,
        totalValueUsd: 0,
        totalGasUsd: 0,
        netProceedsUsd: 0,
      })
    }
  }

  // -------------------------------------------------------------------------
  // executeSweep — group by chain, batch EIP-5792 wallet_sendCalls per chain
  // -------------------------------------------------------------------------
  async function executeSweep(): Promise<void> {
    if (!address || !walletClient || !sweepPlan) return

    const { quotes, destinationChainId, destinationAddress } = sweepPlan

    // Group quotes by fromChainId
    const byChain = new Map<number, Quote[]>()
    for (const q of quotes) {
      const arr = byChain.get(q.fromChainId) ?? []
      arr.push(q)
      byChain.set(q.fromChainId, arr)
    }

    const chainIds = Array.from(byChain.keys())

    // Build initial chain states
    const initialChainStates: ChainSweepState[] = chainIds.map((chainId) => ({
      chainId,
      phase: 'idle' as const,
      tokensTotal: byChain.get(chainId)!.length,
      tokensCompleted: 0,
    }))

    setSweepState({
      phase: 'approving',
      chains: initialChainStates,
      destinationChainId,
      destinationAddress,
      totalValueUsd: sweepPlan.totalValueUsd,
      totalGasUsd: sweepPlan.totalGasUsd,
      netProceedsUsd: sweepPlan.netProceedsUsd,
    })

    const updateChainState = (chainId: number, patch: Partial<ChainSweepState>) => {
      setSweepState((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          chains: prev.chains.map((cs) =>
            cs.chainId === chainId ? { ...cs, ...patch } : cs
          ),
        }
      })
    }

    try {
      for (const chainId of chainIds) {
        const chainQuotes = byChain.get(chainId)!

        updateChainState(chainId, { phase: 'approving' })

        // Build calls: approvals first, then swaps/bridges
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const calls: Array<{ to: `0x${string}`; data?: `0x${string}`; value?: `0x${string}` }> = []

        for (const q of chainQuotes) {
          // ERC-20 approval (skip native tokens — address '0x0' or NATIVE_TOKEN_ADDRESS)
          const isNative =
            q.fromToken === '0x0' ||
            q.fromToken.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()

          if (!isNative && q.approvalAddress) {
            // Find matching token to get the balance as the approval amount
            const token = sweepPlan.selectedTokens.find(
              (t) =>
                t.chainId === chainId &&
                t.address.toLowerCase() === q.fromToken.toLowerCase()
            )
            const amount = token ? token.balance : BigInt(q.fromAmount)

            const approvalData = encodeFunctionData({
              abi: erc20ApproveAbi,
              functionName: 'approve',
              args: [q.approvalAddress as `0x${string}`, amount],
            })

            calls.push({
              to: q.fromToken as `0x${string}`,
              data: approvalData,
            })
          }

          // Swap / bridge transaction
          calls.push({
            to: q.transactionRequest.to as `0x${string}`,
            data: q.transactionRequest.data as `0x${string}`,
            value: q.transactionRequest.value
              ? (`0x${BigInt(q.transactionRequest.value).toString(16)}` as `0x${string}`)
              : undefined,
          })
        }

        // Submit batch via EIP-5792
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const callsId = await (walletClient as any).request({
          method: 'wallet_sendCalls',
          params: [
            {
              version: '1.0',
              chainId: `0x${chainId.toString(16)}`,
              from: address,
              calls,
            },
          ],
        })

        updateChainState(chainId, { phase: 'swapping' })

        // Poll wallet_getCallsStatus until status 200 (complete)
        let txHash: string | undefined
        // eslint-disable-next-line no-constant-condition
        while (true) {
          await sleep(2000)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const status = await (walletClient as any).request({
            method: 'wallet_getCallsStatus',
            params: [callsId],
          })

          // status.statusCode: 100 = pending, 200 = complete
          if (status?.statusCode === 200 || status?.status === 200) {
            // Extract txHash from the first receipt
            const receipts = status.receipts ?? []
            if (receipts.length > 0) {
              txHash = receipts[receipts.length - 1]?.transactionHash
            }
            break
          }

          if (status?.statusCode >= 400 || status?.status >= 400) {
            throw new Error(`Batch failed on chain ${chainId} with status ${status?.statusCode ?? status?.status}`)
          }
        }

        updateChainState(chainId, { txHash })

        // For bridge quotes: poll /api/status until complete
        const bridgeQuotes = chainQuotes.filter((q) => q.type === 'bridge')
        if (bridgeQuotes.length > 0 && txHash) {
          updateChainState(chainId, { phase: 'bridging' })

          // Poll status for the bridge
          let bridgeDone = false
          let retries = 0
          const MAX_BRIDGE_RETRIES = 60 // up to 2 minutes

          while (!bridgeDone && retries < MAX_BRIDGE_RETRIES) {
            await sleep(2000)
            retries++

            try {
              const statusRes = await fetch('/api/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  txHash,
                  fromChainId: chainId,
                  toChainId: destinationChainId,
                }),
              })

              if (statusRes.ok) {
                const statusData = await statusRes.json()
                // LI.FI status: DONE, FAILED, PENDING
                if (statusData?.status === 'DONE') {
                  bridgeDone = true
                } else if (statusData?.status === 'FAILED') {
                  throw new Error(`Bridge failed on chain ${chainId}`)
                }
              }
            } catch (err) {
              // Ignore transient status errors during polling
              console.warn('Bridge status poll error:', err)
            }
          }

          if (!bridgeDone) {
            console.warn(`Bridge polling timed out for chain ${chainId}`)
          }
        }

        updateChainState(chainId, { phase: 'complete', tokensCompleted: chainQuotes.length })
      }

      // All chains done
      setSweepState((prev) => prev ? { ...prev, phase: 'complete' } : null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error during sweep'
      console.error('executeSweep failed:', err)
      setSweepState((prev) =>
        prev
          ? { ...prev, phase: 'error' }
          : {
              phase: 'error',
              chains: [],
              destinationChainId,
              destinationAddress,
              totalValueUsd: sweepPlan.totalValueUsd,
              totalGasUsd: sweepPlan.totalGasUsd,
              netProceedsUsd: sweepPlan.netProceedsUsd,
            }
      )
      // Mark any still-running chain as error
      setSweepState((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          chains: prev.chains.map((cs) =>
            cs.phase !== 'complete' ? { ...cs, phase: 'error', error: message } : cs
          ),
        }
      })
    }
  }

  // -------------------------------------------------------------------------
  // resetSweep — clear all sweep atoms
  // -------------------------------------------------------------------------
  function resetSweep(): void {
    setSelectedTokens([])
    setScannedTokens([])
    setSweepPlan(null)
    setSweepState(null)
    setDestination({ chainId: 8453, address: '' })
  }

  return {
    sweepPlan,
    sweepState,
    fetchQuotes,
    executeSweep,
    resetSweep,
    isQuoting,
    isExecuting,
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
