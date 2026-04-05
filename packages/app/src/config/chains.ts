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
    publicRpcUrl: 'https://eth.llamarpc.com',
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
    publicRpcUrl: 'https://mainnet.base.org',
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
    publicRpcUrl: 'https://mainnet.optimism.io',
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
    publicRpcUrl: 'https://arb1.arbitrum.io/rpc',
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
    publicRpcUrl: 'https://polygon-rpc.com',
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
    publicRpcUrl: 'https://rpc.scroll.io',
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
    publicRpcUrl: 'https://rpc.linea.build',
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
    publicRpcUrl: 'https://mainnet.era.zksync.io',
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
    publicRpcUrl: 'https://mainnet.unichain.org',
  },
  // ── Phase 4 expansion chains ──────────────────────────────────────────────
  {
    id: 100,
    name: 'Gnosis',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api.gnosisscan.io',
      apiKeyEnvVar: 'GNOSISSCAN_API_KEY',
    },
    lifiChainKey: 'dai',
    gasTier: 'ultra-low',
    nativeCurrency: { name: 'xDAI', symbol: 'xDAI', decimals: 18 },
    blockExplorerUrl: 'https://gnosisscan.io',
    publicRpcUrl: 'https://rpc.gnosischain.com',
  },
  {
    id: 56,
    name: 'BNB Chain',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api.bscscan.com',
      apiKeyEnvVar: 'BSCSCAN_API_KEY',
    },
    lifiChainKey: 'bsc',
    gasTier: 'low',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    blockExplorerUrl: 'https://bscscan.com',
    publicRpcUrl: 'https://bsc-dataseed.binance.org',
  },
  {
    id: 43114,
    name: 'Avalanche C-Chain',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api.snowscan.xyz',
      apiKeyEnvVar: 'SNOWSCAN_API_KEY',
    },
    lifiChainKey: 'ava',
    gasTier: 'low',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    blockExplorerUrl: 'https://snowscan.xyz',
    publicRpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
  },
  {
    id: 5000,
    name: 'Mantle',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api.mantlescan.xyz',
      apiKeyEnvVar: 'MANTLESCAN_API_KEY',
    },
    lifiChainKey: 'mnt',
    gasTier: 'ultra-low',
    nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
    blockExplorerUrl: 'https://mantlescan.xyz',
    publicRpcUrl: 'https://rpc.mantle.xyz',
  },
  {
    id: 34443,
    name: 'Mode',
    explorerApi: {
      type: 'blockscout',
      url: 'https://explorer.mode.network',
    },
    lifiChainKey: 'mod',
    gasTier: 'ultra-low',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrl: 'https://modescan.io',
    publicRpcUrl: 'https://mainnet.mode.network',
  },
  {
    id: 81457,
    name: 'Blast',
    explorerApi: {
      type: 'etherscan',
      url: 'https://api.blastscan.io',
      apiKeyEnvVar: 'BLASTSCAN_API_KEY',
    },
    lifiChainKey: 'bls',
    gasTier: 'ultra-low',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrl: 'https://blastscan.io',
    publicRpcUrl: 'https://rpc.blast.io',
  },
];

/** Lookup map by chain ID */
export const CHAIN_MAP: Record<number, ChainConfig> = Object.fromEntries(
  CHAINS.map((c) => [c.id, c])
);

/** Ordered list of supported chain IDs */
export const SUPPORTED_CHAIN_IDS = CHAINS.map((c) => c.id);
