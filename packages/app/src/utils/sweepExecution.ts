/**
 * sweepExecution.ts — Core per-chain sweep orchestration logic.
 *
 * Extracted from useSweep.ts so it can be unit-tested without a React
 * environment or real wallet connection.
 *
 * The main entry-point for callers is `executeAllChainsSweep`, which fires
 * all per-chain batches in parallel (Promise.allSettled) and tracks each
 * chain independently via a callback.
 */

import { encodeFunctionData } from 'viem'
import type { ChainSweepState, Quote, SweepPlan } from '@/config/types'
import { isNativeToken } from '@/config/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum time to wait for a single chain's sweep to complete (5 minutes). */
export const CHAIN_TIMEOUT_MS = 5 * 60 * 1_000

/** Polling interval when waiting for wallet_getCallsStatus / bridge status. */
export const POLL_INTERVAL_MS = 2_000

/** Maximum bridge-status poll retries (covers ~2 minutes at 2s interval). */
export const MAX_BRIDGE_RETRIES = 60

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal wallet-client interface needed by sweep execution (testable). */
export interface WalletRequestFn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (params: { method: string; params?: any[] }): Promise<any>
}

export type UpdateChainStateFn = (chainId: number, patch: Partial<ChainSweepState>) => void

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Build the EIP-5792 calls array for a single chain (approvals + swap/bridge). */
export function buildCallsForChain(
  chainQuotes: Quote[],
  sweepPlan: SweepPlan,
  chainId: number
): Array<{ to: `0x${string}`; data?: `0x${string}`; value?: `0x${string}` }> {
  const calls: Array<{ to: `0x${string}`; data?: `0x${string}`; value?: `0x${string}` }> = []

  for (const q of chainQuotes) {
    const isNative = isNativeToken(q.fromToken)

    if (!isNative && q.approvalAddress) {
      // Find matching token to get the balance as the approval amount
      const token = sweepPlan.selectedTokens.find(
        (t) =>
          t.chainId === chainId && t.address.toLowerCase() === q.fromToken.toLowerCase()
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
    // Only include `value` when it is non-zero (EIP-5792 omits the field for
    // pure token-approval/swap calls that carry no ETH value).
    const valueWei = q.transactionRequest.value ? BigInt(q.transactionRequest.value) : 0n
    calls.push({
      to: q.transactionRequest.to as `0x${string}`,
      data: q.transactionRequest.data as `0x${string}`,
      ...(valueWei > 0n && {
        value: `0x${valueWei.toString(16)}` as `0x${string}`,
      }),
    })
  }

  return calls
}

// ---------------------------------------------------------------------------
// Per-chain sweep
// ---------------------------------------------------------------------------

/**
 * Execute the sweep for a single chain:
 *   1. Build EIP-5792 batch (approvals + swaps)
 *   2. Submit via wallet_sendCalls
 *   3. Poll wallet_getCallsStatus until complete (or timeout)
 *   4. If bridge quotes present, poll /api/status until bridge confirms
 *
 * Throws on permanent failure; caller should catch and mark chain as error.
 */
export async function sweepSingleChain(opts: {
  chainId: number
  chainQuotes: Quote[]
  sweepPlan: SweepPlan
  address: string
  walletRequest: WalletRequestFn
  destinationChainId: number
  updateChainState: UpdateChainStateFn
  /** Override for testing (default: fetch) */
  fetchFn?: typeof fetch
  /** Override for testing (default: real sleep) */
  sleepFn?: (ms: number) => Promise<void>
  /** Override for testing */
  chainTimeoutMs?: number
  /** Override for testing */
  maxBridgeRetries?: number
}): Promise<void> {
  const {
    chainId,
    chainQuotes,
    sweepPlan,
    address,
    walletRequest,
    destinationChainId,
    updateChainState,
    fetchFn = fetch,
    sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
    chainTimeoutMs = CHAIN_TIMEOUT_MS,
    maxBridgeRetries = MAX_BRIDGE_RETRIES,
  } = opts

  const deadline = Date.now() + chainTimeoutMs

  const checkTimeout = () => {
    if (Date.now() > deadline) {
      throw new Error(`Chain ${chainId} sweep timed out after ${chainTimeoutMs / 1000}s`)
    }
  }

  // 1. Build calls
  updateChainState(chainId, { phase: 'approving' })
  const calls = buildCallsForChain(chainQuotes, sweepPlan, chainId)

  // 2. Submit via wallet_sendCalls (EIP-5792)
  const callsId = await walletRequest({
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

  // 3. Poll wallet_getCallsStatus
  let txHash: string | undefined
  while (true) {
    checkTimeout()
    await sleepFn(POLL_INTERVAL_MS)

    const status = await walletRequest({
      method: 'wallet_getCallsStatus',
      params: [callsId],
    })

    // statusCode 200 = complete
    if (status?.statusCode === 200 || status?.status === 200) {
      const receipts = status.receipts ?? []
      if (receipts.length > 0) {
        txHash = receipts[receipts.length - 1]?.transactionHash
      }
      break
    }

    if ((status?.statusCode ?? 0) >= 400 || (status?.status ?? 0) >= 400) {
      throw new Error(
        `Batch failed on chain ${chainId} with status ${status?.statusCode ?? status?.status}`
      )
    }
  }

  updateChainState(chainId, { txHash })

  // 4. Bridge polling (only for cross-chain quotes)
  const bridgeQuotes = chainQuotes.filter((q) => q.type === 'bridge')
  if (bridgeQuotes.length > 0 && txHash) {
    updateChainState(chainId, { phase: 'bridging' })

    let bridgeDone = false
    let retries = 0

    while (!bridgeDone && retries < maxBridgeRetries) {
      checkTimeout()
      await sleepFn(POLL_INTERVAL_MS)
      retries++

      try {
        const statusRes = await fetchFn('/api/status', {
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
          if (statusData?.status === 'DONE') {
            bridgeDone = true
          } else if (statusData?.status === 'FAILED') {
            throw new Error(`Bridge failed on chain ${chainId}`)
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Bridge failed')) throw err
        // Transient poll errors — log and continue
        console.warn('Bridge status poll error:', err)
      }
    }

    if (!bridgeDone) {
      console.warn(`Bridge polling timed out for chain ${chainId} (retries: ${retries})`)
    }
  }

  updateChainState(chainId, { phase: 'complete', tokensCompleted: chainQuotes.length })
}

// ---------------------------------------------------------------------------
// Parallel orchestrator
// ---------------------------------------------------------------------------

export interface ExecuteAllChainsOpts {
  quotes: Quote[]
  sweepPlan: SweepPlan
  address: string
  walletRequest: WalletRequestFn
  destinationChainId: number
  updateChainState: UpdateChainStateFn
  fetchFn?: typeof fetch
  sleepFn?: (ms: number) => Promise<void>
  chainTimeoutMs?: number
  maxBridgeRetries?: number
}

export interface ChainResult {
  chainId: number
  success: boolean
  error?: string
}

/**
 * Execute sweeps for ALL chains in parallel.
 *
 * Uses Promise.allSettled so a failure on one chain does not prevent others
 * from completing. Each chain tracks its own state via updateChainState.
 *
 * Returns a summary of per-chain results.
 */
export async function executeAllChainsSweep(
  opts: ExecuteAllChainsOpts
): Promise<ChainResult[]> {
  const { quotes, sweepPlan, address, walletRequest, destinationChainId, updateChainState } = opts

  // Group quotes by source chain
  const byChain = new Map<number, Quote[]>()
  for (const q of quotes) {
    const arr = byChain.get(q.fromChainId) ?? []
    arr.push(q)
    byChain.set(q.fromChainId, arr)
  }

  const chainIds = Array.from(byChain.keys())

  // Fire all chains simultaneously
  const settled = await Promise.allSettled(
    chainIds.map((chainId) =>
      sweepSingleChain({
        chainId,
        chainQuotes: byChain.get(chainId)!,
        sweepPlan,
        address,
        walletRequest,
        destinationChainId,
        updateChainState,
        fetchFn: opts.fetchFn,
        sleepFn: opts.sleepFn,
        chainTimeoutMs: opts.chainTimeoutMs,
        maxBridgeRetries: opts.maxBridgeRetries,
      })
    )
  )

  return chainIds.map((chainId, i) => {
    const result = settled[i]
    if (result.status === 'fulfilled') {
      return { chainId, success: true }
    }
    const message =
      result.reason instanceof Error ? result.reason.message : String(result.reason)
    // The sweepSingleChain catches and re-throws; we also need to mark state here
    // for chains that threw before sweepSingleChain could mark them.
    updateChainState(chainId, { phase: 'error', error: message })
    return { chainId, success: false, error: message }
  })
}
