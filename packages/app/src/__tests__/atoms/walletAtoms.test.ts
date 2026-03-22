import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'jotai';
import {
  tokensAtom,
  legacySelectedTokensAtom,
  stepAtom,
  totalValueAtom,
  scannedTokensAtom,
  selectedTokensAtom,
  sweepPlanAtom,
  sweepStateAtom,
  destinationAtom,
  type Token,
} from '../../atoms/walletAtoms';
import type { ScannedToken, SweepPlan, SweepState } from '../../config/types';

/**
 * Helper to create a fresh Jotai store for each test (prevents state leakage).
 */
function makeStore() {
  return createStore();
}

const mockScannedToken: ScannedToken = {
  chainId: 1,
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  balance: BigInt('42150000'),
  balanceFormatted: '42.15',
  priceUsd: 1.0,
  valueUsd: 42.15,
  estimatedGasUsd: 2.5,
  viability: 'sweepable',
};

const mockScannedToken2: ScannedToken = {
  chainId: 8453,
  address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  balance: BigInt('95000000'),
  balanceFormatted: '95.00',
  priceUsd: 1.0,
  valueUsd: 95.0,
  estimatedGasUsd: 0.05,
  viability: 'sweepable',
};

const mockSweepPlan: SweepPlan = {
  selectedTokens: [mockScannedToken, mockScannedToken2],
  quotes: [],
  destinationChainId: 8453,
  destinationAddress: '0x1234567890abcdef1234567890abcdef12345678',
  totalValueUsd: 137.15,
  totalGasUsd: 2.55,
  netProceedsUsd: 134.60,
};

const mockSweepState: SweepState = {
  phase: 'quoting',
  chains: [
    {
      chainId: 1,
      phase: 'quoting',
      tokensTotal: 1,
      tokensCompleted: 0,
    },
  ],
  destinationChainId: 8453,
  destinationAddress: '0x1234567890abcdef1234567890abcdef12345678',
  totalValueUsd: 137.15,
  totalGasUsd: 2.55,
  netProceedsUsd: 134.60,
};

