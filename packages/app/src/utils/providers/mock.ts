import type {
  SwapProvider,
  SwapParams,
  BridgeParams,
  ProviderQuote,
  StatusResponse,
} from './types';

/** Sleep helper */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gas tiers by chainId — lower L2s cost less.
 * Returns estimated gas cost in USD.
 */
function getGasCostUsd(chainId: number): number {
  // High gas: Ethereum mainnet
  if (chainId === 1) return 8.5 + Math.random() * 4;
  // Medium gas: Polygon
  if (chainId === 137) return 0.15 + Math.random() * 0.1;
  // Low gas: L2s (Base, Optimism, Arbitrum, Scroll, Linea, zkSync, Unichain)
  return 0.05 + Math.random() * 0.08;
}

/**
 * Simulate realistic output amounts.
 * Assumes fromAmount is in raw token units. We apply a ~0.5% slippage/fee.
 */
function computeToAmount(fromAmount: string, slippageBps = 50): string {
  try {
    const raw = BigInt(fromAmount);
    const out = (raw * BigInt(10000 - slippageBps)) / BigInt(10000);
    return out.toString();
  } catch {
    return fromAmount;
  }
}

/**
 * Generate a deterministic-looking fake tx hash.
 */
function fakeTxHash(): string {
  const hex = Math.random().toString(16).slice(2).padEnd(64, '0');
  return `0x${hex}`;
}

/**
 * Timestamp-keyed status store.
 * First call within 5 seconds of creation → 'pending'
 * After 5 seconds → 'done'
 */
const statusStore = new Map<string, number>(); // txHash → firstCallTimestamp

export class MockSwapProvider implements SwapProvider {
  async getSwapQuote(params: SwapParams): Promise<ProviderQuote> {
    await sleep(1000 + Math.random() * 500);

    const gasEstimateUsd = getGasCostUsd(params.fromChainId);
    const toAmount = computeToAmount(params.fromAmount);
    const id = fakeTxHash();

    // Rough USD estimate: assume toAmount/1e6 for 6-decimal tokens, else /1e18
    const toAmountUsd = Number(toAmount) / 1e6;

    return {
      id,
      fromChainId: params.fromChainId,
      fromToken: params.fromToken,
      toChainId: params.fromChainId, // same chain for swaps
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAmount,
      toAmountUsd,
      gasEstimateUsd,
      approvalAddress: '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch-style router
      transactionRequest: {
        to: '0x1111111254eeb25477b68fb85ed929f73a960582',
        data: `0xdemo${id.slice(2, 18)}`,
        value: '0x0',
        gasLimit: '0x55730', // ~350k gas
      },
      tool: 'mock-dex',
      type: 'swap',
    };
  }

  async getBridgeQuote(params: BridgeParams): Promise<ProviderQuote> {
    await sleep(1500 + Math.random() * 500);

    const gasEstimateUsd = getGasCostUsd(params.fromChainId) + 0.5; // bridge fee
    const toAmount = computeToAmount(params.fromAmount, 80); // slightly more slippage for bridge
    const id = fakeTxHash();

    const toAmountUsd = Number(toAmount) / 1e6;

    return {
      id,
      fromChainId: params.fromChainId,
      fromToken: params.fromToken,
      toChainId: params.toChainId,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAmount,
      toAmountUsd,
      gasEstimateUsd,
      approvalAddress: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', // LI.FI diamond
      transactionRequest: {
        to: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
        data: `0xdemobridge${id.slice(2, 14)}`,
        value: '0x0',
        gasLimit: '0x7a120', // ~500k gas
      },
      tool: 'mock-bridge',
      type: 'bridge',
    };
  }

  async getStatus(
    txHash: string,
    fromChainId: number,
    toChainId: number
  ): Promise<StatusResponse> {
    await sleep(800 + Math.random() * 400);

    const now = Date.now();

    if (!statusStore.has(txHash)) {
      statusStore.set(txHash, now);
    }

    const firstSeen = statusStore.get(txHash)!;
    const elapsed = now - firstSeen;

    // Transition from pending → done after 5 seconds
    const status = elapsed >= 5000 ? 'done' : 'pending';

    return {
      status,
      substatus: status === 'pending' ? 'WAIT_SOURCE_CONFIRMATIONS' : 'COMPLETED',
      fromChainId,
      toChainId,
      bridgeTxHash: status === 'done' ? fakeTxHash() : undefined,
    };
  }
}
