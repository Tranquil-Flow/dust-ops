import { describe, it, expect } from 'vitest';
import { CHAINS, CHAIN_MAP, SUPPORTED_CHAIN_IDS } from '../../config/chains';

describe('Chain Registry', () => {
  it('contains exactly 9 chains', () => {
    expect(CHAINS).toHaveLength(9);
  });

  it('includes all expected chain IDs', () => {
    const expectedIds = [1, 8453, 10, 42161, 137, 534352, 59144, 324, 1301];
    const actualIds = CHAINS.map((c) => c.id);
    for (const id of expectedIds) {
      expect(actualIds).toContain(id);
    }
  });

  it('includes all expected chain names', () => {
    const names = CHAINS.map((c) => c.name);
    expect(names).toContain('Ethereum');
    expect(names).toContain('Base');
    expect(names).toContain('Optimism');
    expect(names).toContain('Arbitrum One');
    expect(names).toContain('Polygon');
    expect(names).toContain('Scroll');
    expect(names).toContain('Linea');
    expect(names).toContain('zkSync Era');
    expect(names).toContain('Unichain');
  });

  describe('each chain has a valid config shape', () => {
    for (const chain of CHAINS) {
      it(`chain ${chain.name} (${chain.id}) has valid shape`, () => {
        expect(typeof chain.id).toBe('number');
        expect(chain.id).toBeGreaterThan(0);

        expect(typeof chain.name).toBe('string');
        expect(chain.name.length).toBeGreaterThan(0);

        expect(typeof chain.lifiChainKey).toBe('string');
        expect(chain.lifiChainKey.length).toBeGreaterThan(0);

        expect(['high', 'low', 'ultra-low']).toContain(chain.gasTier);

        expect(chain.nativeCurrency).toBeDefined();
        expect(typeof chain.nativeCurrency.name).toBe('string');
        expect(typeof chain.nativeCurrency.symbol).toBe('string');
        expect(chain.nativeCurrency.decimals).toBe(18);

        expect(typeof chain.blockExplorerUrl).toBe('string');
        expect(chain.blockExplorerUrl).toMatch(/^https?:\/\//);

        // Explorer API
        expect(['blockscout', 'etherscan']).toContain(chain.explorerApi.type);
        expect(typeof chain.explorerApi.url).toBe('string');
        expect(chain.explorerApi.url).toMatch(/^https?:\/\//);
      });
    }
  });

  it('Ethereum has gas tier "high"', () => {
    const eth = CHAINS.find((c) => c.id === 1);
    expect(eth?.gasTier).toBe('high');
  });

  it('Base has gas tier "ultra-low"', () => {
    const base = CHAINS.find((c) => c.id === 8453);
    expect(base?.gasTier).toBe('ultra-low');
  });

  it('Polygon has ultra-low gas tier', () => {
    const poly = CHAINS.find((c) => c.id === 137);
    expect(poly?.gasTier).toBe('ultra-low');
  });

  it('Ethereum uses etherscan explorer type', () => {
    const eth = CHAINS.find((c) => c.id === 1);
    expect(eth?.explorerApi.type).toBe('etherscan');
    expect(eth?.explorerApi.apiKeyEnvVar).toBe('ETHERSCAN_API_KEY');
  });

  it('Base uses blockscout explorer type (no apiKey required)', () => {
    const base = CHAINS.find((c) => c.id === 8453);
    expect(base?.explorerApi.type).toBe('blockscout');
    expect(base?.explorerApi.apiKeyEnvVar).toBeUndefined();
  });

  it('Optimism uses blockscout explorer type', () => {
    const op = CHAINS.find((c) => c.id === 10);
    expect(op?.explorerApi.type).toBe('blockscout');
  });

  it('Unichain uses blockscout explorer type', () => {
    const uni = CHAINS.find((c) => c.id === 1301);
    expect(uni?.explorerApi.type).toBe('blockscout');
    expect(uni?.explorerApi.apiKeyEnvVar).toBeUndefined();
  });

  describe('CHAIN_MAP', () => {
    it('maps chain IDs to the correct chain config', () => {
      expect(CHAIN_MAP[1].name).toBe('Ethereum');
      expect(CHAIN_MAP[8453].name).toBe('Base');
      expect(CHAIN_MAP[10].name).toBe('Optimism');
      expect(CHAIN_MAP[42161].name).toBe('Arbitrum One');
      expect(CHAIN_MAP[137].name).toBe('Polygon');
      expect(CHAIN_MAP[534352].name).toBe('Scroll');
      expect(CHAIN_MAP[59144].name).toBe('Linea');
      expect(CHAIN_MAP[324].name).toBe('zkSync Era');
      expect(CHAIN_MAP[1301].name).toBe('Unichain');
    });

    it('has same number of entries as CHAINS', () => {
      expect(Object.keys(CHAIN_MAP)).toHaveLength(CHAINS.length);
    });

    it('returns undefined for unsupported chain IDs', () => {
      expect(CHAIN_MAP[99999]).toBeUndefined();
    });
  });

  describe('SUPPORTED_CHAIN_IDS', () => {
    it('contains all chain IDs from CHAINS', () => {
      expect(SUPPORTED_CHAIN_IDS).toHaveLength(CHAINS.length);
      for (const chain of CHAINS) {
        expect(SUPPORTED_CHAIN_IDS).toContain(chain.id);
      }
    });

    it('has unique IDs', () => {
      const unique = new Set(SUPPORTED_CHAIN_IDS);
      expect(unique.size).toBe(SUPPORTED_CHAIN_IDS.length);
    });
  });

  describe('etherscan chains have apiKeyEnvVar', () => {
    it('all etherscan-type chains have an apiKeyEnvVar', () => {
      const etherscanChains = CHAINS.filter((c) => c.explorerApi.type === 'etherscan');
      for (const chain of etherscanChains) {
        expect(chain.explorerApi.apiKeyEnvVar).toBeDefined();
        expect(typeof chain.explorerApi.apiKeyEnvVar).toBe('string');
      }
    });

    it('all blockscout-type chains do NOT have apiKeyEnvVar', () => {
      const blockscoutChains = CHAINS.filter((c) => c.explorerApi.type === 'blockscout');
      for (const chain of blockscoutChains) {
        expect(chain.explorerApi.apiKeyEnvVar).toBeUndefined();
      }
    });
  });

  describe('lifiChainKey uniqueness', () => {
    it('all lifiChainKeys are unique', () => {
      const keys = CHAINS.map((c) => c.lifiChainKey);
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    });
  });
});
