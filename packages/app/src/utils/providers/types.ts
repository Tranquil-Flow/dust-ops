export interface SwapParams {
  fromChainId: number;
  fromToken: string; // token address
  toToken: string; // token address (use native address for ETH)
  fromAmount: string; // raw amount as string
  fromAddress: string; // user wallet
  toAddress?: string; // destination (defaults to fromAddress)
}

export interface BridgeParams {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
}

export interface ProviderQuote {
  id: string;
  fromChainId: number;
  fromToken: string;
  toChainId: number;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  toAmountUsd: number;
  gasEstimateUsd: number;
  approvalAddress?: string;
  transactionRequest: {
    to: string;
    data: string;
    value: string;
    gasLimit?: string;
  };
  tool: string;
  type: 'swap' | 'bridge';
}

export type TxStatus = 'pending' | 'done' | 'failed' | 'not_found';

export interface StatusResponse {
  status: TxStatus;
  substatus?: string;
  fromChainId: number;
  toChainId: number;
  bridgeTxHash?: string;
}

export interface SwapProvider {
  getSwapQuote(params: SwapParams): Promise<ProviderQuote>;
  getBridgeQuote(params: BridgeParams): Promise<ProviderQuote>;
  getStatus(txHash: string, fromChainId: number, toChainId: number): Promise<StatusResponse>;
}
