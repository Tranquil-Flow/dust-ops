import { NextRequest, NextResponse } from 'next/server';
import { getSwapProvider } from '@/utils/providers';
import type { BridgeParams, SwapParams } from '@/utils/providers';
import { quoteCache } from '@/utils/cache';
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
}

function getCacheKey(body: QuoteRequestBody): string {
  return `quote:${JSON.stringify(body)}`;
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
