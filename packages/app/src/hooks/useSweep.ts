'use client'

import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useAccount, useWalletClient } from 'wagmi'
import {
  selectedTokensAtom,
  destinationAtom,
  sweepPlanAtom,
  sweepStateAtom,
  scannedTokensAtom,
} from '@/atoms/walletAtoms'
import type { ScannedToken, Quote, SweepPlan, SweepState, ChainSweepState } from '@/config/types'
import { NATIVE_TOKEN_ADDRESS, isNativeToken } from '@/config/types'
import { executeAllChainsSweep } from '@/utils/sweepExecution'

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
        const isNative = isNativeToken(token.address)
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
              // Pass pre-computed USD value from scan results so the quote route
              // can apply the oracle pre-filter without an extra price fetch.
              fromDecimals: token.decimals,
              fromValueUsd: token.valueUsd,
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
  // executeSweep — group by chain, execute all chains IN PARALLEL
  //
  // Each chain fires its own wallet_sendCalls batch simultaneously.
  // Per-chain state is tracked independently in sweepStateAtom.chains.
  // A failure on one chain does not cancel others (Promise.allSettled).
  // Each chain has a 5-minute timeout.
  // -------------------------------------------------------------------------
  async function executeSweep(): Promise<void> {
    if (!address || !walletClient || !sweepPlan) return

    const { quotes, destinationChainId, destinationAddress } = sweepPlan

    // Group quotes by fromChainId to build initial chain states
    const byChain = new Map<number, Quote[]>()
    for (const q of quotes) {
      const arr = byChain.get(q.fromChainId) ?? []
      arr.push(q)
      byChain.set(q.fromChainId, arr)
    }

    const chainIds = Array.from(byChain.keys())

    // Build initial chain states (all start idle — individual chains transition to
    // approving immediately when their sweepSingleChain call begins)
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

    /** Patch a single chain's state within the global sweepStateAtom */
    const updateChainState = (chainId: number, patch: Partial<ChainSweepState>) => {
      setSweepState((prev: SweepState | null) => {
        if (!prev) return prev
        return {
          ...prev,
          chains: prev.chains.map((cs) =>
            cs.chainId === chainId ? { ...cs, ...patch } : cs
          ),
        }
      })
    }

    // Wrap walletClient.request for the utility function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walletRequest = (params: { method: string; params?: any[] }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (walletClient as any).request(params)

    // Execute all chains in parallel — allSettled so one failure doesn't abort others
    const results = await executeAllChainsSweep({
      quotes,
      sweepPlan,
      address,
      walletRequest,
      destinationChainId,
      updateChainState,
    })

    // Determine overall outcome
    const anyFailed = results.some((r) => !r.success)

    setSweepState((prev: SweepState | null) =>
      prev ? { ...prev, phase: anyFailed ? 'error' : 'complete' } : null
    )
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
