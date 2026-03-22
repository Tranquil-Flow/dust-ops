import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BlockscoutScanner } from '../../utils/scanners/blockscout';

const TEST_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const BASE_URL = 'https://base.blockscout.com';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as unknown as Response;
}

function makeErrorResponse(status: number, statusText: string): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({ message: statusText }),
  } as unknown as Response;
}

// Helpers to build Blockscout responses
function makeTokensResponse(
  items: Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: string;
    value: string;
    icon_url?: string;
  }>,
  next_page_params?: unknown
) {
  return {
    items: items.map((t) => ({
      token: {
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        icon_url: t.icon_url ?? null,
      },
      value: t.value,
    })),
    next_page_params: next_page_params ?? null,
  };
}

function makeAddressResponse(coin_balance: string | null) {
  return { coin_balance };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('BlockscoutScanner', () => {
  describe('constructor', () => {
    it('stores chainId and strips trailing slash from baseUrl', () => {
      const scanner = new BlockscoutScanner(8453, 'https://base.blockscout.com/');
      expect(scanner.chainId).toBe(8453);
    });

    it('works with URL without trailing slash', () => {
      const scanner = new BlockscoutScanner(8453, BASE_URL);
      expect(scanner.chainId).toBe(8453);
    });
  });

  describe('fetchTokenBalances — happy path', () => {
    it('returns empty array when no tokens and zero native balance', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeTokensResponse([])))
               .mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);
      expect(results).toEqual([]);
    });

    it('returns native ETH token when coin_balance > 0', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeTokensResponse([])))
               .mockResolvedValueOnce(makeOkResponse(makeAddressResponse('1000000000000000000')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('ETH');
      expect(results[0].decimals).toBe(18);
      expect(results[0].balance).toBe('1000000000000000000');
    });

    it('includes native ETH as first item when coin_balance > 0', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse(
          makeTokensResponse([
            {
              address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: '6',
              value: '42000000',
            },
          ])
        )
      ).mockResolvedValueOnce(makeOkResponse(makeAddressResponse('5000000000000000')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(results).toHaveLength(2);
      expect(results[0].symbol).toBe('ETH');
      expect(results[1].symbol).toBe('USDC');
    });

    it('returns ERC-20 tokens with correct fields', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse(
          makeTokensResponse([
            {
              address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: '6',
              value: '95000000',
              icon_url: 'https://example.com/usdc.png',
            },
          ])
        )
      ).mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(results).toHaveLength(1);
      const token = results[0];
      expect(token.address).toBe('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
      expect(token.symbol).toBe('USDC');
      expect(token.name).toBe('USD Coin');
      expect(token.decimals).toBe(6);
      expect(token.balance).toBe('95000000');
      expect(token.logoUrl).toBe('https://example.com/usdc.png');
    });

    it('skips tokens with zero balance', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse(
          makeTokensResponse([
            {
              address: '0xaaa',
              symbol: 'ZERO',
              name: 'Zero Token',
              decimals: '18',
              value: '0',
            },
            {
              address: '0xbbb',
              symbol: 'USDT',
              name: 'Tether',
              decimals: '6',
              value: '1000000',
            },
          ])
        )
      ).mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('USDT');
    });

    it('does not include logoUrl when icon_url is null', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse(
          makeTokensResponse([
            {
              address: '0xaaa',
              symbol: 'FOO',
              name: 'Foo Token',
              decimals: '18',
              value: '1000',
            },
          ])
        )
      ).mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(results[0].logoUrl).toBeUndefined();
    });

    it('does not include native balance when coin_balance is null', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeTokensResponse([])))
               .mockResolvedValueOnce(makeOkResponse(makeAddressResponse(null)));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);
      expect(results).toEqual([]);
    });
  });

  describe('fetchTokenBalances — pagination', () => {
    it('follows next_page_params to fetch all pages', async () => {
      const page1 = makeTokensResponse(
        [
          {
            address: '0xaaa',
            symbol: 'TKN1',
            name: 'Token 1',
            decimals: '18',
            value: '1000',
          },
        ],
        { fiat_value: '1.23', id: 100, value: '1000' }
      );
      const page2 = makeTokensResponse(
        [
          {
            address: '0xbbb',
            symbol: 'TKN2',
            name: 'Token 2',
            decimals: '18',
            value: '2000',
          },
        ],
        null
      );

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(page1)) // ERC-20 page 1
        .mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0'))) // native
        .mockResolvedValueOnce(makeOkResponse(page2)); // ERC-20 page 2

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(results).toHaveLength(2);
      expect(results[0].symbol).toBe('TKN1');
      expect(results[1].symbol).toBe('TKN2');
    });

    it('calls correct URL for second page with pagination params', async () => {
      const page1 = makeTokensResponse(
        [{ address: '0xaaa', symbol: 'TKN1', name: 'Token 1', decimals: '18', value: '1000' }],
        { fiat_value: '5.00', id: 42, value: '500' }
      );
      const page2 = makeTokensResponse([], null);

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(page1))
        .mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')))
        .mockResolvedValueOnce(makeOkResponse(page2));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      await scanner.fetchTokenBalances(TEST_ADDRESS);

      const secondPageCall = mockFetch.mock.calls[2][0] as string;
      expect(secondPageCall).toContain('fiat_value=5.00');
      expect(secondPageCall).toContain('id=42');
      expect(secondPageCall).toContain('value=500');
    });
  });

  describe('fetchTokenBalances — error handling', () => {
    it('throws on ERC-20 HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(429, 'Too Many Requests'))
               .mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      await expect(scanner.fetchTokenBalances(TEST_ADDRESS)).rejects.toThrow(
        'Blockscout API error (chain 8453): 429 Too Many Requests'
      );
    });

    it('throws on native balance HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeTokensResponse([])))
               .mockResolvedValueOnce(makeErrorResponse(500, 'Internal Server Error'));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      await expect(scanner.fetchTokenBalances(TEST_ADDRESS)).rejects.toThrow(
        'Blockscout API error (chain 8453): 500 Internal Server Error'
      );
    });

    it('throws on 503 Service Unavailable', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(503, 'Service Unavailable'))
               .mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      await expect(scanner.fetchTokenBalances(TEST_ADDRESS)).rejects.toThrow('503');
    });

    it('throws when fetch rejects (network timeout)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed: connection timeout'));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      await expect(scanner.fetchTokenBalances(TEST_ADDRESS)).rejects.toThrow(
        'fetch failed: connection timeout'
      );
    });

    it('includes the chain ID in error messages', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(404, 'Not Found'))
               .mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')));

      const scanner = new BlockscoutScanner(10, 'https://optimism.blockscout.com');
      await expect(scanner.fetchTokenBalances(TEST_ADDRESS)).rejects.toThrow('chain 10');
    });
  });

  describe('URL construction', () => {
    it('calls the correct ERC-20 endpoint', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeTokensResponse([])))
               .mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      await scanner.fetchTokenBalances(TEST_ADDRESS);

      const erc20Call = mockFetch.mock.calls[0][0] as string;
      expect(erc20Call).toContain('/api/v2/addresses/');
      expect(erc20Call).toContain(TEST_ADDRESS);
      expect(erc20Call).toContain('type=ERC-20');
    });

    it('calls the correct address endpoint for native balance', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeTokensResponse([])))
               .mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      await scanner.fetchTokenBalances(TEST_ADDRESS);

      const addressCall = mockFetch.mock.calls[1][0] as string;
      expect(addressCall).toContain(`/api/v2/addresses/${TEST_ADDRESS}`);
      expect(addressCall).not.toContain('type=');
    });

    it('makes exactly 2 fetch calls for single-page result', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeTokensResponse([])))
               .mockResolvedValueOnce(makeOkResponse(makeAddressResponse('0')));

      const scanner = new BlockscoutScanner(8453, BASE_URL);
      await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
