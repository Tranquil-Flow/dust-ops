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

  mockGetSwapQuote.mockResolvedValue(mockSwapQuote);
  mockGetBridgeQuote.mockResolvedValue(mockBridgeQuote);
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
});
