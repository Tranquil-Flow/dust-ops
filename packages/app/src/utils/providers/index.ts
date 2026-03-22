import { isDemoMode } from '../../config/demo';
import { LiFiProvider } from './lifi';
import { MockSwapProvider } from './mock';
import type { SwapProvider } from './types';

let _provider: SwapProvider | null = null;

export function getSwapProvider(): SwapProvider {
  if (isDemoMode()) {
    return new MockSwapProvider();
  }
  if (!_provider) {
    _provider = new LiFiProvider();
  }
  return _provider;
}

export type {
  SwapProvider,
  SwapParams,
  BridgeParams,
  ProviderQuote,
  TxStatus,
  StatusResponse,
} from './types';
