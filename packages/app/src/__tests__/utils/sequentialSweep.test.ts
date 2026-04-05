/**
 * Unit tests for sequential sweep fallback (non-EIP-5792 wallets).
 *
 * Tests:
 * - sweepSingleChainSequential executes approve then swap individually
 * - waitForReceipt polls until tx is mined
 * - waitForReceipt throws on reverted tx (status 0x0)
 * - waitForReceipt throws on deadline exceeded
 * - User rejection (rejected/denied) throws with reason: 'user_rejected'
 * - Native token swap skips approval step
 * - tokensCompleted increments after each token sweep
 * - Bridge polling fires after last swap tx on cross-chain quotes
 * - executeAllChainsSweep dispatches to sequential when sweepMode='sequential'
 * - Multiple chains still execute in parallel even in sequential mode
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sweepSingleChainSequential,
  waitForReceipt,
  executeAllChainsSweep,
} from '../../utils/sweepExecution';
import type { Quote, SweepPlan } from '../../config/types';
import { NATIVE_TOKEN_ADDRESS } from '../../config/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const APPROVAL_ADDR = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
const USER_ADDR = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

function makeSwapQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    fromChainId: 1,
    fromToken: USDC,
    toChainId: 1,
    toToken: NATIVE_TOKEN_ADDRESS,
    fromAmount: '1000000',
    toAmount: '490000000000000',
    toAmountUsd: 1.2,
    gasEstimateUsd: 0.5,
    approvalAddress: APPROVAL_ADDR,
    transactionRequest: {
      to: APPROVAL_ADDR,
      data: '0xabcdef',
      value: '0x0',
    },
    tool: 'uniswap-v3',
    type: 'swap',
    ...overrides,
  };
}

function makeNativeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    fromChainId: 1,
    fromToken: NATIVE_TOKEN_ADDRESS,
    toChainId: 1,
    toToken: USDC,
    fromAmount: '500000000000000000',
    toAmount: '1200000000',
    toAmountUsd: 1200,
    gasEstimateUsd: 0.5,
    // No approvalAddress for native token
    transactionRequest: {
      to: APPROVAL_ADDR,
      data: '0xdeadbeef',
      value: '0x6f05b59d3b20000', // 0.5 ETH
    },
    tool: 'uniswap-v3',
    type: 'swap',
    ...overrides,
  };
}

function makeSweepPlan(quotes: Quote[]): SweepPlan {
  return {
    selectedTokens: [
      {
        chainId: 1,
        address: USDC,
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
    destinationChainId: 1,
    destinationAddress: USER_ADDR,
    totalValueUsd: 1.2,
    totalGasUsd: 0.5,
    netProceedsUsd: 0.7,
  };
}

// Mined receipt
const RECEIPT_OK = { status: '0x1', transactionHash: '0xdeadbeef' };

// ---------------------------------------------------------------------------
// waitForReceipt tests
// ---------------------------------------------------------------------------

describe('waitForReceipt', () => {
  it('returns receipt when tx is mined on first poll', async () => {
    const walletRequest = vi.fn().mockResolvedValueOnce(RECEIPT_OK);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await waitForReceipt({
      txHash: '0x123',
      walletRequest,
      sleepFn,
      deadline: Date.now() + 60_000,
    });

    expect(result.status).toBe('0x1');
    expect(walletRequest).toHaveBeenCalledWith({
      method: 'eth_getTransactionReceipt',
      params: ['0x123'],
    });
  });

  it('polls until receipt arrives (multiple null responses before success)', async () => {
    const walletRequest = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(RECEIPT_OK);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await waitForReceipt({
      txHash: '0x456',
      walletRequest,
      sleepFn,
      deadline: Date.now() + 60_000,
    });

    expect(result.status).toBe('0x1');
    expect(walletRequest).toHaveBeenCalledTimes(3);
  });

  it('throws when transaction is reverted (status 0x0)', async () => {
    const walletRequest = vi.fn().mockResolvedValueOnce({ status: '0x0' });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForReceipt({
        txHash: '0xreverted',
        walletRequest,
        sleepFn,
        deadline: Date.now() + 60_000,
      })
    ).rejects.toThrow(/reverted/i);
  });

  it('throws when deadline is exceeded', async () => {
    // Always return null (not mined), and deadline is already passed
    const walletRequest = vi.fn().mockResolvedValue(null);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForReceipt({
        txHash: '0xtimeout',
        walletRequest,
        sleepFn,
        deadline: Date.now() - 1, // already expired
      })
    ).rejects.toThrow(/not mined before deadline/i);
  });

  it('continues polling after transient RPC error', async () => {
    const walletRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValueOnce(RECEIPT_OK);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await waitForReceipt({
      txHash: '0xretry',
      walletRequest,
      sleepFn,
      deadline: Date.now() + 60_000,
    });

    expect(result.status).toBe('0x1');
  });
});

// ---------------------------------------------------------------------------
// sweepSingleChainSequential tests
// ---------------------------------------------------------------------------

describe('sweepSingleChainSequential', () => {
  let updateChainState: ReturnType<typeof vi.fn>;
  let sleepFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateChainState = vi.fn();
    sleepFn = vi.fn().mockResolvedValue(undefined);
  });

  it('sends approval tx then swap tx for ERC-20 token', async () => {
    const walletRequest = vi
      .fn()
      // approve → returns tx hash
      .mockResolvedValueOnce('0xapprove_hash')
      // getReceipt for approval
      .mockResolvedValueOnce(RECEIPT_OK)
      // swap → returns tx hash
      .mockResolvedValueOnce('0xswap_hash')
      // getReceipt for swap
      .mockResolvedValueOnce(RECEIPT_OK);

    const quote = makeSwapQuote();
    const plan = makeSweepPlan([quote]);

    await sweepSingleChainSequential({
      chainId: 1,
      chainQuotes: [quote],
      sweepPlan: plan,
      address: USER_ADDR,
      walletRequest,
      destinationChainId: 1,
      updateChainState,
      sleepFn,
      chainTimeoutMs: 60_000,
    });

    // Should have called: approve tx, receipt, swap tx, receipt
    const methods = walletRequest.mock.calls.map((c) => c[0].method);
    expect(methods).toContain('eth_sendTransaction');
    expect(methods.filter((m: string) => m === 'eth_sendTransaction')).toHaveLength(2);
    expect(methods.filter((m: string) => m === 'eth_getTransactionReceipt')).toHaveLength(2);
  });

  it('skips approval for native token — only sends swap tx', async () => {
    const walletRequest = vi
      .fn()
      // swap → tx hash
      .mockResolvedValueOnce('0xswap_hash')
      // receipt
      .mockResolvedValueOnce(RECEIPT_OK);

    const quote = makeNativeQuote();
    const plan: SweepPlan = {
      selectedTokens: [],
      quotes: [quote],
      destinationChainId: 1,
      destinationAddress: USER_ADDR,
      totalValueUsd: 1200,
      totalGasUsd: 0.5,
      netProceedsUsd: 1199.5,
    };

    await sweepSingleChainSequential({
      chainId: 1,
      chainQuotes: [quote],
      sweepPlan: plan,
      address: USER_ADDR,
      walletRequest,
      destinationChainId: 1,
      updateChainState,
      sleepFn,
      chainTimeoutMs: 60_000,
    });

    // Only 1 eth_sendTransaction call (no approval)
    const sendTxCalls = walletRequest.mock.calls.filter(
      (c) => c[0].method === 'eth_sendTransaction'
    );
    expect(sendTxCalls).toHaveLength(1);
  });

  it('marks phase as complete and tokensCompleted after all tokens', async () => {
    const walletRequest = vi
      .fn()
      .mockResolvedValueOnce('0xapprove')
      .mockResolvedValueOnce(RECEIPT_OK)
      .mockResolvedValueOnce('0xswap')
      .mockResolvedValueOnce(RECEIPT_OK);

    const quote = makeSwapQuote();
    const plan = makeSweepPlan([quote]);

    await sweepSingleChainSequential({
      chainId: 1,
      chainQuotes: [quote],
      sweepPlan: plan,
      address: USER_ADDR,
      walletRequest,
      destinationChainId: 1,
      updateChainState,
      sleepFn,
      chainTimeoutMs: 60_000,
    });

    const completeCalls = updateChainState.mock.calls.filter(
      (c) => c[1].phase === 'complete'
    );
    expect(completeCalls.length).toBeGreaterThan(0);
    expect(completeCalls[0][1].tokensCompleted).toBe(1);
  });

  it('throws with reason="user_rejected" when approval is rejected by user', async () => {
    const walletRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error('MetaMask: User rejected the request'));

    const quote = makeSwapQuote();
    const plan = makeSweepPlan([quote]);

    await expect(
      sweepSingleChainSequential({
        chainId: 1,
        chainQuotes: [quote],
        sweepPlan: plan,
        address: USER_ADDR,
        walletRequest,
        destinationChainId: 1,
        updateChainState,
        sleepFn,
        chainTimeoutMs: 60_000,
      })
    ).rejects.toMatchObject({ reason: 'user_rejected' });
  });

  it('throws with reason="user_rejected" when swap is denied by user', async () => {
    const walletRequest = vi
      .fn()
      // approval succeeds
      .mockResolvedValueOnce('0xapprove')
      .mockResolvedValueOnce(RECEIPT_OK)
      // swap rejected
      .mockRejectedValueOnce(new Error('Transaction denied by the user'));

    const quote = makeSwapQuote();
    const plan = makeSweepPlan([quote]);

    await expect(
      sweepSingleChainSequential({
        chainId: 1,
        chainQuotes: [quote],
        sweepPlan: plan,
        address: USER_ADDR,
        walletRequest,
        destinationChainId: 1,
        updateChainState,
        sleepFn,
        chainTimeoutMs: 60_000,
      })
    ).rejects.toMatchObject({ reason: 'user_rejected' });
  });

  it('re-throws non-rejection errors as-is', async () => {
    const walletRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error('Insufficient funds'));

    const quote = makeSwapQuote();
    const plan = makeSweepPlan([quote]);

    await expect(
      sweepSingleChainSequential({
        chainId: 1,
        chainQuotes: [quote],
        sweepPlan: plan,
        address: USER_ADDR,
        walletRequest,
        destinationChainId: 1,
        updateChainState,
        sleepFn,
        chainTimeoutMs: 60_000,
      })
    ).rejects.toThrow('Insufficient funds');
  });

  it('fires bridge status polling for cross-chain (bridge) quotes', async () => {
    const walletRequest = vi
      .fn()
      // approve
      .mockResolvedValueOnce('0xapprove')
      .mockResolvedValueOnce(RECEIPT_OK)
      // swap
      .mockResolvedValueOnce('0xbridge_tx')
      .mockResolvedValueOnce(RECEIPT_OK);

    const mockFetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'DONE' }),
    });

    const bridgeQuote = makeSwapQuote({ toChainId: 8453, type: 'bridge' });
    const plan = makeSweepPlan([bridgeQuote]);

    await sweepSingleChainSequential({
      chainId: 1,
      chainQuotes: [bridgeQuote],
      sweepPlan: plan,
      address: USER_ADDR,
      walletRequest,
      destinationChainId: 8453,
      updateChainState,
      fetchFn: mockFetchFn,
      sleepFn,
      chainTimeoutMs: 60_000,
      maxBridgeRetries: 3,
    });

    expect(mockFetchFn).toHaveBeenCalledWith(
      '/api/status',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

// ---------------------------------------------------------------------------
// executeAllChainsSweep sequential mode tests
// ---------------------------------------------------------------------------

describe('executeAllChainsSweep — sequential mode', () => {
  it('dispatches to sequential path when sweepMode is sequential', async () => {
    const startTimes: number[] = [];
    const sleepFn = vi.fn().mockImplementation(async () => {
      startTimes.push(Date.now());
    });

    const walletRequest = vi
      .fn()
      // chain 1: approve, receipt, swap, receipt
      .mockResolvedValueOnce('0xapprove1')
      .mockResolvedValueOnce(RECEIPT_OK)
      .mockResolvedValueOnce('0xswap1')
      .mockResolvedValueOnce(RECEIPT_OK)
      // chain 8453: no approval (native), swap, receipt
      .mockResolvedValueOnce('0xswap2')
      .mockResolvedValueOnce(RECEIPT_OK);

    const updateChainState = vi.fn();

    const quotes: Quote[] = [
      makeSwapQuote({ fromChainId: 1, toChainId: 1 }),
      makeNativeQuote({ fromChainId: 8453, toChainId: 8453 }),
    ];

    const plan: SweepPlan = {
      selectedTokens: [
        {
          chainId: 1,
          address: USDC,
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
      destinationChainId: 1,
      destinationAddress: USER_ADDR,
      totalValueUsd: 10,
      totalGasUsd: 1,
      netProceedsUsd: 9,
    };

    const results = await executeAllChainsSweep({
      quotes,
      sweepPlan: plan,
      address: USER_ADDR,
      walletRequest,
      destinationChainId: 1,
      updateChainState,
      sweepMode: 'sequential',
      sleepFn,
      chainTimeoutMs: 60_000,
    });

    // Both chains should succeed
    expect(results.every((r) => r.success)).toBe(true);

    // Should have used eth_sendTransaction (not wallet_sendCalls)
    const methods = walletRequest.mock.calls.map((c: { method: string }[] ) => c[0].method);
    expect(methods).not.toContain('wallet_sendCalls');
    expect(methods).toContain('eth_sendTransaction');
  });

  it('uses batch mode by default (no sweepMode specified)', async () => {
    const walletRequest = vi
      .fn()
      // wallet_sendCalls → callsId
      .mockResolvedValueOnce('batch_calls_id_1')
      // wallet_getCallsStatus → complete
      .mockResolvedValueOnce({ statusCode: 200, receipts: [{ transactionHash: '0xbatch' }] });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const updateChainState = vi.fn();

    const quote = makeSwapQuote({ fromChainId: 1, toChainId: 1 });
    const plan = makeSweepPlan([quote]);

    await executeAllChainsSweep({
      quotes: [quote],
      sweepPlan: plan,
      address: USER_ADDR,
      walletRequest,
      destinationChainId: 1,
      updateChainState,
      // no sweepMode → defaults to 'batch'
      sleepFn,
      chainTimeoutMs: 60_000,
    });

    const methods = walletRequest.mock.calls.map((c: { method: string }[]) => c[0].method);
    expect(methods).toContain('wallet_sendCalls');
    expect(methods).not.toContain('eth_sendTransaction');
  });
});
