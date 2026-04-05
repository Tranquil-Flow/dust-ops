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

/**
 * Maximum number of pages to fetch from the Etherscan tokentx endpoint.
 * Each page returns up to 100 transactions.
 * Default: 20 pages = up to 2000 token transfer records.
 * Override via ETHERSCAN_MAX_PAGES env var.
 */
const ETHERSCAN_MAX_PAGES: number = (() => {
  const envVal = process.env.ETHERSCAN_MAX_PAGES;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 20;
})();

/** Number of transactions returned per Etherscan API page (their max is 10 000, but 100 is safe default) */
const PAGE_SIZE = 100;

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
   * Fetches token transfer history across multiple pages to discover all tokens
   * the address has ever interacted with, then deduplicates by contract address.
   *
   * Pagination: requests pages 1..N (up to ETHERSCAN_MAX_PAGES) with PAGE_SIZE=100.
   * Stops early when a page returns fewer than PAGE_SIZE results (last page signal).
   *
   * This correctly discovers tokens even for whale addresses with 1000+ transfers.
   */
  private async fetchUniqueTokens(
    address: string
  ): Promise<EtherscanTokenTx[]> {
    const seen = new Set<string>();
    const unique: EtherscanTokenTx[] = [];

    for (let page = 1; page <= ETHERSCAN_MAX_PAGES; page++) {
      const url = this.buildUrl({
        module: 'account',
        action: 'tokentx',
        address,
        sort: 'desc',
        page: String(page),
        offset: String(PAGE_SIZE),
      });

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Etherscan API error (chain ${this.chainId}): ${response.status} ${response.statusText}`
        );
      }

      const data: EtherscanTokenTxResponse = await response.json();

      // Status '0' with a "no transactions" message is valid empty response
      if (data.status === '0') {
        if (
          typeof data.result === 'string' &&
          (data.result.toLowerCase().includes('no transactions') ||
            data.result.toLowerCase().includes('no records'))
        ) {
          // Empty — stop pagination
          break;
        }
        // Other API-level error
        throw new Error(
          `Etherscan API error (chain ${this.chainId}): ${data.message} - ${data.result}`
        );
      }

      if (!Array.isArray(data.result)) {
        // Unexpected shape — stop pagination defensively
        break;
      }

      const pageTxs = data.result;

      // Deduplicate by contract address (case-insensitive) across all pages
      for (const tx of pageTxs) {
        const key = tx.contractAddress.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(tx);
        }
      }

      // If fewer results than PAGE_SIZE, this was the last page — stop early
      if (pageTxs.length < PAGE_SIZE) {
        break;
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
