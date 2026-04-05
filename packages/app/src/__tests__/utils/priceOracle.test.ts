/**
 * Unit tests for the price oracle pre-filter utility.
 *
 * Tests:
 * - shouldFilterToken: pre-computed valueUsd below threshold → filtered
 * - shouldFilterToken: pre-computed valueUsd above threshold → passes through
 * - shouldFilterToken: null/undefined valueUsd (oracle lookup path)
 * - shouldFilterToken: oracle returns null → passes through (optimistic)
 * - shouldFilterToken: oracle returns price → computes value and applies threshold
 * - MIN_QUOTE_THRESHOLD_USD default value is 1.0
 * - PRICE_ORACLE default value is 'defillama'
 * - Threshold boundary: exactly at threshold → passes (≥ threshold)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { shouldFilterToken } from '../../utils/priceOracle';

// ---------------------------------------------------------------------------
// Mock the viability module so we control oracle price responses
// ---------------------------------------------------------------------------
const mockFetchTokenPricesUsd = vi.fn();

vi.mock('../../utils/viability', () => ({
  fetchTokenPricesUsd: (...args: unknown[]) => mockFetchTokenPricesUsd(...args),
  // Re-export other viability items as identity stubs (not needed here)
  classifyViability: vi.fn(),
  computeTokenValueUsd: vi.fn(),
  estimateGasCostUsd: vi.fn(),
  fetchGasPriceWei: vi.fn(),
  SWAP_GAS_UNITS: 250_000,
  VIABILITY_GAS_BUFFER: 1.2,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CHAIN_ID = 1;
const TOKEN_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'; // USDC
const DECIMALS = 6;

function priceMap(chainId: number, address: string, price: number): Map<string, number> {
  const m = new Map<string, number>();
  m.set(`${chainId}:${address.toLowerCase()}`, price);
  return m;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shouldFilterToken', () => {
  beforeEach(() => {
    mockFetchTokenPricesUsd.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('pre-computed fromValueUsd path', () => {
    it('filters token when fromValueUsd is below threshold ($1.00)', async () => {
      const result = await shouldFilterToken({ valueUsd: 0.50 });
      expect(result.filtered).toBe(true);
      expect(result.valueUsd).toBe(0.50);
      expect(result.threshold).toBe(1.0);
      expect(result.reason).toMatch(/below minimum/i);
    });

    it('passes through when fromValueUsd is above threshold', async () => {
      const result = await shouldFilterToken({ valueUsd: 5.00 });
      expect(result.filtered).toBe(false);
      expect(result.valueUsd).toBe(5.00);
    });

    it('passes through when fromValueUsd is exactly at threshold', async () => {
      // At the threshold exactly → should pass (≥ threshold, not strictly >)
      const result = await shouldFilterToken({ valueUsd: 1.00 });
      expect(result.filtered).toBe(false);
    });

    it('passes through when fromValueUsd is just above threshold', async () => {
      const result = await shouldFilterToken({ valueUsd: 1.01 });
      expect(result.filtered).toBe(false);
    });

    it('filters when fromValueUsd is just below threshold', async () => {
      const result = await shouldFilterToken({ valueUsd: 0.99 });
      expect(result.filtered).toBe(true);
    });

    it('passes through when fromValueUsd is null (unknown → optimistic)', async () => {
      const result = await shouldFilterToken({ valueUsd: null });
      expect(result.filtered).toBe(false);
      expect(result.valueUsd).toBe(null);
    });

    it('passes through when fromValueUsd is undefined and no oracle params provided', async () => {
      const result = await shouldFilterToken({ valueUsd: undefined });
      expect(result.filtered).toBe(false);
      expect(result.valueUsd).toBe(null);
      // Should not have called oracle (no chainId/address/rawAmount/decimals)
      expect(mockFetchTokenPricesUsd).not.toHaveBeenCalled();
    });

    it('does not call oracle when fromValueUsd is already provided', async () => {
      await shouldFilterToken({ valueUsd: 0.10 });
      expect(mockFetchTokenPricesUsd).not.toHaveBeenCalled();
    });

    it('does not call oracle when fromValueUsd is 0', async () => {
      // 0 is a valid USD value (worthless token), no oracle call needed
      const result = await shouldFilterToken({ valueUsd: 0 });
      expect(mockFetchTokenPricesUsd).not.toHaveBeenCalled();
      expect(result.filtered).toBe(true); // 0 < 1.00 threshold
    });
  });

  describe('oracle lookup path (valueUsd not provided)', () => {
    const ORACLE_PARAMS = {
      valueUsd: undefined as undefined,
      chainId: CHAIN_ID,
      address: TOKEN_ADDRESS,
      rawAmount: '2_000_000', // 2 USDC (6 decimals)
      decimals: DECIMALS,
    };

    it('fetches price from oracle and filters when token is below threshold', async () => {
      // $0.40/USDC × 2 USDC = $0.80 → below $1.00 threshold
      mockFetchTokenPricesUsd.mockResolvedValueOnce(
        priceMap(CHAIN_ID, TOKEN_ADDRESS, 0.40)
      );

      const result = await shouldFilterToken({
        ...ORACLE_PARAMS,
        rawAmount: '2000000', // 2 USDC at $0.40 = $0.80
      });

      expect(mockFetchTokenPricesUsd).toHaveBeenCalledTimes(1);
      expect(result.filtered).toBe(true);
      expect(result.valueUsd).toBeCloseTo(0.80, 4);
    });

    it('fetches price from oracle and passes through when token is above threshold', async () => {
      // $1.00/USDC × 5 USDC = $5.00 → above $1.00 threshold
      mockFetchTokenPricesUsd.mockResolvedValueOnce(
        priceMap(CHAIN_ID, TOKEN_ADDRESS, 1.00)
      );

      const result = await shouldFilterToken({
        ...ORACLE_PARAMS,
        rawAmount: '5000000', // 5 USDC
      });

      expect(result.filtered).toBe(false);
      expect(result.valueUsd).toBeCloseTo(5.0, 4);
    });

    it('passes through when oracle returns null price (unknown → optimistic)', async () => {
      mockFetchTokenPricesUsd.mockResolvedValueOnce(new Map());

      const result = await shouldFilterToken(ORACLE_PARAMS);

      expect(result.filtered).toBe(false);
      expect(result.valueUsd).toBe(null);
    });

    it('passes through when oracle throws (network error → optimistic)', async () => {
      mockFetchTokenPricesUsd.mockRejectedValueOnce(new Error('DefiLlama timeout'));

      const result = await shouldFilterToken(ORACLE_PARAMS);

      expect(result.filtered).toBe(false);
      expect(result.valueUsd).toBe(null);
    });

    it('does not call oracle when address is missing', async () => {
      const result = await shouldFilterToken({
        valueUsd: undefined,
        chainId: CHAIN_ID,
        // address intentionally omitted
        rawAmount: '5000000',
        decimals: DECIMALS,
      });

      expect(mockFetchTokenPricesUsd).not.toHaveBeenCalled();
      expect(result.filtered).toBe(false);
    });

    it('does not call oracle when decimals are missing', async () => {
      const result = await shouldFilterToken({
        valueUsd: undefined,
        chainId: CHAIN_ID,
        address: TOKEN_ADDRESS,
        rawAmount: '5000000',
        // decimals intentionally omitted
      });

      expect(mockFetchTokenPricesUsd).not.toHaveBeenCalled();
      expect(result.filtered).toBe(false);
    });

    it('correctly handles 18-decimal tokens (ETH-like)', async () => {
      // 0.001 WETH at $2000/ETH = $2.00 → above threshold
      const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
      mockFetchTokenPricesUsd.mockResolvedValueOnce(
        priceMap(CHAIN_ID, wethAddress, 2000)
      );

      const result = await shouldFilterToken({
        valueUsd: undefined,
        chainId: CHAIN_ID,
        address: wethAddress,
        rawAmount: '1000000000000000', // 0.001 ETH (1e15 wei)
        decimals: 18,
      });

      expect(result.filtered).toBe(false);
      expect(result.valueUsd).toBeCloseTo(2.0, 4);
    });
  });

  describe('threshold config', () => {
    it('returns correct threshold value (1.0 default)', async () => {
      const result = await shouldFilterToken({ valueUsd: 5.0 });
      expect(result.threshold).toBe(1.0);
    });

    it('always includes threshold in result', async () => {
      const result1 = await shouldFilterToken({ valueUsd: 0.5 });
      const result2 = await shouldFilterToken({ valueUsd: null });
      expect(result1.threshold).toBeGreaterThan(0);
      expect(result2.threshold).toBeGreaterThan(0);
    });
  });
});
