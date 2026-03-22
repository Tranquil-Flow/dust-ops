import { CHAINS } from '../../config/chains';
import { BlockscoutScanner } from './blockscout';
import { EtherscanScanner } from './etherscan';
import type { ChainScanner } from './types';

export function createScanner(chainId: number): ChainScanner {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

  switch (chain.explorerApi.type) {
    case 'blockscout':
      return new BlockscoutScanner(chainId, chain.explorerApi.url);
    case 'etherscan':
      return new EtherscanScanner(
        chainId,
        chain.explorerApi.url,
        chain.explorerApi.apiKeyEnvVar
      );
  }
}

export { type ChainScanner, type TokenBalance } from './types';
