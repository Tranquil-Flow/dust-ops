import { NextRequest, NextResponse } from 'next/server';
import { getSwapProvider } from '@/utils/providers';
import type { BridgeParams, SwapParams } from '@/utils/providers';

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

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

function getCacheKey(body: QuoteRequestBody): string {
  return JSON.stringify(body);
}

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
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
  const cached = getFromCache(cacheKey);
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

    setCache(cacheKey, quote);
    return NextResponse.json(quote);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
