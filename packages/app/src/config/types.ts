export type GasTier = 'high' | 'low' | 'ultra-low';
export type ExplorerType = 'blockscout' | 'etherscan';

export interface ExplorerApiConfig {
  type: ExplorerType;
  url: string;
  apiKeyEnvVar?: string; // env var name for API key
}

export interface ChainConfig {
  id: number;
  name: string;
  explorerApi: ExplorerApiConfig;
  lifiChainKey: string;
  gasTier: GasTier;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorerUrl: string;
}

export type TokenViability = 'sweepable' | 'uneconomic' | 'no-route';

export interface ScannedToken {
  chainId: number;
  address: string; // token contract address, or '0x0' for native
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  balanceFormatted: string;
  priceUsd: number | null;
  valueUsd: number | null;
  estimatedGasUsd: number | null;
  viability: TokenViability;
  logoUrl?: string;
}

export interface Quote {
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
  tool: string; // which DEX/bridge
  type: 'swap' | 'bridge';
}

export type SweepPhase =
  | 'idle'
  | 'quoting'
  | 'approving'
  | 'swapping'
  | 'bridging'
  | 'complete'
  | 'error';

export interface ChainSweepState {
  chainId: number;
  phase: SweepPhase;
  tokensTotal: number;
  tokensCompleted: number;
  txHash?: string;
  error?: string;
}

export interface SweepState {
  phase: SweepPhase;
  chains: ChainSweepState[];
  destinationChainId: number;
  destinationAddress: string;
  totalValueUsd: number;
  totalGasUsd: number;
  netProceedsUsd: number;
}

export interface SweepPlan {
  selectedTokens: ScannedToken[];
  quotes: Quote[];
  destinationChainId: number;
  destinationAddress: string;
  totalValueUsd: number;
  totalGasUsd: number;
  netProceedsUsd: number;
}
