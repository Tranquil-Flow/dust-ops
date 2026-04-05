/**
 * Token viability classification for dust-ops sweep decisions.
 *
 * Viability determines whether it's economically worthwhile to sweep a token:
 *   - sweepable:   token value (USD) exceeds gas cost × buffer
 *   - uneconomic:  gas cost would eat up the token value (dust)
 *   - no-route:    LI.FI has no route for this token (set externally at quote time)
 *
 * This module provides the pure classification logic plus helpers to fetch
 * on-chain gas prices and off-chain token prices for enriching scan results.
 */

import type { TokenViability } from '../config/types';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Gas buffer multiplier. A token must be worth at least 1.2× the estimated
 * gas cost to be classified as sweepable. Configurable via VIABILITY_GAS_BUFFER
 * env var (e.g. "1.5" for a 50% safety margin).
 */
export const VIABILITY_GAS_BUFFER: number = (() => {
  const envVal = process.env.VIABILITY_GAS_BUFFER;
  if (envVal) {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 1.2;
})();

/**
 * Estimated gas units for a full approve + swap sequence via LI.FI.
 * ERC-20 approve: ~46 000 gas
 * LI.FI swap:    ~180 000 gas
 * Buffer:         ~24 000 gas
 * Total:         ~250 000 gas (conservative)
 *
 * Native token swaps skip the approve step (~200 000 gas) but we use the
 * conservative estimate for all tokens.
 */
export const SWAP_GAS_UNITS = 250_000;

// ─── Classification ──────────────────────────────────────────────────────────

/**
 * Classify a token's viability for sweeping.
 *
 * @param tokenValueUsd - USD value of the token balance (null = price unknown)
 * @param gasCostUsd    - estimated USD cost of the approve+swap transaction
 * @param buffer        - gas buffer multiplier (default: VIABILITY_GAS_BUFFER)
 * @returns TokenViability classification
 *
 * Note: `no-route` is NOT returned here — it requires a failed LI.FI quote
 * call (no liquidity / no route available). That classification is applied
 * downstream in the quote flow, not at scan time.
 */
export function classifyViability(
  tokenValueUsd: number | null,
  gasCostUsd: number,
  buffer: number = VIABILITY_GAS_BUFFER
): TokenViability {
  // If we can't price the token, optimistically mark it sweepable so the user
  // can attempt a quote. The quote stage will set `no-route` if LI.FI fails.
  if (tokenValueUsd === null || tokenValueUsd <= 0) {
    return 'sweepable';
  }

  // Gas cost guard: token must clear gas × buffer
  if (tokenValueUsd < gasCostUsd * buffer) {
    return 'uneconomic';
  }

  return 'sweepable';
}

/**
 * Compute the estimated swap gas cost in USD.
 *
 * @param gasPriceWei    - current gas price in wei (from eth_gasPrice)
 * @param nativePriceUsd - USD price of 1 native token (ETH/POL/etc.)
 * @param gasUnits       - number of gas units to estimate (default: SWAP_GAS_UNITS)
 * @returns Estimated cost in USD
 */
export function estimateGasCostUsd(
  gasPriceWei: bigint,
  nativePriceUsd: number,
  gasUnits: number = SWAP_GAS_UNITS
): number {
  // gasCostNative = gasPriceWei * gasUnits / 1e18
  const gasCostNativeF =
    (Number(gasPriceWei) * gasUnits) / 1e18;
  return gasCostNativeF * nativePriceUsd;
}

// ─── On-chain gas price fetch ────────────────────────────────────────────────

/**
 * Fetch the current gas price (in wei) from a public JSON-RPC endpoint.
 * Falls back to a conservative estimate if the RPC call fails.
 *
 * @param rpcUrl - public RPC endpoint URL
 * @param fallbackGwei - fallback gas price in Gwei if the call fails (default: 20)
 * @returns gas price in wei as bigint
 */
export async function fetchGasPriceWei(
  rpcUrl: string,
  fallbackGwei = 20
): Promise<bigint> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_gasPrice',
        params: [],
      }),
      signal: AbortSignal.timeout(5000), // 5 s timeout
    });

    if (!response.ok) {
      throw new Error(`RPC HTTP error ${response.status}`);
    }

    const data = (await response.json()) as {
      result?: string;
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(data.error.message);
    }

    if (!data.result || typeof data.result !== 'string') {
      throw new Error('Unexpected RPC response shape');
    }

    return BigInt(data.result);
  } catch {
    // Return fallback: fallbackGwei Gwei in wei
    return BigInt(fallbackGwei) * BigInt(1e9);
  }
}

// ─── Off-chain token price fetch (DefiLlama) ─────────────────────────────────

/**
 * DefiLlama chain identifiers used in the coins API.
 * Format: `{llama_chain_id}:{token_address}` or `coingecko:{id}` for native tokens.
 */
const DEFILLAMA_CHAIN_MAP: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  10: 'optimism',
  42161: 'arbitrum',
  137: 'polygon',
  534352: 'scroll',
  59144: 'linea',
  324: 'era', // zkSync Era
  1301: 'unichain',
};

/**
 * Fetch USD prices for a batch of tokens via DefiLlama Coins API (free, no key).
 * Returns a map of `{chainId}:{address}` → USD price.
 *
 * @param tokens - list of { chainId, address } pairs to price
 * @returns map of lower-cased `{chainId}:{address}` → price
 */
export async function fetchTokenPricesUsd(
  tokens: Array<{ chainId: number; address: string }>
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (tokens.length === 0) return result;

  // Build DefiLlama coin identifiers
  const coinIds: string[] = [];
  const keyMap = new Map<string, string>(); // llama key → our {chainId}:{address} key

  for (const { chainId, address } of tokens) {
    const llamaChain = DEFILLAMA_CHAIN_MAP[chainId];
    if (!llamaChain) continue;

    const llamaKey = `${llamaChain}:${address.toLowerCase()}`;
    const ourKey = `${chainId}:${address.toLowerCase()}`;
    coinIds.push(llamaKey);
    keyMap.set(llamaKey, ourKey);
  }

  if (coinIds.length === 0) return result;

  // DefiLlama batch price endpoint — max ~100 coins per request
  const BATCH_SIZE = 100;
  for (let i = 0; i < coinIds.length; i += BATCH_SIZE) {
    const batch = coinIds.slice(i, i + BATCH_SIZE);
    const url = `https://coins.llama.fi/prices/current/${batch.join(',')}?searchWidth=4h`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000), // 8 s timeout
      });

      if (!response.ok) continue;

      const data = (await response.json()) as {
        coins?: Record<string, { price?: number; confidence?: number }>;
      };

      if (!data.coins) continue;

      for (const [llamaKey, priceData] of Object.entries(data.coins)) {
        const ourKey = keyMap.get(llamaKey);
        if (ourKey && priceData.price != null) {
          result.set(ourKey, priceData.price);
        }
      }
    } catch {
      // Non-fatal: skip this batch
    }
  }

  return result;
}

// ─── Token value calculation ─────────────────────────────────────────────────

/**
 * Compute the USD value of a raw token balance.
 *
 * @param balance  - raw integer balance string (e.g. "42000000" for 42 USDC)
 * @param decimals - token decimals
 * @param priceUsd - current USD price for 1 whole token
 * @returns USD value, or null if price is unavailable
 */
export function computeTokenValueUsd(
  balance: string,
  decimals: number,
  priceUsd: number | null
): number | null {
  if (priceUsd === null) return null;
  const balanceF = Number(balance) / Math.pow(10, decimals);
  return balanceF * priceUsd;
}
