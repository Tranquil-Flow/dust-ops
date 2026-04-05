/**
 * Integration tests for /api/scan route.
 *
 * Strategy: Mock the `createScanner` function from the scanners module so we
 * can control token responses without making real HTTP calls. We import the
 * route handler directly and construct NextRequest objects manually.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock the scanner module before importing the route
// ---------------------------------------------------------------------------
const mockFetchTokenBalances = vi.fn();

vi.mock('../../utils/scanners', () => ({
  createScanner: vi.fn(() => ({
    fetchTokenBalances: mockFetchTokenBalances,
  })),
}));

// Mock demo config to ensure deterministic behavior
vi.mock('../../config/demo', () => ({
  isDemoMode: vi.fn(() => false),
  DEMO_WALLET_ADDRESS: '0x1234567890abcdef1234567890abcdef12345678',
}));

// Mock the cache module so tests remain isolated (no cross-test cache pollution)
vi.mock('../../utils/cache', () => ({
  scanCache: {
    get: vi.fn().mockResolvedValue(null), // always a cache miss in tests
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  },
  quoteCache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  },
  RouteCache: vi.fn(),
  InMemoryBackend: vi.fn(),
}));

// We import AFTER mocking so the route sees the mocked dependencies
const { POST, DELETE } = await import('../../app/api/scan/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost:3000/api/scan', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRequestRaw(bodyStr: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  });
}

const VALID_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const mockTokens = [
  {
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    balance: '42000000',
  },
  {
    address: '0xeeee...eeee',
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    balance: '500000000000000000',
  },
];

beforeEach(() => {
  mockFetchTokenBalances.mockReset();
  // Default: return mock tokens for all chains
  mockFetchTokenBalances.mockResolvedValue(mockTokens);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/scan', () => {
  describe('input validation', () => {
    it('returns 400 for invalid JSON body', async () => {
      const req = makeRequestRaw('not-valid-json{{{');
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid json/i);
    });

    it('returns 400 when address field is missing', async () => {
      const req = makeRequest({ notAddress: 'blah' });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/address/i);
    });

    it('returns 400 when address is not a string', async () => {
      const req = makeRequest({ address: 12345 });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/address/i);
    });

    it('returns 400 for address without 0x prefix', async () => {
      const req = makeRequest({ address: 'd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid ethereum address/i);
    });

    it('returns 400 for address that is too short', async () => {
      const req = makeRequest({ address: '0x123' });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid ethereum address/i);
    });

    it('returns 400 for address with invalid hex characters', async () => {
      const req = makeRequest({ address: '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG' });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 for empty body object', async () => {
      const req = makeRequest({});
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('accepts valid checksummed address', async () => {
      const req = makeRequest({ address: VALID_ADDRESS });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('accepts valid lowercase address', async () => {
      const req = makeRequest({ address: VALID_ADDRESS.toLowerCase() });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('trims whitespace from address', async () => {
      const req = makeRequest({ address: `  ${VALID_ADDRESS}  ` });
      const res = await POST(req);
      // Should succeed (whitespace trimmed) or return 400 — let's check based on route logic
      // The route trims then validates, so this should work
      expect(res.status).toBe(200);
    });
  });

  describe('successful scan', () => {
    it('returns 200 with results array', async () => {
      const req = makeRequest({ address: VALID_ADDRESS });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.results)).toBe(true);
    });

    it('returns results for all 15 chains', async () => {
      const req = makeRequest({ address: VALID_ADDRESS });
      const res = await POST(req);
      const body = await res.json();
      // 15 chains in CHAINS config (9 original + 6 Phase 4 expansion)
      expect(body.results).toHaveLength(15);
    });

    it('each result has chainId and tokens fields', async () => {
      const req = makeRequest({ address: VALID_ADDRESS });
      const res = await POST(req);
      const body = await res.json();
      for (const result of body.results) {
        expect(typeof result.chainId).toBe('number');
        expect(Array.isArray(result.tokens)).toBe(true);
      }
    });

    it('includes tokens from scanner in each result', async () => {
      const req = makeRequest({ address: VALID_ADDRESS });
      const res = await POST(req);
      const body = await res.json();
      // Each chain got the mock tokens
      for (const result of body.results) {
        expect(result.tokens).toHaveLength(2);
        expect(result.tokens[0].symbol).toBe('USDC');
      }
    });

    it('includes demo flag in response', async () => {
      const req = makeRequest({ address: VALID_ADDRESS });
      const res = await POST(req);
      const body = await res.json();
      expect('demo' in body).toBe(true);
      expect(body.demo).toBe(false);
    });
  });

  describe('error isolation per chain', () => {
    it('isolates chain-level errors — failed chains include error field, others succeed', async () => {
      // First call fails (Ethereum), rest succeed
      mockFetchTokenBalances
        .mockRejectedValueOnce(new Error('API rate limit exceeded'))
        .mockResolvedValue(mockTokens);

      const req = makeRequest({ address: VALID_ADDRESS });
      const res = await POST(req);
      expect(res.status).toBe(200); // overall request still succeeds

      const body = await res.json();
      // The first chain should have an error
      const failedChain = body.results.find((r: { error?: string }) => r.error);
      expect(failedChain).toBeDefined();
      expect(failedChain.error).toContain('API rate limit exceeded');
      expect(failedChain.tokens).toEqual([]);

      // Other chains should succeed
      const successChains = body.results.filter((r: { error?: string }) => !r.error);
      expect(successChains.length).toBeGreaterThan(0);
    });

    it('all chains failing still returns 200 with all error fields', async () => {
      mockFetchTokenBalances.mockRejectedValue(new Error('Network down'));

      const req = makeRequest({ address: VALID_ADDRESS });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const result of body.results) {
        expect(result.tokens).toEqual([]);
        expect(result.error).toBe('Network down');
      }
    });

    it('handles non-Error thrown values (defensive)', async () => {
      // Some code might throw strings or objects
      mockFetchTokenBalances
        .mockRejectedValueOnce('string error')
        .mockResolvedValue([]);

      const req = makeRequest({ address: VALID_ADDRESS });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      const failedChain = body.results.find((r: { error?: string }) => r.error);
      expect(failedChain?.error).toBe('Unknown error');
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/scan — cache invalidation
  // ---------------------------------------------------------------------------
  describe('DELETE /api/scan', () => {
    function makeDeleteRequest(address?: string): NextRequest {
      const url = address
        ? `http://localhost:3000/api/scan?address=${encodeURIComponent(address)}`
        : 'http://localhost:3000/api/scan';
      return new NextRequest(url, { method: 'DELETE' });
    }

    it('returns 200 and invalidated=true for a valid address', async () => {
      const req = makeDeleteRequest(VALID_ADDRESS);
      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.invalidated).toBe(true);
      expect(body.address).toBe(VALID_ADDRESS.toLowerCase());
    });

    it('calls scanCache.delete with the correct key', async () => {
      const { scanCache } = await import('../../utils/cache');
      const req = makeDeleteRequest(VALID_ADDRESS);
      await DELETE(req);
      expect(scanCache.delete).toHaveBeenCalledWith(
        `scan:${VALID_ADDRESS.toLowerCase()}`
      );
    });

    it('returns 400 when address is missing', async () => {
      const req = makeDeleteRequest();
      const res = await DELETE(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/address/i);
    });

    it('returns 400 when address is invalid', async () => {
      const req = makeDeleteRequest('not-an-address');
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it('normalises address to lowercase', async () => {
      const mixedCase = '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045';
      const req = makeDeleteRequest(mixedCase);
      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.address).toBe(mixedCase.toLowerCase());
    });
  });
});
