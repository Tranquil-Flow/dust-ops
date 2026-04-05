import { NextRequest, NextResponse } from 'next/server';
import { CHAINS, CHAIN_MAP } from '../../../config/chains';
import { NATIVE_TOKEN_ADDRESS } from '../../../config/types';
import { isDemoMode } from '../../../config/demo';
import { createScanner, type TokenBalance } from '../../../utils/scanners';
import { scanCache } from '../../../utils/cache';
import {
  classifyViability,
  computeTokenValueUsd,
  estimateGasCostUsd,
  fetchGasPriceWei,
  fetchTokenPricesUsd,
  SWAP_GAS_UNITS,
  VIABILITY_GAS_BUFFER,
} from '../../../utils/viability';
// In demo mode, createScanner() automatically returns MockScanner — no extra wiring needed.

/** Minimal Ethereum address validation: 0x + 40 hex chars */
function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export interface ScannedTokenResult extends TokenBalance {
  priceUsd: number | null;
  valueUsd: number | null;
  estimatedGasCostUsd: number | null;
  viability: 'sweepable' | 'uneconomic' | 'no-route';
}

interface ChainScanResult {
  chainId: number;
  tokens: ScannedTokenResult[];
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('address' in body) ||
    typeof (body as Record<string, unknown>).address !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Missing or invalid "address" field in request body' },
      { status: 400 }
    );
  }

  const address = (body as { address: string }).address.trim();

  if (!isValidAddress(address)) {
    return NextResponse.json(
      { error: 'Invalid Ethereum address. Must be a 0x-prefixed 40-character hex string.' },
      { status: 400 }
    );
  }

  // Check cache (skip in demo mode — mock data is fast and deterministic)
  if (!isDemoMode()) {
    const cacheKey = `scan:${address.toLowerCase()}`;
    const cachedResults = await scanCache.get<ChainScanResult[]>(cacheKey);
    if (cachedResults) {
      return NextResponse.json({ results: cachedResults, demo: false, cached: true });
    }
  }

  // Run all chain scans in parallel — failures are isolated per chain
  const scanPromises = CHAINS.map(async (chain): Promise<ChainScanResult> => {
    try {
      const scanner = createScanner(chain.id);
      const tokens = await scanner.fetchTokenBalances(address);
      return { chainId: chain.id, tokens: tokens as ScannedTokenResult[] };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown error';
      return { chainId: chain.id, tokens: [], error: message };
    }
  });

  const settled = await Promise.allSettled(scanPromises);

  const rawResults: ChainScanResult[] = settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // Promise.allSettled should never reject here since we catch inside,
    // but handle it defensively
    return {
      chainId: CHAINS[index].id,
      tokens: [],
      error:
        result.reason instanceof Error
          ? result.reason.message
          : 'Unknown error',
    };
  });

  // ─── Viability enrichment ────────────────────────────────────────────────
  // Skip enrichment in demo mode — mock scanners return raw TokenBalance data
  // which doesn't need real price lookups.
  let results: ChainScanResult[];

  if (isDemoMode()) {
    // In demo mode, assign placeholder viability based on a simple balance heuristic
    results = rawResults.map((chainResult) => ({
      ...chainResult,
      tokens: chainResult.tokens.map((token) => ({
        ...token,
        priceUsd: null,
        valueUsd: null,
        estimatedGasCostUsd: null,
        viability: 'sweepable' as const,
      })),
    }));
  } else {
    // Collect all tokens needing prices across all chains
    const allTokensForPricing: Array<{ chainId: number; address: string }> = [];
    for (const chainResult of rawResults) {
      for (const token of chainResult.tokens) {
        allTokensForPricing.push({ chainId: chainResult.chainId, address: token.address });
      }
    }

    // Fetch token prices (USD) from DefiLlama in one batched call
    const priceMap = await fetchTokenPricesUsd(allTokensForPricing).catch(() => new Map<string, number>());

    // Fetch gas prices for each chain that has tokens (in parallel)
    const chainIdsWithTokens = new Set(
      rawResults.filter((r) => r.tokens.length > 0).map((r) => r.chainId)
    );

    const gasPriceMap = new Map<number, bigint>();
    await Promise.all(
      [...chainIdsWithTokens].map(async (chainId) => {
        const chain = CHAIN_MAP[chainId];
        if (!chain) return;
        const gasPrice = await fetchGasPriceWei(chain.publicRpcUrl);
        gasPriceMap.set(chainId, gasPrice);
      })
    );

    // Fetch native token prices (for computing gas cost in USD)
    // Native token key format: "{chainId}:{NATIVE_TOKEN_ADDRESS}"
    const nativeTokensForPricing = [...chainIdsWithTokens].map((chainId) => ({
      chainId,
      address: NATIVE_TOKEN_ADDRESS,
    }));
    const nativePriceMap = await fetchTokenPricesUsd(nativeTokensForPricing).catch(
      () => new Map<string, number>()
    );

    // Enrich each chain's tokens with viability
    results = rawResults.map((chainResult) => {
      const { chainId } = chainResult;
      const gasPriceWei = gasPriceMap.get(chainId) ?? BigInt(20e9); // fallback: 20 Gwei
      const nativePriceUsd =
        nativePriceMap.get(`${chainId}:${NATIVE_TOKEN_ADDRESS.toLowerCase()}`) ?? null;

      const enrichedTokens: ScannedTokenResult[] = chainResult.tokens.map((token) => {
        const priceKey = `${chainId}:${token.address.toLowerCase()}`;
        const priceUsd = priceMap.get(priceKey) ?? null;
        const valueUsd = computeTokenValueUsd(token.balance, token.decimals, priceUsd);

        // Compute estimated gas cost in USD (null if we don't have the native price)
        const estimatedGasCostUsd =
          nativePriceUsd !== null
            ? estimateGasCostUsd(gasPriceWei, nativePriceUsd, SWAP_GAS_UNITS)
            : null;

        const viability = classifyViability(
          valueUsd,
          estimatedGasCostUsd ?? 0,
          VIABILITY_GAS_BUFFER
        );

        return {
          ...token,
          priceUsd,
          valueUsd,
          estimatedGasCostUsd,
          viability,
        };
      });

      return { ...chainResult, tokens: enrichedTokens };
    });
  }

  // Cache successful scan results (skip demo mode)
  if (!isDemoMode()) {
    const cacheKey = `scan:${address.toLowerCase()}`;
    await scanCache.set(cacheKey, results);
  }

  return NextResponse.json({ results, demo: isDemoMode() });
}
