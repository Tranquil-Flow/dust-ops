import { describe, it, expect } from 'vitest';
import { NATIVE_TOKEN_ADDRESS, isNativeToken } from '../../config/types';

describe('NATIVE_TOKEN_ADDRESS', () => {
  it('is the canonical LI.FI / 1inch native token sentinel', () => {
    expect(NATIVE_TOKEN_ADDRESS).toBe('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
  });

  it('is a 42-character Ethereum address', () => {
    expect(NATIVE_TOKEN_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('is not the zero address', () => {
    expect(NATIVE_TOKEN_ADDRESS).not.toBe('0x0000000000000000000000000000000000000000');
  });

  it('is not a bare 0x0 sentinel', () => {
    expect(NATIVE_TOKEN_ADDRESS).not.toBe('0x0');
  });
});

describe('isNativeToken()', () => {
  it('returns true for the exact canonical address', () => {
    expect(isNativeToken('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')).toBe(true);
  });

  it('returns true for lowercase version (case-insensitive)', () => {
    expect(isNativeToken('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')).toBe(true);
  });

  it('returns true for uppercase version (case-insensitive)', () => {
    expect(isNativeToken('0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE')).toBe(true);
  });

  it('returns true for NATIVE_TOKEN_ADDRESS itself', () => {
    expect(isNativeToken(NATIVE_TOKEN_ADDRESS)).toBe(true);
  });

  it('returns false for zero address', () => {
    expect(isNativeToken('0x0000000000000000000000000000000000000000')).toBe(false);
  });

  it('returns false for bare 0x0 sentinel', () => {
    expect(isNativeToken('0x0')).toBe(false);
  });

  it('returns false for a real ERC-20 token address', () => {
    // USDC on Ethereum
    expect(isNativeToken('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isNativeToken('')).toBe(false);
  });
});
