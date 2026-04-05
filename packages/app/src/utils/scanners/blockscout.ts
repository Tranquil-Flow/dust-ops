import type { ChainScanner, TokenBalance } from './types';
import { NATIVE_TOKEN_ADDRESS } from '@/config/types';

interface BlockscoutTokenItem {
  token: {
    address: string;
    symbol: string;
    name: string;
    decimals: string;
    icon_url?: string | null;
  };
  value: string;
}

interface BlockscoutTokensResponse {
  items: BlockscoutTokenItem[];
  next_page_params?: {
    fiat_value?: string;
    id?: number;
    value?: string;
  } | null;
}

interface BlockscoutAddressResponse {
  coin_balance: string | null;
  // other fields we don't need
}

export class BlockscoutScanner implements ChainScanner {
  chainId: number;
  private baseUrl: string;

  constructor(chainId: number, baseUrl: string) {
    this.chainId = chainId;
    // Normalize: strip trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async fetchTokenBalances(address: string): Promise<TokenBalance[]> {
    const [erc20Tokens, nativeBalance] = await Promise.all([
      this.fetchERC20Tokens(address),
      this.fetchNativeBalance(address),
    ]);

    const results: TokenBalance[] = [];

    // Add native token if balance > 0
    if (nativeBalance !== null && nativeBalance !== '0') {
      // We need chain's native currency info — we'll use a minimal placeholder
      // The caller (scan route) can enrich with chain config if needed
      results.push({
        address: NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ether',
        decimals: 18,
        balance: nativeBalance,
      });
    }

    results.push(...erc20Tokens);

    return results;
  }

  private async fetchERC20Tokens(address: string): Promise<TokenBalance[]> {
    const tokens: TokenBalance[] = [];
    let url: string | null =
      `${this.baseUrl}/api/v2/addresses/${address}/tokens?type=ERC-20`;

    while (url !== null) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Blockscout API error (chain ${this.chainId}): ${response.status} ${response.statusText}`
        );
      }

      const data: BlockscoutTokensResponse = await response.json();

      for (const item of data.items) {
        // Skip tokens with zero balance
        if (item.value === '0') continue;

        tokens.push({
          address: item.token.address,
          symbol: item.token.symbol,
          name: item.token.name,
          decimals: parseInt(item.token.decimals, 10),
          balance: item.value,
          ...(item.token.icon_url ? { logoUrl: item.token.icon_url } : {}),
        });
      }

      // Handle pagination
      if (data.next_page_params) {
        const params = new URLSearchParams({
          type: 'ERC-20',
        });
        if (data.next_page_params.fiat_value !== undefined && data.next_page_params.fiat_value !== null) {
          params.set('fiat_value', String(data.next_page_params.fiat_value));
        }
        if (data.next_page_params.id !== undefined && data.next_page_params.id !== null) {
          params.set('id', String(data.next_page_params.id));
        }
        if (data.next_page_params.value !== undefined && data.next_page_params.value !== null) {
          params.set('value', String(data.next_page_params.value));
        }
        url = `${this.baseUrl}/api/v2/addresses/${address}/tokens?${params.toString()}`;
      } else {
        url = null;
      }
    }

    return tokens;
  }

  private async fetchNativeBalance(address: string): Promise<string | null> {
    const url = `${this.baseUrl}/api/v2/addresses/${address}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Blockscout API error (chain ${this.chainId}): ${response.status} ${response.statusText}`
      );
    }
    const data: BlockscoutAddressResponse = await response.json();
    return data.coin_balance ?? null;
  }
}
