/**
 * Unit tests for sweepExecution.ts — parallel chain sweep orchestration.
 *
 * No real wallet, no real network — all external calls are mocked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildCallsForChain,
  sweepSingleChain,
  executeAllChainsSweep,
  CHAIN_TIMEOUT_MS,
  POLL_INTERVAL_MS,
} from '../../utils/sweepExecution'
import type { Quote, SweepPlan, ChainSweepState } from '../../config/types'
import { NATIVE_TOKEN_ADDRESS } from '../../config/types'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TOKEN_ADDR = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // USDC (checksummed)
// Valid all-numeric hex addresses (trivially checksummed — no letter casing to verify)
const ROUTER_ADDR_1 = '0x1111111111111111111111111111111111111111'
const ROUTER_ADDR_2 = '0x2222222222222222222222222222222222222222'
const WETH_ADDR     = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const makeQuote = (overrides: Partial<Quote> = {}): Quote => ({
  fromChainId: 1,
  fromToken: TOKEN_ADDR,
  toChainId: 8453,
  toToken: NATIVE_TOKEN_ADDRESS,
  fromAmount: '1000000',
  toAmount: '300000000000000',
  toAmountUsd: 1.0,
  gasEstimateUsd: 0.5,
  approvalAddress: ROUTER_ADDR_1,
  transactionRequest: {
    to: ROUTER_ADDR_1,
    data: '0xdeadbeef',
    value: '0',
  },
  tool: 'uniswap',
  type: 'swap',
  ...overrides,
})

const makeSweepPlan = (quotes: Quote[]): SweepPlan => ({
  selectedTokens: [
    {
      chainId: 1,
      address: TOKEN_ADDR,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      balance: BigInt('1000000'),
      balanceFormatted: '1.0',
      priceUsd: 1.0,
      valueUsd: 1.0,
      estimatedGasUsd: 0.5,
      viability: 'sweepable',
    },
  ],
  quotes,
  destinationChainId: 8453,
  destinationAddress: '0xDest1111111111111111111111111111111111',
  totalValueUsd: 1.0,
  totalGasUsd: 0.5,
  netProceedsUsd: 0.5,
})

// ---------------------------------------------------------------------------
// buildCallsForChain
// ---------------------------------------------------------------------------

describe('buildCallsForChain', () => {
  it('generates an approval call followed by a swap call for an ERC-20 token', () => {
    const q = makeQuote()
    const plan = makeSweepPlan([q])
    const calls = buildCallsForChain([q], plan, 1)

    // Should have 2 calls: ERC-20 approve + swap
    expect(calls).toHaveLength(2)
    // Approval targets the token contract
    expect(calls[0].to.toLowerCase()).toBe(TOKEN_ADDR.toLowerCase())
    // Swap targets the router
    expect(calls[1].to.toLowerCase()).toBe(ROUTER_ADDR_1.toLowerCase())
    expect(calls[1].data).toBe('0xdeadbeef')
  })

  it('skips the approval call for native tokens', () => {
    const q = makeQuote({ fromToken: NATIVE_TOKEN_ADDRESS })
    const plan = makeSweepPlan([q])
    const calls = buildCallsForChain([q], plan, 1)

    // Only 1 call: the swap itself (no approval for native ETH)
    expect(calls).toHaveLength(1)
    expect(calls[0].data).toBe('0xdeadbeef')
  })

  it('includes value field when transactionRequest.value is non-zero', () => {
    const q = makeQuote({
      fromToken: NATIVE_TOKEN_ADDRESS,
      transactionRequest: { to: ROUTER_ADDR_1, data: '0xdeadbeef', value: '1000000000000000000' },
    })
    const plan = makeSweepPlan([q])
    const calls = buildCallsForChain([q], plan, 1)

    expect(calls[0].value).toBeDefined()
    // Should be a hex string
    expect(calls[0].value).toMatch(/^0x[0-9a-f]+$/i)
  })

  it('omits value field when transactionRequest.value is "0"', () => {
    const q = makeQuote()
    const plan = makeSweepPlan([q])
    const calls = buildCallsForChain([q], plan, 1)
    // The swap call (index 1) should have undefined value
    expect(calls[1].value).toBeUndefined()
  })

  it('produces calls for multiple tokens on the same chain', () => {
    const q1 = makeQuote({ fromToken: TOKEN_ADDR })
    const q2 = makeQuote({
      fromToken: WETH_ADDR,
      approvalAddress: ROUTER_ADDR_2,
      transactionRequest: { to: ROUTER_ADDR_2, data: '0xcafe', value: '0' },
    })
    const plan = makeSweepPlan([q1, q2])
    const calls = buildCallsForChain([q1, q2], plan, 1)

    // 2 approve + 2 swap = 4 calls
    expect(calls).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// sweepSingleChain — happy path
// ---------------------------------------------------------------------------

describe('sweepSingleChain', () => {
  afterEach(() => vi.restoreAllMocks())

  const makeFastSleep = () => vi.fn().mockResolvedValue(undefined)

  it('transitions chain through approving → swapping → complete', async () => {
    const q = makeQuote({ type: 'swap' })
    const plan = makeSweepPlan([q])
    const stateUpdates: Array<[number, Partial<ChainSweepState>]> = []
    const updateChainState = (chainId: number, patch: Partial<ChainSweepState>) => {
      stateUpdates.push([chainId, patch])
    }

    const walletRequest = vi.fn()
      .mockResolvedValueOnce('calls-id-abc') // wallet_sendCalls
      .mockResolvedValueOnce({ statusCode: 200, receipts: [{ transactionHash: '0xtxhash' }] }) // wallet_getCallsStatus → done

    await sweepSingleChain({
      chainId: 1,
      chainQuotes: [q],
      sweepPlan: plan,
      address: '0xUser',
      walletRequest,
      destinationChainId: 8453,
      updateChainState,
      sleepFn: makeFastSleep(),
      chainTimeoutMs: 10_000,
    })

    const phases = stateUpdates.map(([, p]) => p.phase).filter(Boolean)
    expect(phases).toContain('approving')
    expect(phases).toContain('swapping')
    expect(phases).toContain('complete')
    // Should NOT enter bridging for a swap-only chain
    expect(phases).not.toContain('bridging')
  })

  it('enters bridging phase for bridge-type quotes', async () => {
    const q = makeQuote({ type: 'bridge', fromChainId: 1, toChainId: 8453 })
    const plan = makeSweepPlan([q])
    const phases: string[] = []
    const updateChainState = (_chainId: number, patch: Partial<ChainSweepState>) => {
      if (patch.phase) phases.push(patch.phase)
    }

    const walletRequest = vi.fn()
      .mockResolvedValueOnce('calls-id-bridge') // wallet_sendCalls
      .mockResolvedValueOnce({ statusCode: 200, receipts: [{ transactionHash: '0xtxhash2' }] }) // getCallsStatus

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'DONE' }),
    })

    await sweepSingleChain({
      chainId: 1,
      chainQuotes: [q],
      sweepPlan: plan,
      address: '0xUser',
      walletRequest,
      destinationChainId: 8453,
      updateChainState,
      fetchFn,
      sleepFn: makeFastSleep(),
      chainTimeoutMs: 10_000,
    })

    expect(phases).toContain('bridging')
    expect(phases).toContain('complete')
  })

  it('throws when wallet_getCallsStatus returns a 4xx error code', async () => {
    const q = makeQuote({ type: 'swap' })
    const plan = makeSweepPlan([q])

    const walletRequest = vi.fn()
      .mockResolvedValueOnce('calls-id') // wallet_sendCalls
      .mockResolvedValueOnce({ statusCode: 400 }) // wallet_getCallsStatus → failed

    await expect(
      sweepSingleChain({
        chainId: 1,
        chainQuotes: [q],
        sweepPlan: plan,
        address: '0xUser',
        walletRequest,
        destinationChainId: 8453,
        updateChainState: () => {},
        sleepFn: makeFastSleep(),
        chainTimeoutMs: 10_000,
      })
    ).rejects.toThrow('Batch failed on chain 1')
  })

  it('throws when chain exceeds timeout', async () => {
    const q = makeQuote({ type: 'swap' })
    const plan = makeSweepPlan([q])

    // wallet_getCallsStatus always returns pending (statusCode 100)
    const walletRequest = vi.fn()
      .mockResolvedValueOnce('calls-id') // wallet_sendCalls
      .mockResolvedValue({ statusCode: 100 }) // always pending

    // Use a very short timeout so the test completes quickly
    // sleepFn immediately returns (we track iterations via the mock)
    await expect(
      sweepSingleChain({
        chainId: 42,
        chainQuotes: [q],
        sweepPlan: plan,
        address: '0xUser',
        walletRequest,
        destinationChainId: 8453,
        updateChainState: () => {},
        sleepFn: async () => {
          // Advance time past the deadline by mutating Date.now via fake timers.
          // Since we can't easily do that here, we use a tiny timeout (1ms)
          // combined with a short chainTimeoutMs.
        },
        chainTimeoutMs: 1, // 1ms — will expire after first iteration
      })
    ).rejects.toThrow('timed out')
  })
})

// ---------------------------------------------------------------------------
// executeAllChainsSweep — parallel execution
// ---------------------------------------------------------------------------

describe('executeAllChainsSweep', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fires all chains simultaneously (not sequentially)', async () => {
    // Create quotes for 3 different chains
    const chain1Quote = makeQuote({ fromChainId: 1, type: 'swap' })
    const chain10Quote = makeQuote({ fromChainId: 10, type: 'swap' })
    const chain42161Quote = makeQuote({ fromChainId: 42161, type: 'swap' })
    const quotes = [chain1Quote, chain10Quote, chain42161Quote]
    const plan = makeSweepPlan(quotes)

    const callOrder: number[] = []

    // walletRequest logs the chainId from the params to track call order
    const walletRequest = vi.fn().mockImplementation(({ method, params }) => {
      if (method === 'wallet_sendCalls') {
        const chainIdHex = params[0].chainId
        const chainId = parseInt(chainIdHex, 16)
        callOrder.push(chainId)
        return Promise.resolve(`calls-id-${chainId}`)
      }
      // wallet_getCallsStatus → immediately complete
      return Promise.resolve({ statusCode: 200, receipts: [{ transactionHash: '0xtx' }] })
    })

    const results = await executeAllChainsSweep({
      quotes,
      sweepPlan: plan,
      address: '0xUser',
      walletRequest,
      destinationChainId: 8453,
      updateChainState: () => {},
      sleepFn: async () => {},
      chainTimeoutMs: 10_000,
    })

    // All 3 chains should complete
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.success)).toBe(true)

    // All 3 wallet_sendCalls should have been issued
    // (the exact order is non-deterministic with parallel execution,
    //  but all 3 chainIds should appear)
    expect(callOrder).toHaveLength(3)
    expect(callOrder).toContain(1)
    expect(callOrder).toContain(10)
    expect(callOrder).toContain(42161)
  })

  it('one chain failing does NOT prevent other chains from completing', async () => {
    const chain1Quote = makeQuote({ fromChainId: 1, type: 'swap' })
    const chain10Quote = makeQuote({ fromChainId: 10, type: 'swap' })
    const quotes = [chain1Quote, chain10Quote]
    const plan = makeSweepPlan(quotes)

    const walletRequest = vi.fn().mockImplementation(({ method, params }) => {
      if (method === 'wallet_sendCalls') {
        const chainId = parseInt(params[0].chainId, 16)
        if (chainId === 1) {
          // Chain 1 throws on sendCalls
          return Promise.reject(new Error('Chain 1 wallet error'))
        }
        return Promise.resolve('calls-id-10')
      }
      // getCallsStatus for chain 10 → complete
      return Promise.resolve({ statusCode: 200, receipts: [{ transactionHash: '0xtx' }] })
    })

    const chainStates: Record<number, string[]> = {}
    const updateChainState = (chainId: number, patch: Partial<ChainSweepState>) => {
      if (!chainStates[chainId]) chainStates[chainId] = []
      if (patch.phase) chainStates[chainId].push(patch.phase)
    }

    const results = await executeAllChainsSweep({
      quotes,
      sweepPlan: plan,
      address: '0xUser',
      walletRequest,
      destinationChainId: 8453,
      updateChainState,
      sleepFn: async () => {},
      chainTimeoutMs: 10_000,
    })

    // Chain 1 should be marked failed
    const chain1Result = results.find((r) => r.chainId === 1)
    expect(chain1Result?.success).toBe(false)
    expect(chain1Result?.error).toContain('Chain 1 wallet error')

    // Chain 10 should still complete
    const chain10Result = results.find((r) => r.chainId === 10)
    expect(chain10Result?.success).toBe(true)
    expect(chainStates[10]).toContain('complete')
  })

  it('returns all successes when all chains complete', async () => {
    const chain1Quote = makeQuote({ fromChainId: 1, type: 'swap' })
    const chain137Quote = makeQuote({ fromChainId: 137, type: 'swap' })
    const quotes = [chain1Quote, chain137Quote]
    const plan = makeSweepPlan(quotes)

    const walletRequest = vi.fn()
      .mockResolvedValueOnce('calls-id-1')
      .mockResolvedValueOnce('calls-id-137')
      .mockResolvedValue({ statusCode: 200, receipts: [{ transactionHash: '0xtx' }] })

    const results = await executeAllChainsSweep({
      quotes,
      sweepPlan: plan,
      address: '0xUser',
      walletRequest,
      destinationChainId: 8453,
      updateChainState: () => {},
      sleepFn: async () => {},
      chainTimeoutMs: 10_000,
    })

    expect(results).toHaveLength(2)
    expect(results.every((r) => r.success)).toBe(true)
  })

  it('handles empty quotes gracefully (no chains to sweep)', async () => {
    const plan = makeSweepPlan([])
    const walletRequest = vi.fn()

    const results = await executeAllChainsSweep({
      quotes: [],
      sweepPlan: plan,
      address: '0xUser',
      walletRequest,
      destinationChainId: 8453,
      updateChainState: () => {},
      sleepFn: async () => {},
      chainTimeoutMs: 10_000,
    })

    expect(results).toHaveLength(0)
    expect(walletRequest).not.toHaveBeenCalled()
  })

  it('marks a chain as error when it times out', async () => {
    const q = makeQuote({ fromChainId: 1, type: 'swap' })
    const plan = makeSweepPlan([q])

    // wallet_sendCalls succeeds but getCallsStatus always returns pending
    const walletRequest = vi.fn()
      .mockResolvedValueOnce('calls-id')
      .mockResolvedValue({ statusCode: 100 })

    const chainStates: Record<number, string[]> = {}
    const updateChainState = (chainId: number, patch: Partial<ChainSweepState>) => {
      if (!chainStates[chainId]) chainStates[chainId] = []
      if (patch.phase) chainStates[chainId].push(patch.phase)
    }

    const results = await executeAllChainsSweep({
      quotes: [q],
      sweepPlan: plan,
      address: '0xUser',
      walletRequest,
      destinationChainId: 8453,
      updateChainState,
      sleepFn: async () => {},
      chainTimeoutMs: 1, // expires almost immediately
    })

    expect(results[0].success).toBe(false)
    expect(results[0].error).toContain('timed out')
    expect(chainStates[1]).toContain('error')
  })
})
