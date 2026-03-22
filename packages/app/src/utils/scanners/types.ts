export interface TokenBalance {
  address: string; // contract address, '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' for native
  symbol: string;
  name: string;
  decimals: number;
  balance: string; // raw balance as string
  logoUrl?: string;
}

export interface ChainScanner {
  chainId: number;
  fetchTokenBalances(address: string): Promise<TokenBalance[]>;
}