// ---------------------------------------------------------------------------
// scannedTokensAtom
// ---------------------------------------------------------------------------
describe('scannedTokensAtom', () => {
  it('initializes with an empty array', () => {
    const store = makeStore();
    expect(store.get(scannedTokensAtom)).toEqual([]);
  });

  it('can be set to a list of scanned tokens', () => {
    const store = makeStore();
    store.set(scannedTokensAtom, [mockScannedToken]);
    expect(store.get(scannedTokensAtom)).toHaveLength(1);
    expect(store.get(scannedTokensAtom)[0].symbol).toBe('USDC');
  });

  it('can be updated with multiple tokens', () => {
    const store = makeStore();
    store.set(scannedTokensAtom, [mockScannedToken, mockScannedToken2]);
    expect(store.get(scannedTokensAtom)).toHaveLength(2);
  });

  it('can be cleared back to empty', () => {
    const store = makeStore();
    store.set(scannedTokensAtom, [mockScannedToken]);
    store.set(scannedTokensAtom, []);
    expect(store.get(scannedTokensAtom)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// selectedTokensAtom
// ---------------------------------------------------------------------------
describe('selectedTokensAtom', () => {
  it('initializes with an empty array', () => {
    const store = makeStore();
    expect(store.get(selectedTokensAtom)).toEqual([]);
  });

  it('reflects token selection', () => {
    const store = makeStore();
    store.set(selectedTokensAtom, [mockScannedToken]);
    expect(store.get(selectedTokensAtom)).toHaveLength(1);
    expect(store.get(selectedTokensAtom)[0].chainId).toBe(1);
  });

  it('can select multiple tokens across chains', () => {
    const store = makeStore();
    store.set(selectedTokensAtom, [mockScannedToken, mockScannedToken2]);
    const selected = store.get(selectedTokensAtom);
    expect(selected).toHaveLength(2);
    expect(selected.map((t) => t.chainId)).toContain(1);
    expect(selected.map((t) => t.chainId)).toContain(8453);
  });

  it('can deselect by setting to empty', () => {
    const store = makeStore();
    store.set(selectedTokensAtom, [mockScannedToken]);
    store.set(selectedTokensAtom, []);
    expect(store.get(selectedTokensAtom)).toEqual([]);
  });

  it('stores bigint balances correctly', () => {
    const store = makeStore();
    store.set(selectedTokensAtom, [mockScannedToken]);
    const token = store.get(selectedTokensAtom)[0];
    expect(token.balance).toBe(BigInt('42150000'));
    expect(typeof token.balance).toBe('bigint');
  });
});

// ---------------------------------------------------------------------------
// destinationAtom
// ---------------------------------------------------------------------------
describe('destinationAtom', () => {
  it('initializes with Base chain (8453) and empty address', () => {
    const store = makeStore();
    const dest = store.get(destinationAtom);
    expect(dest.chainId).toBe(8453);
    expect(dest.address).toBe('');
  });

  it('can update the destination address', () => {
    const store = makeStore();
    store.set(destinationAtom, {
      chainId: 8453,
      address: '0x1234567890abcdef1234567890abcdef12345678',
    });
    expect(store.get(destinationAtom).address).toBe(
      '0x1234567890abcdef1234567890abcdef12345678'
    );
  });

  it('can update the destination chain', () => {
    const store = makeStore();
    store.set(destinationAtom, { chainId: 1, address: '' });
    expect(store.get(destinationAtom).chainId).toBe(1);
  });

  it('can update both chainId and address together', () => {
    const store = makeStore();
    store.set(destinationAtom, {
      chainId: 42161,
      address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    });
    const dest = store.get(destinationAtom);
    expect(dest.chainId).toBe(42161);
    expect(dest.address).toBe('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  });
});

// ---------------------------------------------------------------------------
// sweepPlanAtom
// ---------------------------------------------------------------------------
describe('sweepPlanAtom', () => {
  it('initializes as null', () => {
    const store = makeStore();
    expect(store.get(sweepPlanAtom)).toBeNull();
  });

  it('can be set to a sweep plan', () => {
    const store = makeStore();
    store.set(sweepPlanAtom, mockSweepPlan);
    const plan = store.get(sweepPlanAtom);
    expect(plan).not.toBeNull();
    expect(plan?.totalValueUsd).toBe(137.15);
    expect(plan?.netProceedsUsd).toBe(134.60);
    expect(plan?.selectedTokens).toHaveLength(2);
  });

  it('can be cleared back to null', () => {
    const store = makeStore();
    store.set(sweepPlanAtom, mockSweepPlan);
    store.set(sweepPlanAtom, null);
    expect(store.get(sweepPlanAtom)).toBeNull();
  });

  it('stores destination info correctly in the plan', () => {
    const store = makeStore();
    store.set(sweepPlanAtom, mockSweepPlan);
    const plan = store.get(sweepPlanAtom);
    expect(plan?.destinationChainId).toBe(8453);
    expect(plan?.destinationAddress).toBe(
      '0x1234567890abcdef1234567890abcdef12345678'
    );
  });
});

// ---------------------------------------------------------------------------
// sweepStateAtom — sweep state machine transitions
// ---------------------------------------------------------------------------
describe('sweepStateAtom', () => {
  it('initializes as null (idle)', () => {
    const store = makeStore();
    expect(store.get(sweepStateAtom)).toBeNull();
  });

  it('transitions to quoting phase', () => {
    const store = makeStore();
    store.set(sweepStateAtom, mockSweepState);
    expect(store.get(sweepStateAtom)?.phase).toBe('quoting');
  });

  it('transitions through sweep phases', () => {
    const store = makeStore();
    const phases: Array<SweepState['phase']> = [
      'quoting',
      'approving',
      'swapping',
      'bridging',
      'complete',
    ];

    for (const phase of phases) {
      store.set(sweepStateAtom, { ...mockSweepState, phase });
      expect(store.get(sweepStateAtom)?.phase).toBe(phase);
    }
  });

  it('transitions to error phase with error message', () => {
    const store = makeStore();
    store.set(sweepStateAtom, {
      ...mockSweepState,
      phase: 'error',
      chains: [
        {
          chainId: 1,
          phase: 'error',
          tokensTotal: 1,
          tokensCompleted: 0,
          error: 'Insufficient gas',
        },
      ],
    });
    const state = store.get(sweepStateAtom);
    expect(state?.phase).toBe('error');
    expect(state?.chains[0].error).toBe('Insufficient gas');
  });

  it('can be reset to null after completion', () => {
    const store = makeStore();
    store.set(sweepStateAtom, { ...mockSweepState, phase: 'complete' });
    store.set(sweepStateAtom, null);
    expect(store.get(sweepStateAtom)).toBeNull();
  });

  it('tracks per-chain progress', () => {
    const store = makeStore();
    store.set(sweepStateAtom, {
      ...mockSweepState,
      phase: 'swapping',
      chains: [
        { chainId: 1, phase: 'swapping', tokensTotal: 3, tokensCompleted: 1 },
        { chainId: 8453, phase: 'complete', tokensTotal: 2, tokensCompleted: 2, txHash: '0xabc' },
      ],
    });
    const state = store.get(sweepStateAtom);
    expect(state?.chains).toHaveLength(2);
    expect(state?.chains[0].tokensCompleted).toBe(1);
    expect(state?.chains[1].txHash).toBe('0xabc');
  });
});

// ---------------------------------------------------------------------------
// Legacy atoms
// ---------------------------------------------------------------------------
describe('Legacy atoms', () => {
  it('tokensAtom initializes empty', () => {
    const store = makeStore();
    expect(store.get(tokensAtom)).toEqual([]);
  });

  it('legacySelectedTokensAtom initializes empty', () => {
    const store = makeStore();
    expect(store.get(legacySelectedTokensAtom)).toEqual([]);
  });

  it('stepAtom initializes at 0', () => {
    const store = makeStore();
    expect(store.get(stepAtom)).toBe(0);
  });

  it('stepAtom can be incremented', () => {
    const store = makeStore();
    store.set(stepAtom, 1);
    expect(store.get(stepAtom)).toBe(1);
    store.set(stepAtom, 2);
    expect(store.get(stepAtom)).toBe(2);
  });

  it('totalValueAtom initializes at 0', () => {
    const store = makeStore();
    expect(store.get(totalValueAtom)).toBe(0);
  });

  it('tokensAtom can be set with legacy Token shape', () => {
    const store = makeStore();
    const legacyToken: Token = {
      id: 1,
      symbol: 'USDC',
      name: 'USD Coin',
      chain: 'Ethereum',
      balance: '42.15',
      value: '$42.15',
      liquid: true,
      selected: false,
    };
    store.set(tokensAtom, [legacyToken]);
    expect(store.get(tokensAtom)).toHaveLength(1);
    expect(store.get(tokensAtom)[0].symbol).toBe('USDC');
  });
});

// ---------------------------------------------------------------------------
// Store isolation: atoms from different stores don't share state
// ---------------------------------------------------------------------------
describe('Store isolation', () => {
  it('two stores do not share state', () => {
    const store1 = makeStore();
    const store2 = makeStore();

    store1.set(scannedTokensAtom, [mockScannedToken]);

    expect(store1.get(scannedTokensAtom)).toHaveLength(1);
    expect(store2.get(scannedTokensAtom)).toHaveLength(0);
  });

  it('destination changes in one store do not affect another', () => {
    const store1 = makeStore();
    const store2 = makeStore();

    store1.set(destinationAtom, { chainId: 1, address: '0xabc' });

    expect(store1.get(destinationAtom).chainId).toBe(1);
    expect(store2.get(destinationAtom).chainId).toBe(8453); // default
  });
});
