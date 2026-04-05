/**
 * Price oracle pre-filter for LI.FI quote requests.
 *
 * Before burning LI.FI API quota on dust tokens that can never be profitably swept,
 * this module estimates a token's USD value and compares it against a minimum threshold.
 * Tokens below the threshold are rejected early with a `filtered` response.
 *
 * Supported oracles:
 *   - `defillama` (default) — DefiLlama Coins API, free, no key required
 *   - `none` — oracle disabled, all tokens pass through
 *
 * Configuration (environment variables):
 *   PRICE_ORACLE           = 'defillama' | 'none'  (default: 'defillama')
 *   MIN_QUOTE_THRESHOLD_USD = number                (default: 1.00)
 */

import { fetchTokenPricesUsd } from './viability';

// ─── Configuration ──────────────────────────────────────────────────────────

export type PriceOracle = 'defillama' | 'none';

/**
 * Which price oracle to use for pre-filtering.
 * Set PRICE_ORACLE=none to bypass the oracle entirely.
 */
export const PRICE_ORACLE: PriceOracle = (() => {
  const val = process.env.PRICE_ORACLE ?? 'defillama';
  if (val === 'none') return 'none';
  return 'defillama'; // default / unknown values fall back to defillama
})();

/**
 * Minimum USD value a token must exceed to proceed to LI.FI quoting.
 * Tokens below this threshold are returned as `filtered` without contacting LI.FI.
 * Override via MIN_QUOTE_THRESHOLD_USD env var (e.g. "2.50").
 */
export const MIN_QUOTE_THRESHOLD_USD: number = (() => {
  const val = process.env.MIN_QUOTE_THRESHOLD_USD;
  if (val) {
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return 1.0;
})();

// ─── Oracle ────────────────────────────────────────────────────────────────

/**
 * Fetch the current USD price for a single token using the configured oracle.
 *
 * @param chainId - EVM chain ID
 * @param address - token contract address (or NATIVE_TOKEN_ADDRESS sentinel)
 * @returns USD price per whole token, or null if unknown / oracle disabled
 */
export async function fetchTokenPriceUsd(
  chainId: number,
  address: string
): Promise<number | null> {
  if (PRICE_ORACLE === 'none') return null;

  try {
    const prices = await fetchTokenPricesUsd([{ chainId, address }]);
    const key = `${chainId}:${address.toLowerCase()}`;
    return prices.get(key) ?? null;
  } catch {
    return null;
  }
}

// ─── Value estimation ────────────────────────────────────────────────────────

/**
 * Estimate the USD value of a raw token balance.
 *
 * @param chainId    - EVM chain ID
 * @param address    - token contract address
 * @param rawAmount  - raw integer balance as a string (e.g. "42000000" for 42 USDC)
 * @param decimals   - token decimals (e.g. 6 for USDC, 18 for WETH)
 * @returns USD value of the balance, or null if price is unavailable
 */
export async function estimateTokenValueUsd(
  chainId: number,
  address: string,
  rawAmount: string,
  decimals: number
): Promise<number | null> {
  const priceUsd = await fetchTokenPriceUsd(chainId, address);
  if (priceUsd === null) return null;

  const amount = Number(rawAmount) / Math.pow(10, decimals);
  return amount * priceUsd;
}

// ─── Pre-filter check ────────────────────────────────────────────────────────

export interface PreFilterResult {
  /** true if the token should be filtered (skip LI.FI quote) */
  filtered: boolean;
  /** USD value estimate used for the decision, or null if unknown */
  valueUsd: number | null;
  /** Threshold applied */
  threshold: number;
  /** Human-readable reason when filtered is true */
  reason?: string;
}

/**
 * Decide whether a token should be filtered before calling LI.FI.
 *
 * A token is filtered when:
 *   - Its USD value is known AND below MIN_QUOTE_THRESHOLD_USD
 *
 * When value is unknown (oracle returns null), the token passes through
 * so the user still gets a chance to attempt a quote.
 *
 * @param valueUsd - pre-computed USD value, or null to look it up from oracle
 * @param chainId  - required if valueUsd is null (for oracle lookup)
 * @param address  - required if valueUsd is null
 * @param rawAmount - required if valueUsd is null
 * @param decimals  - required if valueUsd is null
 */
export async function shouldFilterToken(opts: {
  valueUsd: number | null | undefined;
  chainId?: number;
  address?: string;
  rawAmount?: string;
  decimals?: number;
}): Promise<PreFilterResult> {
  const threshold = MIN_QUOTE_THRESHOLD_USD;

  let valueUsd: number | null = opts.valueUsd ?? null;

  // If caller didn't provide a pre-computed value, try the oracle
  if (valueUsd === null && opts.chainId != null && opts.address && opts.rawAmount && opts.decimals != null) {
    valueUsd = await estimateTokenValueUsd(opts.chainId, opts.address, opts.rawAmount, opts.decimals);
  }

  // Unknown value → pass through (optimistic)
  if (valueUsd === null) {
    return { filtered: false, valueUsd: null, threshold };
  }

  // Below threshold → filter
  if (valueUsd < threshold) {
    return {
      filtered: true,
      valueUsd,
      threshold,
      reason: `Token value $${valueUsd.toFixed(4)} is below minimum quote threshold $${threshold.toFixed(2)}`,
    };
  }

  return { filtered: false, valueUsd, threshold };
}
