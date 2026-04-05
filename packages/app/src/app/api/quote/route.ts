import { NextRequest, NextResponse } from 'next/server';
import { getSwapProvider } from '@/utils/providers';
import type { BridgeParams, SwapParams } from '@/utils/providers';
import { quoteCache } from '@/utils/cache';
import { shouldFilterToken, MIN_QUOTE_THRESHOLD_USD, PRICE_ORACLE } from '@/utils/priceOracle';
// In demo mode, getSwapProvider() automatically returns MockSwapProvider — no extra wiring needed.

interface QuoteRequestBody {
  fromChainId: number;
  fromToken: string;
  toChainId: number;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  type: 'swap' | 'bridge';
  /**
   * Optional: token decimals (e.g. 6 for USDC, 18 for WETH).
   * When provided together with fromAmount, the oracle pre-filter can estimate
   * USD value without an additional caller-side price lookup.
   */
  fromDecimals?: number;
  /**
   * Optional: pre-computed USD value of the fromAmount from the scan step.
   * If provided, this is used directly for the pre-filter check — no oracle call needed.
   * Pass `null` explicitly to indicate "unknown value" (token passes through).
   */
  fromValueUsd?: number | null;
}

function getCacheKey(body: QuoteRequestBody): string {
  // Exclude fromDecimals/fromValueUsd from cache key — they don't affect the LI.FI response
  const { fromDecimals: _d, fromValueUsd: _v, ...cacheBody } = body;
  return `quote:${JSON.stringify(cacheBody)}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: QuoteRequestBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { fromChainId, fromToken, toChainId, toToken, fromAmount, fromAddress, toAddress, type } =
    body;

  if (!fromChainId || !fromToken || !toChainId || !toToken || !fromAmount || !fromAddress || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (type !== 'swap' && type !== 'bridge') {
    return NextResponse.json({ error: 'type must be "swap" or "bridge"' }, { status: 400 });
  }

  // ─── Price oracle pre-filter ─────────────────────────────────────────────
  // Skip LI.FI call entirely for tokens whose value is below the threshold.
  // This preserves LI.FI quota and avoids unnecessary latency.
  if (PRICE_ORACLE !== 'none') {
    const preFilter = await shouldFilterToken({
      valueUsd: body.fromValueUsd,
      chainId: fromChainId,
      address: fromToken,
      rawAmount: fromAmount,
      decimals: body.fromDecimals,
    });

    if (preFilter.filtered) {
      return NextResponse.json(
        {
          filtered: true,
          reason: preFilter.reason,
          valueUsd: preFilter.valueUsd,
          threshold: MIN_QUOTE_THRESHOLD_USD,
        },
        { status: 422 }
      );
    }
  }

  const cacheKey = getCacheKey(body);
  const cached = await quoteCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const provider = getSwapProvider();

  try {
    let quote;

    if (type === 'swap') {
      const params: SwapParams = {
        fromChainId,
        fromToken,
        toToken,
        fromAmount,
        fromAddress,
        toAddress,
      };
      quote = await provider.getSwapQuote(params);
    } else {
      const params: BridgeParams = {
        fromChainId,
        toChainId,
        fromToken,
        toToken,
        fromAmount,
        fromAddress,
        toAddress,
      };
      quote = await provider.getBridgeQuote(params);
    }

    await quoteCache.set(cacheKey, quote);
    return NextResponse.json(quote);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
