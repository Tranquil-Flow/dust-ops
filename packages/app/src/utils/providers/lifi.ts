import { getQuote, getStatus as lifiGetStatus } from '@lifi/sdk';
import type { QuoteRequest } from '@lifi/sdk';
import type {
  BridgeParams,
  ProviderQuote,
  StatusResponse,
  SwapParams,
  SwapProvider,
  TxStatus,
} from './types';

const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

function mapStatusMessage(status: string): TxStatus {
  switch (status) {
    case 'DONE':
      return 'done';
    case 'FAILED':
      return 'failed';
    case 'PENDING':
      return 'pending';
    case 'NOT_FOUND':
    default:
      return 'not_found';
  }
}

export class LiFiProvider implements SwapProvider {
  async getSwapQuote(params: SwapParams): Promise<ProviderQuote> {
    const request: QuoteRequest = {
      fromChain: params.fromChainId,
      toChain: params.fromChainId, // same chain for swap
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      toAddress: params.toAddress ?? params.fromAddress,
    };

    try {
      const quote = await getQuote(request);
      return this.mapQuoteToProviderQuote(quote, 'swap');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`LI.FI swap quote failed: ${message}`);
    }
  }

  async getBridgeQuote(params: BridgeParams): Promise<ProviderQuote> {
    const request: QuoteRequest = {
      fromChain: params.fromChainId,
      toChain: params.toChainId,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      toAddress: params.toAddress ?? params.fromAddress,
    };

    try {
      const quote = await getQuote(request);
      return this.mapQuoteToProviderQuote(quote, 'bridge');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`LI.FI bridge quote failed: ${message}`);
    }
  }

  async getStatus(
    txHash: string,
    fromChainId: number,
    toChainId: number,
  ): Promise<StatusResponse> {
    try {
      const result = await lifiGetStatus({
        txHash,
        fromChain: fromChainId,
        toChain: toChainId,
      });

      const statusMsg = (result as { status?: string }).status ?? 'NOT_FOUND';
      const substatus = (result as { substatus?: string }).substatus;

      // Extract receiving tx hash if available
      const receiving = (result as { receiving?: { txHash?: string } }).receiving;
      const bridgeTxHash = receiving?.txHash;

      return {
        status: mapStatusMessage(statusMsg),
        substatus: substatus,
        fromChainId,
        toChainId,
        bridgeTxHash,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`LI.FI status check failed: ${message}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapQuoteToProviderQuote(quote: any, type: 'swap' | 'bridge'): ProviderQuote {
    const action = quote.action;
    const estimate = quote.estimate;
    const txRequest = quote.transactionRequest ?? {};

    // Sum gas costs in USD
    const gasCosts: Array<{ amountUSD?: string }> = estimate?.gasCosts ?? [];
    const gasEstimateUsd = gasCosts.reduce((sum, gc) => {
      return sum + parseFloat(gc.amountUSD ?? '0');
    }, 0);

    const toAmountUsd = parseFloat(estimate?.toAmountUSD ?? '0');

    return {
      id: quote.id ?? `${Date.now()}`,
      fromChainId: action?.fromChainId ?? 0,
      fromToken: action?.fromToken?.address ?? NATIVE_TOKEN_ADDRESS,
      toChainId: action?.toChainId ?? action?.fromChainId ?? 0,
      toToken: action?.toToken?.address ?? NATIVE_TOKEN_ADDRESS,
      fromAmount: action?.fromAmount ?? '0',
      toAmount: estimate?.toAmount ?? '0',
      toAmountUsd,
      gasEstimateUsd,
      approvalAddress: estimate?.approvalAddress,
      transactionRequest: {
        to: txRequest.to ?? '',
        data: txRequest.data ?? '0x',
        value: txRequest.value?.toString() ?? '0',
        gasLimit: txRequest.gasLimit?.toString(),
      },
      tool: estimate?.tool ?? quote.tool ?? 'lifi',
      type,
    };
  }
}
