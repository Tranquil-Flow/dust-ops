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
import type { ChainSweepState, Quote, SweepMode, SweepPlan } from '@/config/types'
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
// Sequential sweep (non-EIP-5792 fallback)
// ---------------------------------------------------------------------------

/**
 * Wait for an Ethereum transaction to be mined by polling eth_getTransactionReceipt.
 *
 * @returns The transaction receipt once confirmed
 * @throws  If the deadline is exceeded before the tx is mined
 */
export async function waitForReceipt(opts: {
  txHash: string
  walletRequest: WalletRequestFn
  sleepFn: (ms: number) => Promise<void>
  deadline: number
  pollIntervalMs?: number
}): Promise<{ status: string }> {
  const { txHash, walletRequest, sleepFn, deadline, pollIntervalMs = POLL_INTERVAL_MS } = opts

  while (true) {
    if (Date.now() > deadline) {
      throw new Error(`Transaction ${txHash} not mined before deadline`)
    }
    await sleepFn(pollIntervalMs)

    let receipt: { status?: string } | null = null
    try {
      receipt = await walletRequest({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      })
    } catch {
      // Transient RPC error — keep polling
    }

    if (receipt) {
      // EIP status: '0x1' = success, '0x0' = reverted
      if (receipt.status === '0x0') {
        throw new Error(`Transaction ${txHash} reverted on-chain`)
      }
      return receipt as { status: string }
    }
  }
}

/**
 * Sequential sweep fallback for wallets without EIP-5792 (wallet_sendCalls).
 *
 * Executes approve + swap as individual eth_sendTransaction calls, waiting for
 * each to be mined before submitting the next. This gives the user per-step
 * wallet confirmation prompts.
 *
 * On user rejection (wallet throws with "rejected" / "denied" keyword), the
 * error is re-thrown with `reason: 'user_rejected'` so callers can offer
 * Resume/Cancel without marking the sweep as permanently failed.
 */
export async function sweepSingleChainSequential(opts: {
  chainId: number
  chainQuotes: Quote[]
  sweepPlan: SweepPlan
  address: string
  walletRequest: WalletRequestFn
  destinationChainId: number
  updateChainState: UpdateChainStateFn
  fetchFn?: typeof fetch
  sleepFn?: (ms: number) => Promise<void>
  chainTimeoutMs?: number
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

  updateChainState(chainId, { phase: 'approving' })

  let lastSwapTxHash: string | undefined

  for (let i = 0; i < chainQuotes.length; i++) {
    const q = chainQuotes[i]
    const isNative = isNativeToken(q.fromToken)

    // ── Step 1: ERC-20 approval (skip for native tokens) ──────────────────
    if (!isNative && q.approvalAddress) {
      checkTimeout()

      const token = sweepPlan.selectedTokens.find(
        (t) => t.chainId === chainId && t.address.toLowerCase() === q.fromToken.toLowerCase()
      )
      const amount = token ? token.balance : BigInt(q.fromAmount)

      const approvalData = encodeFunctionData({
        abi: erc20ApproveAbi,
        functionName: 'approve',
        args: [q.approvalAddress as `0x${string}`, amount],
      })

      let approvalTxHash: string
      try {
        approvalTxHash = await walletRequest({
          method: 'eth_sendTransaction',
          params: [
            {
              from: address,
              to: q.fromToken,
              data: approvalData,
              value: '0x0',
            },
          ],
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/rejected|denied|cancel/i.test(msg)) {
          const rejection = new Error(`User rejected approval for token ${q.fromToken}`)
          ;(rejection as Error & { reason: string }).reason = 'user_rejected'
          throw rejection
        }
        throw err
      }

      await waitForReceipt({ txHash: approvalTxHash, walletRequest, sleepFn, deadline })
    }

    // ── Step 2: Swap / bridge transaction ─────────────────────────────────
    checkTimeout()
    updateChainState(chainId, { phase: 'swapping' })

    const valueWei = q.transactionRequest.value ? BigInt(q.transactionRequest.value) : 0n

    let swapTxHash: string
    try {
      swapTxHash = await walletRequest({
        method: 'eth_sendTransaction',
        params: [
          {
            from: address,
            to: q.transactionRequest.to,
            data: q.transactionRequest.data,
            value: `0x${valueWei.toString(16)}`,
          },
        ],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/rejected|denied|cancel/i.test(msg)) {
        const rejection = new Error(`User rejected swap for token ${q.fromToken} (step ${i + 1}/${chainQuotes.length})`)
        ;(rejection as Error & { reason: string }).reason = 'user_rejected'
        throw rejection
      }
      throw err
    }

    await waitForReceipt({ txHash: swapTxHash, walletRequest, sleepFn, deadline })
    lastSwapTxHash = swapTxHash

    updateChainState(chainId, {
      txHash: swapTxHash,
      tokensCompleted: i + 1,
    })
  }

  // ── Bridge polling (cross-chain quotes) ───────────────────────────────────
  const bridgeQuotes = chainQuotes.filter((q) => q.type === 'bridge')
  if (bridgeQuotes.length > 0 && lastSwapTxHash) {
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
            txHash: lastSwapTxHash,
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
  /**
   * Sweep execution mode:
   *   `batch`      — EIP-5792 wallet_sendCalls (default)
   *   `sequential` — individual eth_sendTransaction fallback
   */
  sweepMode?: SweepMode
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
 * When `sweepMode` is `'sequential'`, each chain executes approve+swap via
 * individual eth_sendTransaction calls instead of EIP-5792 wallet_sendCalls.
 * Chains are still dispatched in parallel — it is within each chain that the
 * transactions are sequential (approve → wait → swap → wait).
 *
 * Returns a summary of per-chain results.
 */
export async function executeAllChainsSweep(
  opts: ExecuteAllChainsOpts
): Promise<ChainResult[]> {
  const { quotes, sweepPlan, address, walletRequest, destinationChainId, updateChainState } = opts
  const sweepMode = opts.sweepMode ?? 'batch'

  // Group quotes by source chain
  const byChain = new Map<number, Quote[]>()
  for (const q of quotes) {
    const arr = byChain.get(q.fromChainId) ?? []
    arr.push(q)
    byChain.set(q.fromChainId, arr)
  }

  const chainIds = Array.from(byChain.keys())

  const sharedOpts = {
    sweepPlan,
    address,
    walletRequest,
    destinationChainId,
    updateChainState,
    fetchFn: opts.fetchFn,
    sleepFn: opts.sleepFn,
    chainTimeoutMs: opts.chainTimeoutMs,
    maxBridgeRetries: opts.maxBridgeRetries,
  }

  // Fire all chains simultaneously (within each chain, sequential mode is applied per-step)
  const settled = await Promise.allSettled(
    chainIds.map((chainId) => {
      const chainOpts = {
        ...sharedOpts,
        chainId,
        chainQuotes: byChain.get(chainId)!,
      }
      return sweepMode === 'sequential'
        ? sweepSingleChainSequential(chainOpts)
        : sweepSingleChain(chainOpts)
    })
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
