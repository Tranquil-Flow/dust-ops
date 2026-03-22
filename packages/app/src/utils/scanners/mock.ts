import type { ChainScanner, TokenBalance } from './types';

/** Sleep helper */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Token definitions per chain.
 * Mix of sweepable (good balance), uneconomic (tiny balance), and no-route (obscure).
 */
const CHAIN_TOKENS: Record<number, TokenBalance[]> = {
  // Ethereum Mainnet (chainId 1)
  1: [
    {
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      balance: '42150000', // 42.15 USDC — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      balance: '18500000', // 18.50 USDT — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether-logo.png',
    },
    {
      address: '0x6b175474e89094c44da98b954eedeac495271d0f',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      balance: '3200000000000000000', // 3.20 DAI — uneconomic after gas
      logoUrl: 'https://assets.coingecko.com/coins/images/9956/small/4943.png',
    },
    {
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      symbol: 'LINK',
      name: 'ChainLink Token',
      decimals: 18,
      balance: '850000000000000000', // 0.85 LINK — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
    },
    {
      address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      symbol: 'UNI',
      name: 'Uniswap',
      decimals: 18,
      balance: '120000000000000', // 0.00012 UNI — uneconomic dust
      logoUrl: 'https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png',
    },
    {
      address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      symbol: 'AAVE',
      name: 'Aave Token',
      decimals: 18,
      balance: '210000000000000000', // 0.21 AAVE — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/12645/small/AAVE.png',
    },
    {
      address: '0xd533a949740bb3306d119cc777fa900ba034cd52',
      symbol: 'CRV',
      name: 'Curve DAO Token',
      decimals: 18,
      balance: '50000000000000', // 0.00005 CRV — uneconomic dust
      logoUrl: 'https://assets.coingecko.com/coins/images/12124/small/Curve.png',
    },
    {
      address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      balance: '15000000000000000', // 0.015 WETH — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    },
  ],

  // Base (chainId 8453)
  8453: [
    {
      address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      balance: '95000000', // 95.00 USDC — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      balance: '8500000000000000', // 0.0085 WETH — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    },
    {
      address: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      balance: '900000000000000000', // 0.90 DAI — borderline
      logoUrl: 'https://assets.coingecko.com/coins/images/9956/small/4943.png',
    },
    {
      address: '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca',
      symbol: 'USDbC',
      name: 'USD Base Coin',
      decimals: 6,
      balance: '1200', // 0.0012 USDbC — uneconomic dust
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      address: '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22',
      symbol: 'cbETH',
      name: 'Coinbase Wrapped Staked ETH',
      decimals: 18,
      balance: '5200000000000000', // 0.0052 cbETH — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/27008/small/cbeth.png',
    },
    {
      address: '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0001',
      symbol: 'OBSCURE',
      name: 'Obscure Base Token',
      decimals: 18,
      balance: '1000000000000000000', // 1.0 — no route available
    },
  ],

  // Optimism (chainId 10)
  10: [
    {
      address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      balance: '67800000', // 67.80 USDC — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      address: '0x4200000000000000000000000000000000000042',
      symbol: 'OP',
      name: 'Optimism',
      decimals: 18,
      balance: '12000000000000000000', // 12.0 OP — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
    },
    {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      balance: '3100000000000000', // 0.0031 WETH — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    },
    {
      address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      balance: '500', // 0.0005 USDT — dust
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether-logo.png',
    },
    {
      address: '0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6',
      symbol: 'LINK',
      name: 'ChainLink Token',
      decimals: 18,
      balance: '2300000000000000000', // 2.3 LINK — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
    },
  ],

  // Arbitrum (chainId 42161)
  42161: [
    {
      address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      balance: '123400000', // 123.40 USDC — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      address: '0x912ce59144191c1204e64559fe8253a0e49e6548',
      symbol: 'ARB',
      name: 'Arbitrum',
      decimals: 18,
      balance: '55000000000000000000', // 55.0 ARB — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
    },
    {
      address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      balance: '7200000000000000', // 0.0072 WETH — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    },
    {
      address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      balance: '9800000', // 9.80 USDT — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether-logo.png',
    },
    {
      address: '0xf97f4df75117a78c1a5a0dbb814af92458539fb4',
      symbol: 'LINK',
      name: 'ChainLink Token',
      decimals: 18,
      balance: '100000000000000', // 0.0001 LINK — dust
      logoUrl: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
    },
    {
      address: '0xfaketoken0000000000000000000000000000001',
      symbol: 'RANDO',
      name: 'Random Obscure Arb Token',
      decimals: 18,
      balance: '500000000000000000', // 0.5 — no route
    },
  ],

  // Polygon (chainId 137)
  137: [
    {
      address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      balance: '31000000', // 31.00 USDC — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
      symbol: 'WMATIC',
      name: 'Wrapped Matic',
      decimals: 18,
      balance: '180000000000000000000', // 180.0 WMATIC — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
    },
    {
      address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      balance: '2100', // 0.0021 USDT — dust
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether-logo.png',
    },
    {
      address: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      balance: '7500000000000000000', // 7.5 DAI — sweepable
      logoUrl: 'https://assets.coingecko.com/coins/images/9956/small/4943.png',
    },
  ],
};

/** Fallback tokens for chains not explicitly listed */
const DEFAULT_TOKENS: TokenBalance[] = [
  {
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    balance: '5000000', // 5.00 USDC
    logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  },
  {
    address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    balance: '3000000', // 3.00 USDT
    logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether-logo.png',
  },
];

export class MockScanner implements ChainScanner {
  chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  async fetchTokenBalances(_address: string): Promise<TokenBalance[]> {
    // Simulate network latency
    await sleep(500);
    return CHAIN_TOKENS[this.chainId] ?? DEFAULT_TOKENS;
  }
}
