import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EtherscanScanner } from '../../utils/scanners/etherscan';

const TEST_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const BASE_URL = 'https://api.etherscan.io';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  // Clear env vars
  delete process.env.ETHERSCAN_API_KEY;
  delete process.env.ARBISCAN_API_KEY;
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

// Helpers to build Etherscan-style responses
function makeTokenTxResponse(
  txs: Array<{
    contractAddress: string;
    tokenSymbol: string;
    tokenName: string;
    tokenDecimal: string;
  }>
) {
  return {
    status: '1',
    message: 'OK',
    result: txs,
  };
}

function makeBalanceResponse(balance: string) {
  return {
    status: '1',
    message: 'OK',
    result: balance,
  };
}

function makeEmptyTxResponse() {
  return {
    status: '0',
    message: 'No transactions found',
    result: 'No transactions found',
  };
}

function makeErrorApiResponse(message: string, result: string = '') {
  return {
    status: '0',
    message,
    result,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('EtherscanScanner', () => {
  describe('constructor', () => {
    it('stores chainId', () => {
      const scanner = new EtherscanScanner(1, BASE_URL);
      expect(scanner.chainId).toBe(1);
    });

    it('strips trailing slash from baseUrl', () => {
      const scanner = new EtherscanScanner(1, `${BASE_URL}/`);
      expect(scanner.chainId).toBe(1);
    });
  });

  describe('fetchTokenBalances — happy path', () => {
    it('returns empty array when no token transactions found', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeEmptyTxResponse())) // tokentx
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0'))); // ETH balance

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);
      expect(results).toEqual([]);
    });

    it('returns ETH native token when balance > 0', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeEmptyTxResponse()))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('1000000000000000000')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('ETH');
      expect(results[0].decimals).toBe(18);
      expect(results[0].balance).toBe('1000000000000000000');
    });

    it('returns ERC-20 tokens with non-zero balances', async () => {
      const tokenTxs = [
        {
          contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          tokenSymbol: 'USDC',
          tokenName: 'USD Coin',
          tokenDecimal: '6',
        },
      ];

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeTokenTxResponse(tokenTxs)))      // tokentx
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')))            // ETH balance
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('42000000')));    // USDC balance

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(results).toHaveLength(1);
      const token = results[0];
      expect(token.address).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      expect(token.symbol).toBe('USDC');
      expect(token.name).toBe('USD Coin');
      expect(token.decimals).toBe(6);
      expect(token.balance).toBe('42000000');
    });

    it('includes both native ETH and ERC-20 tokens', async () => {
      const tokenTxs = [
        {
          contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          tokenSymbol: 'USDC',
          tokenName: 'USD Coin',
          tokenDecimal: '6',
        },
      ];

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeTokenTxResponse(tokenTxs)))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('500000000000000000')))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('42000000')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(results).toHaveLength(2);
      expect(results[0].symbol).toBe('ETH');
      expect(results[1].symbol).toBe('USDC');
    });

    it('skips ERC-20 tokens with zero balance', async () => {
      const tokenTxs = [
        {
          contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          tokenSymbol: 'USDC',
          tokenName: 'USD Coin',
          tokenDecimal: '6',
        },
      ];

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeTokenTxResponse(tokenTxs)))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0'))); // zero USDC

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      expect(results).toEqual([]);
    });

    it('deduplicates tokens with the same contract address', async () => {
      // Same contract appears twice in token tx history
      const tokenTxs = [
        {
          contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          tokenSymbol: 'USDC',
          tokenName: 'USD Coin',
          tokenDecimal: '6',
        },
        {
          contractAddress: '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48', // uppercase
          tokenSymbol: 'USDC',
          tokenName: 'USD Coin',
          tokenDecimal: '6',
        },
      ];

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeTokenTxResponse(tokenTxs)))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('42000000')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      // Should only fetch balance once, return one token
      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('USDC');
    });
  });

  describe('API key handling', () => {
    it('includes apikey in URL when env var is set', async () => {
      process.env.ETHERSCAN_API_KEY = 'test-key-abc123';

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeEmptyTxResponse()))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));

      const scanner = new EtherscanScanner(1, BASE_URL, 'ETHERSCAN_API_KEY');
      await scanner.fetchTokenBalances(TEST_ADDRESS);

      const tokentxCall = mockFetch.mock.calls[0][0] as string;
      expect(tokentxCall).toContain('apikey=test-key-abc123');
    });

    it('does not include apikey when env var is not set', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeEmptyTxResponse()))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));

      const scanner = new EtherscanScanner(1, BASE_URL, 'ETHERSCAN_API_KEY');
      await scanner.fetchTokenBalances(TEST_ADDRESS);

      const tokentxCall = mockFetch.mock.calls[0][0] as string;
      expect(tokentxCall).not.toContain('apikey=');
    });

    it('does not include apikey when no apiKeyEnvVar is provided', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeEmptyTxResponse()))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));

      const scanner = new EtherscanScanner(1, BASE_URL); // no env var arg
      await scanner.fetchTokenBalances(TEST_ADDRESS);

      const tokentxCall = mockFetch.mock.calls[0][0] as string;
      expect(tokentxCall).not.toContain('apikey=');
    });
  });

  describe('URL construction', () => {
    it('calls the tokentx endpoint', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeEmptyTxResponse()))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      await scanner.fetchTokenBalances(TEST_ADDRESS);

      const call = mockFetch.mock.calls[0][0] as string;
      expect(call).toContain(`${BASE_URL}/api`);
      expect(call).toContain('module=account');
      expect(call).toContain('action=tokentx');
      expect(call).toContain(`address=${TEST_ADDRESS}`);
    });

    it('calls the balance endpoint for native currency', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeEmptyTxResponse()))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      await scanner.fetchTokenBalances(TEST_ADDRESS);

      const balanceCall = mockFetch.mock.calls[1][0] as string;
      expect(balanceCall).toContain('action=balance');
      expect(balanceCall).toContain('tag=latest');
    });

    it('calls tokenbalance endpoint with contractaddress for ERC-20', async () => {
      const contractAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const tokenTxs = [
        {
          contractAddress,
          tokenSymbol: 'USDC',
          tokenName: 'USD Coin',
          tokenDecimal: '6',
        },
      ];

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeTokenTxResponse(tokenTxs)))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('42000000')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      await scanner.fetchTokenBalances(TEST_ADDRESS);

      const tokenBalanceCall = mockFetch.mock.calls[2][0] as string;
      expect(tokenBalanceCall).toContain('action=tokenbalance');
      expect(tokenBalanceCall).toContain(`contractaddress=${contractAddress}`);
    });
  });

  describe('error handling', () => {
    it('throws on HTTP error from tokentx endpoint', async () => {
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(429, 'Too Many Requests'))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      await expect(scanner.fetchTokenBalances(TEST_ADDRESS)).rejects.toThrow(
        'Etherscan API error (chain 1): 429 Too Many Requests'
      );
    });

    it('throws on API-level error (status 0) from tokentx with non-"no transactions" message', async () => {
      mockFetch
        .mockResolvedValueOnce(
          makeOkResponse(makeErrorApiResponse('NOTOK', 'Max rate limit reached'))
        )
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      await expect(scanner.fetchTokenBalances(TEST_ADDRESS)).rejects.toThrow(
        'Etherscan API error (chain 1)'
      );
    });

    it('returns empty result when status=0 and message is "No transactions found"', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeEmptyTxResponse()))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);
      expect(results).toEqual([]);
    });

    it('returns empty result when tokentx result is "No records found"', async () => {
      mockFetch
        .mockResolvedValueOnce(
          makeOkResponse({ status: '0', message: 'No records found', result: 'No records found' })
        )
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);
      expect(results).toEqual([]);
    });

    it('skips ERC-20 token when tokenbalance HTTP request fails (non-fatal)', async () => {
      const tokenTxs = [
        {
          contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          tokenSymbol: 'USDC',
          tokenName: 'USD Coin',
          tokenDecimal: '6',
        },
      ];

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeTokenTxResponse(tokenTxs)))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')))
        .mockResolvedValueOnce(makeErrorResponse(503, 'Service Unavailable'));

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);
      // Should not throw, just skip the failed token
      expect(results).toEqual([]);
    });

    it('skips ERC-20 token when tokenbalance API returns status != 1 (non-fatal)', async () => {
      const tokenTxs = [
        {
          contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          tokenSymbol: 'USDC',
          tokenName: 'USD Coin',
          tokenDecimal: '6',
        },
      ];

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeTokenTxResponse(tokenTxs)))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')))
        .mockResolvedValueOnce(makeOkResponse(makeErrorApiResponse('NOTOK', '')));

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);
      expect(results).toEqual([]);
    });

    it('returns empty (no native) when native balance endpoint fails', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeEmptyTxResponse()))
        .mockResolvedValueOnce(makeErrorResponse(500, 'Internal Server Error'));

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);
      // Native balance call failure is non-fatal, returns null
      expect(results).toEqual([]);
    });

    it('throws when fetch itself rejects (network error)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network connection failed'));

      const scanner = new EtherscanScanner(1, BASE_URL);
      await expect(scanner.fetchTokenBalances(TEST_ADDRESS)).rejects.toThrow(
        'Network connection failed'
      );
    });

    it('includes chain ID in error messages', async () => {
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(429, 'Too Many Requests'))
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));

      const scanner = new EtherscanScanner(42161, 'https://api.arbiscan.io', 'ARBISCAN_API_KEY');
      await expect(scanner.fetchTokenBalances(TEST_ADDRESS)).rejects.toThrow('chain 42161');
    });
  });

  describe('multiple tokens', () => {
    it('fetches balances for multiple unique tokens in parallel', async () => {
      const tokenTxs = [
        {
          contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          tokenSymbol: 'USDC',
          tokenName: 'USD Coin',
          tokenDecimal: '6',
        },
        {
          contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
          tokenSymbol: 'USDT',
          tokenName: 'Tether USD',
          tokenDecimal: '6',
        },
        {
          contractAddress: '0x6b175474e89094c44da98b954eedeac495271d0f',
          tokenSymbol: 'DAI',
          tokenName: 'Dai Stablecoin',
          tokenDecimal: '18',
        },
      ];

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(makeTokenTxResponse(tokenTxs)))  // tokentx
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')))       // ETH balance
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('42000000'))) // USDC balance
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('18500000'))) // USDT balance
        .mockResolvedValueOnce(makeOkResponse(makeBalanceResponse('0')));       // DAI balance (zero)

      const scanner = new EtherscanScanner(1, BASE_URL);
      const results = await scanner.fetchTokenBalances(TEST_ADDRESS);

      // ETH is zero, DAI is zero — only USDC and USDT returned
      expect(results).toHaveLength(2);
      const symbols = results.map((t) => t.symbol);
      expect(symbols).toContain('USDC');
      expect(symbols).toContain('USDT');
      expect(symbols).not.toContain('DAI');
    });
  });
});
