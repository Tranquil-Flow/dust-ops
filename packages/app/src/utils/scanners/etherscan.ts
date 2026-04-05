import type { ChainScanner, TokenBalance } from './types';
import { NATIVE_TOKEN_ADDRESS } from '@/config/types';

interface EtherscanBaseResponse {
  status: string;
  message: string;
  result: unknown;
}

interface EtherscanTokenTx {
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimal: string;
}

interface EtherscanTokenTxResponse extends EtherscanBaseResponse {
  result: EtherscanTokenTx[] | string;
}

interface EtherscanBalanceResponse extends EtherscanBaseResponse {
  result: string;
}

export class EtherscanScanner implements ChainScanner {
  chainId: number;
  private baseUrl: string;
  private apiKeyEnvVar?: string;

  constructor(chainId: number, baseUrl: string, apiKeyEnvVar?: string) {
    this.chainId = chainId;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKeyEnvVar = apiKeyEnvVar;
  }

  private get apiKey(): string | undefined {
    if (!this.apiKeyEnvVar) return undefined;
    return process.env[this.apiKeyEnvVar];
  }

  private buildUrl(params: Record<string, string>): string {
    const searchParams = new URLSearchParams(params);
    const key = this.apiKey;
    if (key) {
      searchParams.set('apikey', key);
    }
    return `${this.baseUrl}/api?${searchParams.toString()}`;
  }

  async fetchTokenBalances(address: string): Promise<TokenBalance[]> {
    const [uniqueTokens, nativeBalance] = await Promise.all([
      this.fetchUniqueTokens(address),
      this.fetchNativeBalance(address),
    ]);

    // Fetch current balances for each unique token in parallel
    const tokenBalances = await Promise.all(
      uniqueTokens.map((token) => this.fetchTokenBalance(address, token))
    );

    const results: TokenBalance[] = [];

    // Add native token if balance > 0
    if (nativeBalance !== null && nativeBalance !== '0') {
      results.push({
        address: NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ether',
        decimals: 18,
        balance: nativeBalance,
      });
    }

    // Add ERC-20 tokens with non-zero balances
    for (const tb of tokenBalances) {
      if (tb !== null && tb.balance !== '0') {
        results.push(tb);
      }
    }

    return results;
  }

  /**
   * Fetches token transfer history to discover which tokens the address has interacted with.
   * We deduplicate by contract address to get the unique token set.
   */
  private async fetchUniqueTokens(
    address: string
  ): Promise<EtherscanTokenTx[]> {
    const url = this.buildUrl({
      module: 'account',
      action: 'tokentx',
      address,
      sort: 'desc',
      page: '1',
      offset: '100',
    });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Etherscan API error (chain ${this.chainId}): ${response.status} ${response.statusText}`
      );
    }

    const data: EtherscanTokenTxResponse = await response.json();

    // Status '0' with message 'No transactions found' is a valid empty response
    if (data.status === '0') {
      if (
        typeof data.result === 'string' &&
        (data.result.toLowerCase().includes('no transactions') ||
          data.result.toLowerCase().includes('no records'))
      ) {
        return [];
      }
      // Other error
      throw new Error(
        `Etherscan API error (chain ${this.chainId}): ${data.message} - ${data.result}`
      );
    }

    if (!Array.isArray(data.result)) {
      return [];
    }

    // Deduplicate by contract address (case-insensitive)
    const seen = new Set<string>();
    const unique: EtherscanTokenTx[] = [];
    for (const tx of data.result) {
      const key = tx.contractAddress.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(tx);
      }
    }

    return unique;
  }

  /**
   * Fetches the current ERC-20 balance for a specific token.
   */
  private async fetchTokenBalance(
    address: string,
    token: EtherscanTokenTx
  ): Promise<TokenBalance | null> {
    const url = this.buildUrl({
      module: 'account',
      action: 'tokenbalance',
      contractaddress: token.contractAddress,
      address,
      tag: 'latest',
    });

    const response = await fetch(url);
    if (!response.ok) {
      // Non-fatal: skip this token
      return null;
    }

    const data: EtherscanBalanceResponse = await response.json();

    if (data.status !== '1') {
      // Non-fatal: skip this token
      return null;
    }

    const balance = typeof data.result === 'string' ? data.result : '0';

    return {
      address: token.contractAddress,
      symbol: token.tokenSymbol,
      name: token.tokenName,
      decimals: parseInt(token.tokenDecimal, 10),
      balance,
    };
  }

  /**
   * Fetches the native currency (ETH/POL/etc) balance.
   */
  private async fetchNativeBalance(address: string): Promise<string | null> {
    const url = this.buildUrl({
      module: 'account',
      action: 'balance',
      address,
      tag: 'latest',
    });

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data: EtherscanBalanceResponse = await response.json();

    if (data.status !== '1') {
      return null;
    }

    return typeof data.result === 'string' ? data.result : null;
  }
}
