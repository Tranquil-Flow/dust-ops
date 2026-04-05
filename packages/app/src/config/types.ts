export type GasTier = 'high' | 'low' | 'ultra-low';
export type ExplorerType = 'blockscout' | 'etherscan';

/**
 * Canonical sentinel address for native gas tokens (ETH, POL, etc.)
 * Used by LI.FI, 1inch, and most EVM aggregators.
 * All scanner adapters, swap providers, and the sweep hook must use this constant —
 * never use '0x0', AddressZero, or any other zero address to represent native tokens.
 */
export const NATIVE_TOKEN_ADDRESS =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const;

/**
 * Type guard: returns true if the given address represents the native gas token.
 * Use this everywhere instead of ad-hoc address comparisons.
 */
export function isNativeToken(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

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
  /**
   * Public JSON-RPC endpoint for gas price estimation (no API key required).
   * Used by viability classification at scan time.
   */
  publicRpcUrl: string;
}

/**
 * Viability gas buffer multiplier default (1.2×).
 * Token must be worth at least 1.2× gas cost to be classified as sweepable.
 * Override via VIABILITY_GAS_BUFFER env var.
 */
export const VIABILITY_GAS_BUFFER_DEFAULT = 1.2;

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

/**
 * Sweep execution mode.
 *  - `batch`      — EIP-5792 wallet_sendCalls (default, requires modern wallet)
 *  - `sequential` — Individual eth_sendTransaction calls for older wallets
 */
export type SweepMode = 'batch' | 'sequential';

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
