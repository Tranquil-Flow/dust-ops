import { NextRequest, NextResponse } from 'next/server';
import { CHAINS } from '../../../config/chains';
import { isDemoMode } from '../../../config/demo';
import { createScanner, type TokenBalance } from '../../../utils/scanners';
// In demo mode, createScanner() automatically returns MockScanner — no extra wiring needed.

/** Minimal Ethereum address validation: 0x + 40 hex chars */
function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

interface ChainScanResult {
  chainId: number;
  tokens: TokenBalance[];
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

  // Run all chain scans in parallel — failures are isolated per chain
  const scanPromises = CHAINS.map(async (chain): Promise<ChainScanResult> => {
    try {
      const scanner = createScanner(chain.id);
      const tokens = await scanner.fetchTokenBalances(address);
      return { chainId: chain.id, tokens };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown error';
      return { chainId: chain.id, tokens: [], error: message };
    }
  });

  const settled = await Promise.allSettled(scanPromises);

  const results: ChainScanResult[] = settled.map((result, index) => {
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

  return NextResponse.json({ results, demo: isDemoMode() });
}
