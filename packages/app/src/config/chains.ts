import type { ChainConfig } from './types';

export const CHAINS: ChainConfig[] = [
  {
    id: 1,
    name: 'Ethereum',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api.etherscan.io',
      apiKeyEnvVar: 'ETHERSCAN_API_KEY',
    },
    lifiChainKey: 'eth',
    gasTier: 'high',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrl: 'https://etherscan.io',
  },
  {
    id: 8453,
    name: 'Base',
    explorerApi: {
      type: 'blockscout',
      url: 'https://base.blockscout.com',
    },
    lifiChainKey: 'bas',
    gasTier: 'ultra-low',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrl: 'https://basescan.org',
  },
  {
    id: 10,
    name: 'Optimism',
    explorerApi: {
      type: 'blockscout',
      url: 'https://optimism.blockscout.com',
    },
    lifiChainKey: 'opt',
    gasTier: 'low',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrl: 'https://optimistic.etherscan.io',
  },
  {
    id: 42161,
    name: 'Arbitrum One',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api.arbiscan.io',
      apiKeyEnvVar: 'ARBISCAN_API_KEY',
    },
    lifiChainKey: 'arb',
    gasTier: 'low',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrl: 'https://arbiscan.io',
  },
  {
    id: 137,
    name: 'Polygon',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api.polygonscan.com',
      apiKeyEnvVar: 'POLYGONSCAN_API_KEY',
    },
    lifiChainKey: 'pol',
    gasTier: 'ultra-low',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    blockExplorerUrl: 'https://polygonscan.com',
  },
  {
    id: 534352,
    name: 'Scroll',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api.scrollscan.com',
      apiKeyEnvVar: 'SCROLLSCAN_API_KEY',
    },
    lifiChainKey: 'scr',
    gasTier: 'low',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrl: 'https://scrollscan.com',
  },
  {
    id: 59144,
    name: 'Linea',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api.lineascan.build',
      apiKeyEnvVar: 'LINEASCAN_API_KEY',
    },
    lifiChainKey: 'lin',
    gasTier: 'low',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrl: 'https://lineascan.build',
  },
  {
    id: 324,
    name: 'zkSync Era',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api-era.zksync.network',
      apiKeyEnvVar: 'ZKSYNC_EXPLORER_API_KEY',
    },
    lifiChainKey: 'era',
    gasTier: 'low',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrl: 'https://era.zksync.network',
  },
  {
    id: 1301,
    name: 'Unichain',
    explorerApi: {
      type: 'blockscout',
      url: 'https://unichain.blockscout.com',
    },
    lifiChainKey: 'uni',
    gasTier: 'ultra-low',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrl: 'https://uniscan.xyz',
  },
];

/** Lookup map by chain ID */
export const CHAIN_MAP: Record<number, ChainConfig> = Object.fromEntries(
  CHAINS.map((c) => [c.id, c])
);

/** Ordered list of supported chain IDs */
export const SUPPORTED_CHAIN_IDS = CHAINS.map((c) => c.id);
