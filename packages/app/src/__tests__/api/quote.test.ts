/**
 * Integration tests for /api/quote route.
 *
 * Tests:
 * - Input validation (required fields, type validation)
 * - Successful swap and bridge quote responses
 * - Quote caching: 30s TTL behavior
 * - Error propagation from provider (502)
 * - Rate limit / provider errors
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock the swap provider module
// ---------------------------------------------------------------------------
const mockGetSwapQuote = vi.fn();
const mockGetBridgeQuote = vi.fn();
const mockGetStatus = vi.fn();

vi.mock('../../utils/providers', () => ({
  getSwapProvider: vi.fn(() => ({
    getSwapQuote: mockGetSwapQuote,
    getBridgeQuote: mockGetBridgeQuote,
    getStatus: mockGetStatus,
  })),
}));

vi.mock('../../config/demo', () => ({
  isDemoMode: vi.fn(() => false),
  DEMO_WALLET_ADDRESS: '0x1234567890abcdef1234567890abcdef12345678',
}));

// ---------------------------------------------------------------------------
// Mock the price oracle module to control pre-filter behavior in tests
// ---------------------------------------------------------------------------
const mockShouldFilterToken = vi.fn();

vi.mock('../../utils/priceOracle', () => ({
  shouldFilterToken: (...args: unknown[]) => mockShouldFilterToken(...args),
  MIN_QUOTE_THRESHOLD_USD: 1.0,
  PRICE_ORACLE: 'defillama',
}));

// Dynamic import AFTER mocks are set up
const { POST } = await import('../../app/api/quote/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRequestRaw(bodyStr: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  });
}

const VALID_SWAP_BODY = {
  fromChainId: 1,
  fromToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  toChainId: 1,
  toToken: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  fromAmount: '42000000',
  fromAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  type: 'swap',
};

const VALID_BRIDGE_BODY = {
  fromChainId: 1,
  fromToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  toChainId: 8453,
  toToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  fromAmount: '42000000',
  fromAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  type: 'bridge',
};

const mockSwapQuote = {
  id: '0xabc123',
  fromChainId: 1,
  fromToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  toChainId: 1,
  toToken: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  fromAmount: '42000000',
  toAmount: '41790000',
  toAmountUsd: 41.79,
  gasEstimateUsd: 2.5,
  approvalAddress: '0x1111111254eeb25477b68fb85ed929f73a960582',
  transactionRequest: {
    to: '0x1111111254eeb25477b68fb85ed929f73a960582',
    data: '0xdeadbeef',
    value: '0x0',
    gasLimit: '0x55730',
  },
  tool: 'uniswap-v3',
  type: 'swap' as const,
};

const mockBridgeQuote = {
  id: '0xdef456',
  fromChainId: 1,
  fromToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  toChainId: 8453,
  toToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  fromAmount: '42000000',
  toAmount: '41664000',
  toAmountUsd: 41.66,
  gasEstimateUsd: 3.2,
  approvalAddress: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  transactionRequest: {
    to: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    data: '0xcafebabe',
    value: '0x0',
    gasLimit: '0x7a120',
  },
  tool: 'stargate',
  type: 'bridge' as const,
};

beforeEach(() => {
  mockGetSwapQuote.mockReset();
  mockGetBridgeQuote.mockReset();
  mockGetStatus.mockReset();
  mockShouldFilterToken.mockReset();

  mockGetSwapQuote.mockResolvedValue(mockSwapQuote);
  mockGetBridgeQuote.mockResolvedValue(mockBridgeQuote);
  // Default: oracle pre-filter passes through (not filtered)
  mockShouldFilterToken.mockResolvedValue({ filtered: false, valueUsd: 42.0, threshold: 1.0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/quote', () => {
  describe('input validation', () => {
    it('returns 400 for invalid JSON', async () => {
      const req = makeRequestRaw('{bad json');
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid json/i);
    });

    it('returns 400 when fromChainId is missing', async () => {
      const req = makeRequest({ ...VALID_SWAP_BODY, fromChainId: undefined });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/missing required fields/i);
    });

    it('returns 400 when fromToken is missing', async () => {
      const { fromToken: _, ...body } = VALID_SWAP_BODY;
      const req = makeRequest(body);
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when toChainId is missing', async () => {
      const { toChainId: _, ...body } = VALID_SWAP_BODY;
      const req = makeRequest(body);
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when toToken is missing', async () => {
      const { toToken: _, ...body } = VALID_SWAP_BODY;
      const req = makeRequest(body);
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when fromAmount is missing', async () => {
      const { fromAmount: _, ...body } = VALID_SWAP_BODY;
      const req = makeRequest(body);
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when fromAddress is missing', async () => {
      const { fromAddress: _, ...body } = VALID_SWAP_BODY;
      const req = makeRequest(body);
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when type is missing', async () => {
      const { type: _, ...body } = VALID_SWAP_BODY;
      const req = makeRequest(body);
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when type is not "swap" or "bridge"', async () => {
      const req = makeRequest({ ...VALID_SWAP_BODY, type: 'flashloan' });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/type must be/i);
    });
  });

  describe('swap quotes', () => {
    it('returns 200 with swap quote for valid swap request', async () => {
      const req = makeRequest({ ...VALID_SWAP_BODY, fromAmount: 'swap_200_test' });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('swap');
      expect(body.tool).toBe('uniswap-v3');
    });

    it('calls getSwapQuote (not getBridgeQuote) for swap type', async () => {
      // Use unique fromAmount to avoid cache hits from other tests
      const req = makeRequest({ ...VALID_SWAP_BODY, fromAmount: 'swap_call_count_test' });
      await POST(req);
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(1);
      expect(mockGetBridgeQuote).not.toHaveBeenCalled();
    });

    it('passes correct params to getSwapQuote', async () => {
      const testBody = { ...VALID_SWAP_BODY, fromAmount: 'swap_params_test' };
      const req = makeRequest(testBody);
      await POST(req);
      const [params] = mockGetSwapQuote.mock.calls[0];
      expect(params.fromChainId).toBe(1);
      expect(params.fromToken).toBe(VALID_SWAP_BODY.fromToken);
      expect(params.toToken).toBe(VALID_SWAP_BODY.toToken);
      expect(params.fromAmount).toBe('swap_params_test');
      expect(params.fromAddress).toBe(VALID_SWAP_BODY.fromAddress);
    });

    it('includes all quote fields in response', async () => {
      const req = makeRequest({ ...VALID_SWAP_BODY, fromAmount: 'swap_fields_test' });
      const res = await POST(req);
      const body = await res.json();
      expect(body.id).toBe('0xabc123');
      expect(body.fromChainId).toBe(1);
      expect(body.toAmount).toBe('41790000');
      expect(body.toAmountUsd).toBe(41.79);
      expect(body.gasEstimateUsd).toBe(2.5);
      expect(body.transactionRequest).toBeDefined();
      expect(body.transactionRequest.to).toBeDefined();
    });

    it('passes optional toAddress to getSwapQuote when provided', async () => {
      const req = makeRequest({
        ...VALID_SWAP_BODY,
        fromAmount: 'swap_toaddr_test',
        toAddress: '0x9999999999999999999999999999999999999999',
      });
      await POST(req);
      const [params] = mockGetSwapQuote.mock.calls[0];
      expect(params.toAddress).toBe('0x9999999999999999999999999999999999999999');
    });
  });

  describe('bridge quotes', () => {
    it('returns 200 with bridge quote for valid bridge request', async () => {
      const req = makeRequest({ ...VALID_BRIDGE_BODY, fromAmount: 'bridge_200_test' });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('bridge');
      expect(body.tool).toBe('stargate');
    });

    it('calls getBridgeQuote (not getSwapQuote) for bridge type', async () => {
      const req = makeRequest({ ...VALID_BRIDGE_BODY, fromAmount: 'bridge_call_count_test' });
      await POST(req);
      expect(mockGetBridgeQuote).toHaveBeenCalledTimes(1);
      expect(mockGetSwapQuote).not.toHaveBeenCalled();
    });

    it('passes correct params to getBridgeQuote including toChainId', async () => {
      const req = makeRequest({ ...VALID_BRIDGE_BODY, fromAmount: 'bridge_params_test' });
      await POST(req);
      const [params] = mockGetBridgeQuote.mock.calls[0];
      expect(params.fromChainId).toBe(1);
      expect(params.toChainId).toBe(8453);
      expect(params.fromToken).toBe(VALID_BRIDGE_BODY.fromToken);
      expect(params.toToken).toBe(VALID_BRIDGE_BODY.toToken);
    });

    it('bridge quote has cross-chain details', async () => {
      const req = makeRequest({ ...VALID_BRIDGE_BODY, fromAmount: 'bridge_xchain_test' });
      const res = await POST(req);
      const body = await res.json();
      expect(body.fromChainId).toBe(1);
      expect(body.toChainId).toBe(8453);
    });
  });

  describe('caching (30s TTL)', () => {
    it('returns cached result on second identical request (no second provider call)', async () => {
      // Note: The cache is module-level in the route, so it persists across tests.
      // We use a unique body to avoid collisions with other tests.
      const uniqueBody = {
        ...VALID_SWAP_BODY,
        fromAmount: '99999999', // unique amount
      };

      const req1 = makeRequest(uniqueBody);
      const res1 = await POST(req1);
      expect(res1.status).toBe(200);
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(1);

      // Second request with same body — should use cache
      const req2 = makeRequest(uniqueBody);
      const res2 = await POST(req2);
      expect(res2.status).toBe(200);
      // Provider should NOT be called again
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(1);
    });

    it('cached response contains same data as original', async () => {
      const uniqueBody = {
        ...VALID_SWAP_BODY,
        fromAmount: '88888888', // unique amount
      };

      const req1 = makeRequest(uniqueBody);
      const res1 = await POST(req1);
      const body1 = await res1.json();

      const req2 = makeRequest(uniqueBody);
      const res2 = await POST(req2);
      const body2 = await res2.json();

      expect(body1).toEqual(body2);
    });

    it('different request params bypass cache', async () => {
      const req1 = makeRequest({ ...VALID_SWAP_BODY, fromAmount: '11111111' });
      await POST(req1);

      const req2 = makeRequest({ ...VALID_SWAP_BODY, fromAmount: '22222222' });
      await POST(req2);

      // Two different requests = two provider calls
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(2);
    });

    it('cache expires after TTL (simulated by advancing time)', async () => {
      const uniqueBody = {
        ...VALID_SWAP_BODY,
        fromAmount: '77777777', // unique amount for this test
      };

      vi.useFakeTimers();

      const req1 = makeRequest(uniqueBody);
      await POST(req1);
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(1);

      // Advance time past 30s TTL
      vi.advanceTimersByTime(31_000);

      const req2 = makeRequest(uniqueBody);
      await POST(req2);
      // Cache expired, should call provider again
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('returns 502 when provider throws an Error', async () => {
      mockGetSwapQuote.mockRejectedValueOnce(new Error('LI.FI API unavailable'));

      // Use a unique fromAmount to avoid cache from other tests
      const req = makeRequest({ ...VALID_SWAP_BODY, fromAmount: '55555555' });
      const res = await POST(req);
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe('LI.FI API unavailable');
    });

    it('returns 502 when bridge provider throws', async () => {
      mockGetBridgeQuote.mockRejectedValueOnce(new Error('No route found'));

      const req = makeRequest({ ...VALID_BRIDGE_BODY, fromAmount: '33333333' });
      const res = await POST(req);
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe('No route found');
    });

    it('returns 502 with "Unknown error" for non-Error thrown values', async () => {
      mockGetSwapQuote.mockRejectedValueOnce('string error from provider');

      const req = makeRequest({ ...VALID_SWAP_BODY, fromAmount: '44444444' });
      const res = await POST(req);
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe('Unknown error');
    });

    it('does not cache failed responses', async () => {
      const uniqueBody = { ...VALID_SWAP_BODY, fromAmount: '66666666' };

      // First request fails
      mockGetSwapQuote.mockRejectedValueOnce(new Error('Temporary failure'));
      const req1 = makeRequest(uniqueBody);
      const res1 = await POST(req1);
      expect(res1.status).toBe(502);

      // Second request should succeed and call provider again (not return cached error)
      mockGetSwapQuote.mockResolvedValueOnce(mockSwapQuote);
      const req2 = makeRequest(uniqueBody);
      const res2 = await POST(req2);
      expect(res2.status).toBe(200);
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(2);
    });

    it('handles rate limit errors from provider (502)', async () => {
      mockGetSwapQuote.mockRejectedValueOnce(
        new Error('Rate limit exceeded: too many requests')
      );

      const req = makeRequest({ ...VALID_SWAP_BODY, fromAmount: '12341234' });
      const res = await POST(req);
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toContain('Rate limit exceeded');
    });
  });

  describe('price oracle pre-filter', () => {
    it('returns 422 with filtered=true when oracle says token is below threshold', async () => {
      mockShouldFilterToken.mockResolvedValueOnce({
        filtered: true,
        valueUsd: 0.45,
        threshold: 1.0,
        reason: 'Token value $0.4500 is below minimum quote threshold $1.00',
      });

      const req = makeRequest({ ...VALID_SWAP_BODY, fromAmount: 'filter_test_1', fromValueUsd: 0.45, fromDecimals: 6 });
      const res = await POST(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.filtered).toBe(true);
      expect(body.threshold).toBe(1.0);
      expect(body.valueUsd).toBe(0.45);
      expect(body.reason).toMatch(/below minimum/i);
    });

    it('does not call LI.FI provider when oracle filters token', async () => {
      mockShouldFilterToken.mockResolvedValueOnce({
        filtered: true,
        valueUsd: 0.05,
        threshold: 1.0,
        reason: 'Token value $0.0500 is below minimum quote threshold $1.00',
      });

      const req = makeRequest({ ...VALID_SWAP_BODY, fromAmount: 'filter_no_lifi_test' });
      await POST(req);
      expect(mockGetSwapQuote).not.toHaveBeenCalled();
      expect(mockGetBridgeQuote).not.toHaveBeenCalled();
    });

    it('proceeds to LI.FI when oracle passes through token', async () => {
      // mockShouldFilterToken already returns filtered: false in beforeEach
      const req = makeRequest({ ...VALID_SWAP_BODY, fromAmount: 'filter_pass_test', fromValueUsd: 15.0 });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(1);
    });

    it('proceeds to LI.FI when oracle returns null valueUsd (unknown price → optimistic)', async () => {
      mockShouldFilterToken.mockResolvedValueOnce({
        filtered: false,
        valueUsd: null,
        threshold: 1.0,
      });

      const req = makeRequest({ ...VALID_SWAP_BODY, fromAmount: 'filter_null_test', fromValueUsd: null });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(1);
    });

    it('passes fromValueUsd and fromDecimals to shouldFilterToken', async () => {
      const req = makeRequest({
        ...VALID_SWAP_BODY,
        fromAmount: 'filter_params_test',
        fromValueUsd: 3.50,
        fromDecimals: 6,
      });
      await POST(req);

      expect(mockShouldFilterToken).toHaveBeenCalledWith(
        expect.objectContaining({
          valueUsd: 3.50,
        })
      );
    });

    it('does not include fromDecimals/fromValueUsd in cache key (cache key is stable)', async () => {
      // Two requests with same core params but different fromValueUsd should share cache
      const baseBody = { ...VALID_SWAP_BODY, fromAmount: 'cache_key_stable_test' };

      // First request
      const req1 = makeRequest({ ...baseBody, fromValueUsd: 10.0, fromDecimals: 6 });
      const res1 = await POST(req1);
      expect(res1.status).toBe(200);
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(1);

      // Second request with different fromValueUsd — should still hit cache
      const req2 = makeRequest({ ...baseBody, fromValueUsd: 20.0, fromDecimals: 18 });
      const res2 = await POST(req2);
      expect(res2.status).toBe(200);
      // Provider should NOT be called again — cached
      expect(mockGetSwapQuote).toHaveBeenCalledTimes(1);
    });
  });
});
