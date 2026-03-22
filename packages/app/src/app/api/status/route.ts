import { NextRequest, NextResponse } from 'next/server';
import { getSwapProvider } from '@/utils/providers';

interface StatusRequestBody {
  txHash: string;
  fromChainId: number;
  toChainId: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: StatusRequestBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { txHash, fromChainId, toChainId } = body;

  if (!txHash || !fromChainId || !toChainId) {
    return NextResponse.json({ error: 'Missing required fields: txHash, fromChainId, toChainId' }, { status: 400 });
  }

  const provider = getSwapProvider();

  try {
    const status = await provider.getStatus(txHash, fromChainId, toChainId);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
