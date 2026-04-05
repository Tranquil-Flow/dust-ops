/**
 * Unit tests for the viability classification module.
 *
 * All tests are pure-function or use mocked fetch — no real network calls.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  classifyViability,
  computeTokenValueUsd,
  estimateGasCostUsd,
  fetchGasPriceWei,
  fetchTokenPricesUsd,
  SWAP_GAS_UNITS,
  VIABILITY_GAS_BUFFER,
} from '../../utils/viability';

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── classifyViability ───────────────────────────────────────────────────────

describe('classifyViability', () => {
  const GAS_COST = 2.0; // $2 USD gas estimate

  it('returns "sweepable" when token value clearly exceeds gas cost × buffer', () => {
    // $10 value vs $2 gas × 1.2 buffer = $2.40 threshold → sweepable
    expect(classifyViability(10.0, GAS_COST)).toBe('sweepable');
  });

  it('returns "uneconomic" when token value is below gas cost × buffer', () => {
    // $2 value vs $2 gas × 1.2 buffer = $2.40 threshold → uneconomic
    expect(classifyViability(2.0, GAS_COST)).toBe('uneconomic');
  });

  it('returns "sweepable" when token value equals gas cost × buffer exactly', () => {
    // $2.40 value vs $2 gas × 1.2 buffer = $2.40 threshold.
    // At exactly the threshold: value >= gas×buffer, so we allow the sweep.
    // The buffer is a soft guard; hitting it exactly still yields positive net proceeds.
    const exactThreshold = GAS_COST * VIABILITY_GAS_BUFFER; // 2.4
    expect(classifyViability(exactThreshold, GAS_COST)).toBe('sweepable');
  });

  it('returns "uneconomic" for token value just below the threshold', () => {
    const justBelow = GAS_COST * VIABILITY_GAS_BUFFER - 0.01; // 2.39
    expect(classifyViability(justBelow, GAS_COST)).toBe('uneconomic');
  });

  it('returns "sweepable" when token value is null (price unknown)', () => {
    // Optimistically mark as sweepable — quote stage will set no-route if needed
    expect(classifyViability(null, GAS_COST)).toBe('sweepable');
  });

  it('returns "sweepable" when token value is zero (treat as unknown)', () => {
    expect(classifyViability(0, GAS_COST)).toBe('sweepable');
  });

  it('handles zero gas cost gracefully (free chain, mark all sweepable)', () => {
    expect(classifyViability(0.01, 0)).toBe('sweepable');
  });

  it('respects a custom buffer multiplier', () => {
    // $3 value vs $2 gas × 2.0 buffer = $4.00 threshold → uneconomic with buffer=2
    expect(classifyViability(3.0, GAS_COST, 2.0)).toBe('uneconomic');
    // But sweepable with buffer=1.0
    expect(classifyViability(3.0, GAS_COST, 1.0)).toBe('sweepable');
  });

  it('classifies large value tokens as sweepable regardless of gas cost', () => {
    expect(classifyViability(1000.0, 50.0)).toBe('sweepable');
  });

  it('classifies micro-dust as uneconomic on Ethereum mainnet (high gas)', () => {
    // $0.05 dust vs $5 gas cost on Ethereum
    expect(classifyViability(0.05, 5.0)).toBe('uneconomic');
  });

  // no-route is NOT returned by this function — it requires a LI.FI quote failure
  it('never returns "no-route" — that is set externally by the quote flow', () => {
    const result = classifyViability(0.01, 100.0); // would be uneconomic, not no-route
    expect(result).not.toBe('no-route');
  });
});

// ─── computeTokenValueUsd ────────────────────────────────────────────────────

describe('computeTokenValueUsd', () => {
  it('computes correct USD value for USDC (6 decimals)', () => {
    // 42000000 raw units × $1.00/USDC = $42.00
    expect(computeTokenValueUsd('42000000', 6, 1.0)).toBeCloseTo(42.0);
  });

  it('computes correct USD value for WETH (18 decimals)', () => {
    // 15000000000000000 raw units × $3000/ETH = $45.00
    expect(computeTokenValueUsd('15000000000000000', 18, 3000)).toBeCloseTo(45.0);
  });

  it('returns null when price is null', () => {
    expect(computeTokenValueUsd('1000000', 6, null)).toBeNull();
  });

  it('handles zero balance correctly', () => {
    expect(computeTokenValueUsd('0', 18, 3000)).toBe(0);
  });

  it('handles very small dust balances', () => {
    // 120000000000000 raw units × price = 0.00012 tokens
    const value = computeTokenValueUsd('120000000000000', 18, 10.0);
    expect(value).toBeCloseTo(0.0012, 6);
  });
});

// ─── estimateGasCostUsd ──────────────────────────────────────────────────────

describe('estimateGasCostUsd', () => {
  it('computes gas cost correctly with known inputs', () => {
    // 20 Gwei gas price × 250,000 gas units / 1e18 × $3000 ETH = $15.00
    const gasPriceWei = BigInt(20e9); // 20 Gwei
    const ethPrice = 3000;
    const cost = estimateGasCostUsd(gasPriceWei, ethPrice, SWAP_GAS_UNITS);
    expect(cost).toBeCloseTo(15.0, 2);
  });

  it('returns near-zero for ultra-low gas chains (e.g. 0.001 Gwei)', () => {
    const gasPriceWei = BigInt(1e6); // 0.001 Gwei
    const cost = estimateGasCostUsd(gasPriceWei, 3000, SWAP_GAS_UNITS);
    expect(cost).toBeLessThan(0.001);
  });

  it('scales linearly with gas price', () => {
    const base = BigInt(10e9); // 10 Gwei
    const double = BigInt(20e9); // 20 Gwei
    const costBase = estimateGasCostUsd(base, 3000, SWAP_GAS_UNITS);
    const costDouble = estimateGasCostUsd(double, 3000, SWAP_GAS_UNITS);
    expect(costDouble).toBeCloseTo(costBase * 2, 5);
  });

  it('scales linearly with native token price', () => {
    const gasPrice = BigInt(20e9);
    const cost1000 = estimateGasCostUsd(gasPrice, 1000, SWAP_GAS_UNITS);
    const cost2000 = estimateGasCostUsd(gasPrice, 2000, SWAP_GAS_UNITS);
    expect(cost2000).toBeCloseTo(cost1000 * 2, 5);
  });

  it('uses SWAP_GAS_UNITS as the default gas units', () => {
    const gasPriceWei = BigInt(20e9);
    const costDefault = estimateGasCostUsd(gasPriceWei, 3000);
    const costExplicit = estimateGasCostUsd(gasPriceWei, 3000, SWAP_GAS_UNITS);
    expect(costDefault).toBe(costExplicit);
  });
});

// ─── fetchGasPriceWei ────────────────────────────────────────────────────────

describe('fetchGasPriceWei', () => {
  it('returns parsed gas price from a successful RPC response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: '0x12A05F200' }), // 5 Gwei in hex
    });
    vi.stubGlobal('fetch', mockFetch);

    const gasPrice = await fetchGasPriceWei('https://example-rpc.com');
    expect(gasPrice).toBe(BigInt('0x12A05F200')); // 5000000000 wei = 5 Gwei
  });

  it('returns fallback (20 Gwei) when RPC call fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const gasPrice = await fetchGasPriceWei('https://bad-rpc.com');
    expect(gasPrice).toBe(BigInt(20) * BigInt(1e9)); // 20 Gwei
  });

  it('returns fallback when HTTP response is not OK', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    vi.stubGlobal('fetch', mockFetch);

    const gasPrice = await fetchGasPriceWei('https://overloaded-rpc.com');
    expect(gasPrice).toBe(BigInt(20) * BigInt(1e9));
  });

  it('returns fallback when RPC returns an error field', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: 'Method not found' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const gasPrice = await fetchGasPriceWei('https://example-rpc.com');
    expect(gasPrice).toBe(BigInt(20) * BigInt(1e9));
  });

  it('uses the custom fallback Gwei value when provided', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('fail'));
    vi.stubGlobal('fetch', mockFetch);

    const gasPrice = await fetchGasPriceWei('https://bad-rpc.com', 50);
    expect(gasPrice).toBe(BigInt(50) * BigInt(1e9)); // 50 Gwei
  });
});

// ─── fetchTokenPricesUsd ─────────────────────────────────────────────────────

describe('fetchTokenPricesUsd', () => {
  it('returns an empty map for an empty token list', async () => {
    const result = await fetchTokenPricesUsd([]);
    expect(result.size).toBe(0);
  });

  it('returns prices keyed as {chainId}:{address}', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        coins: {
          'ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { price: 1.0 },
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchTokenPricesUsd([
      { chainId: 1, address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
    ]);

    expect(result.get('1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBeCloseTo(1.0);
  });

  it('returns an empty map when the API call fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchTokenPricesUsd([
      { chainId: 1, address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
    ]);
    expect(result.size).toBe(0);
  });

  it('returns an empty map for tokens on unsupported chains', async () => {
    const result = await fetchTokenPricesUsd([
      { chainId: 999999, address: '0xabc123' },
    ]);
    expect(result.size).toBe(0);
  });

  it('handles partial price data (some tokens priced, some not)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        coins: {
          // Only USDC priced, no OBSCURE token
          'ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { price: 1.0 },
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchTokenPricesUsd([
      { chainId: 1, address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' }, // USDC
      { chainId: 1, address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }, // OBSCURE
    ]);

    expect(result.has('1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBe(true);
    expect(result.has('1:0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBe(false);
  });
});

// ─── End-to-end: all 3 viability classifications ─────────────────────────────

describe('viability classification: all 3 categories', () => {
  it('produces sweepable, uneconomic via classifyViability + estimateGasCostUsd', () => {
    const gasPriceWei = BigInt(20e9); // 20 Gwei (typical mainnet)
    const ethPriceUsd = 3000;
    const gasCostUsd = estimateGasCostUsd(gasPriceWei, ethPriceUsd, SWAP_GAS_UNITS);
    // gasCostUsd = (20e9 * 250000 / 1e18) * 3000 = 0.005 * 3000 = $15

    // Sweepable: $100 USDC
    expect(classifyViability(100.0, gasCostUsd)).toBe('sweepable');

    // Uneconomic: $5 dust (below $15 × 1.2 = $18 threshold)
    expect(classifyViability(5.0, gasCostUsd)).toBe('uneconomic');

    // no-route cannot be determined here — it's set by LI.FI quote failure
    // Just verify sweepable is returned for null-priced token
    expect(classifyViability(null, gasCostUsd)).toBe('sweepable');
  });
});
