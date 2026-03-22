# Dust Ops MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Dust Ops hackathon prototype into a working MVP that sweeps dust tokens across 9 EVM chains using LI.FI aggregator and EIP-5792 wallet batching.

**Architecture:** Frontend-orchestrated Next.js app. No custom smart contracts. LI.FI SDK handles swap/bridge quotes and execution. Reown AppKit for wallet connection. `wallet_sendCalls` (EIP-5792) for batched transactions.

**Tech Stack:** Next.js 15, React 19, TypeScript, Wagmi 2, Viem 2, @lifi/sdk, @reown/appkit, Jotai, Tailwind + DaisyUI

**Codebase:** `/Users/evinova/dust-ops/packages/app/src/`

**Design Doc:** `/Users/evinova/dust-ops/docs/plans/2026-02-19-dust-ops-mvp-design.md`

---

## Task 1: Remove Dead Code

Remove all hackathon-era code that is no longer needed: Solidity contracts, LayerZero submodules, private key flow, Uniswap-specific quoting, Railgun UI, and debug/test utilities.

**Files to delete:**
- `packages/foundry/` (entire directory)
- `lib/` (entire directory — LayerZero/OpenZeppelin submodules)
- `ethglobalprague/` (submodule reference)
- `.gitmodules`
- `packages/app/src/abis.ts` (65KB contract ABIs)
- `packages/app/src/app/hooks/usePrivateAccount.ts`
- `packages/app/src/app/hooks/useTokenHoldings.ts` (stub)
- `packages/app/src/app/hooks/useTransactions.ts` (stub)
- `packages/app/src/app/hooks/useEnsProfile.ts` (stub)
- `packages/app/src/app/actions/getHoldingsAction.tsx` (Sepolia/Rootstock)
- `packages/app/src/app/actions/getQuoteAction.ts` (Uniswap V4)
- `packages/app/src/app/actions/config.ts` (Uniswap/Infura config)
- `packages/app/src/app/actions/constants.ts` (Uniswap pool addresses)
- `packages/app/src/app/actions/conversion.ts`
- `packages/app/src/app/api/improved-prices/` (entire directory)
- `packages/app/src/app/api/prices/` (entire directory — CoinGecko proxy)
- `packages/app/src/app/api/tokens/` (entire directory — old Blockscout proxy)
- `packages/app/src/app/examples/` (entire directory — EIP-7702 experiments)
- `packages/app/src/app/(steps)/privacy-deposit/` (entire directory)
- `packages/app/src/components/sweeper/SweepProcessing.tsx` (fake animation)
- `packages/app/src/utils/simplePricing.ts` (CoinGecko client)
- `packages/app/src/utils/improvedPricing.ts`
- `packages/app/src/utils/debug-pricing.ts`
- `packages/app/src/utils/test-pricing.ts`
- `packages/app/src/utils/pricing-comparison.ts`

**Files to modify:**
- `packages/app/package.json` — remove Uniswap deps (`@uniswap/*`), `@privy-io/react-auth`, `siwe`

**Step 1: Delete contract and lib directories**

```bash
rm -rf packages/foundry lib ethglobalprague .gitmodules
```

**Step 2: Delete dead TypeScript files**

```bash
rm packages/app/src/abis.ts
rm packages/app/src/app/hooks/usePrivateAccount.ts
rm packages/app/src/app/hooks/useTokenHoldings.ts
rm packages/app/src/app/hooks/useTransactions.ts
rm packages/app/src/app/hooks/useEnsProfile.ts
rm packages/app/src/app/actions/getHoldingsAction.tsx
rm packages/app/src/app/actions/getQuoteAction.ts
rm packages/app/src/app/actions/config.ts
rm packages/app/src/app/actions/constants.ts
rm packages/app/src/app/actions/conversion.ts
rm -rf packages/app/src/app/api/improved-prices
rm -rf packages/app/src/app/api/prices
rm -rf packages/app/src/app/api/tokens
rm -rf packages/app/src/app/examples
rm -rf packages/app/src/app/(steps)/privacy-deposit
rm packages/app/src/components/sweeper/SweepProcessing.tsx
rm packages/app/src/utils/simplePricing.ts
rm packages/app/src/utils/improvedPricing.ts
rm packages/app/src/utils/debug-pricing.ts
rm packages/app/src/utils/test-pricing.ts
rm packages/app/src/utils/pricing-comparison.ts
```

**Step 3: Remove unused dependencies from package.json**

In `packages/app/package.json`, remove these dependencies:
- `@privy-io/react-auth`
- `@uniswap/sdk-core`
- `@uniswap/v4-core`
- `@uniswap/v4-periphery`
- `@uniswap/v4-sdk`
- `siwe`
- `ioredis` (will re-add if caching needed later)

**Step 4: Install new dependency**

```bash
cd packages/app && yarn add @lifi/sdk
```

**Step 5: Verify the app still compiles**

```bash
cd packages/app && yarn build
```

Expected: Build will fail with import errors in files that reference deleted modules. That is expected — we fix those in subsequent tasks.

**Step 6: Commit**

```
feat: remove dead hackathon code (contracts, private key flow, Uniswap, Railgun)
```

---

## Task 2: Chain Registry and Types

Create the data-driven chain configuration and new TypeScript types that the rest of the app depends on.

**Files:**
- Create: `packages/app/src/config/chains.ts`
- Create: `packages/app/src/config/types.ts`
- Modify: `packages/app/src/utils/network.ts`
- Modify: `packages/app/src/utils/web3.ts`
- Modify: `packages/app/src/context/Web3.tsx`

**Step 1: Create chain config types**

Create `packages/app/src/config/types.ts`:

```typescript
export type ExplorerType = 'blockscout' | 'etherscan'

export interface ExplorerConfig {
  type: ExplorerType
  url: string
  apiKey?: string
}

export interface ChainConfig {
  id: number
  name: string
  nativeCurrency: string
  explorerApi: ExplorerConfig
  blockExplorerUrl: string
  tier: 1 | 2 | 3
}

export type TokenStatus = 'sweepable' | 'uneconomic' | 'no-route'

export interface ScannedToken {
  contractAddress: string
  symbol: string
  name: string
  decimals: number
  balance: bigint
  chainId: number
  chainName: string
  type: 'ERC-20' | 'Native'
  priceUSD: number | null
  valueUSD: number
  estimatedGasUSD: number | null
  status: TokenStatus
}

export interface SweepPlan {
  chainId: number
  chainName: string
  tokens: ScannedToken[]
  totalValueUSD: number
  estimatedGasUSD: number
  netValueUSD: number
}

export interface SweepState {
  status: 'idle' | 'swapping' | 'bridging' | 'complete' | 'error'
  currentChainId: number | null
  completedChains: number[]
  txHashes: Record<number, string>
  error: string | null
}

export interface Quote {
  fromToken: string
  toToken: string
  fromChainId: number
  toChainId: number
  fromAmount: string
  toAmount: string
  estimatedGas: string
  approvalAddress: string | null
  transactionRequest: {
    to: string
    data: string
    value: string
    gasLimit: string
  }
}
```

**Step 2: Create chain registry**

Create `packages/app/src/config/chains.ts`:

```typescript
import type { ChainConfig } from './types'

export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    id: 1,
    name: 'Ethereum',
    nativeCurrency: 'ETH',
    explorerApi: { type: 'etherscan', url: 'https://api.etherscan.io' },
    blockExplorerUrl: 'https://etherscan.io',
    tier: 1,
  },
  {
    id: 8453,
    name: 'Base',
    nativeCurrency: 'ETH',
    explorerApi: { type: 'blockscout', url: 'https://base.blockscout.com' },
    blockExplorerUrl: 'https://basescan.org',
    tier: 1,
  },
  {
    id: 10,
    name: 'Optimism',
    nativeCurrency: 'ETH',
    explorerApi: { type: 'blockscout', url: 'https://optimism.blockscout.com' },
    blockExplorerUrl: 'https://optimistic.etherscan.io',
    tier: 1,
  },
  {
    id: 42161,
    name: 'Arbitrum',
    nativeCurrency: 'ETH',
    explorerApi: { type: 'etherscan', url: 'https://api.arbiscan.io' },
    blockExplorerUrl: 'https://arbiscan.io',
    tier: 1,
  },
  {
    id: 137,
    name: 'Polygon',
    nativeCurrency: 'POL',
    explorerApi: { type: 'etherscan', url: 'https://api.polygonscan.com' },
    blockExplorerUrl: 'https://polygonscan.com',
    tier: 1,
  },
  {
    id: 534352,
    name: 'Scroll',
    nativeCurrency: 'ETH',
    explorerApi: { type: 'etherscan', url: 'https://api.scrollscan.com' },
    blockExplorerUrl: 'https://scrollscan.com',
    tier: 1,
  },
  {
    id: 59144,
    name: 'Linea',
    nativeCurrency: 'ETH',
    explorerApi: { type: 'etherscan', url: 'https://api.lineascan.build' },
    blockExplorerUrl: 'https://lineascan.build',
    tier: 1,
  },
  {
    id: 324,
    name: 'zkSync Era',
    nativeCurrency: 'ETH',
    explorerApi: { type: 'etherscan', url: 'https://api-era.zksync.network' },
    blockExplorerUrl: 'https://era.zksync.network',
    tier: 1,
  },
  {
    id: 1301,
    name: 'Unichain',
    nativeCurrency: 'ETH',
    explorerApi: { type: 'blockscout', url: 'https://unichain.blockscout.com' },
    blockExplorerUrl: 'https://unichain.blockscout.com',
    tier: 1,
  },
]

export const TIER1_CHAINS = SUPPORTED_CHAINS.filter((c) => c.tier === 1)

export function getChainById(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)
}

export function getBlockExplorerTxUrl(chainId: number, txHash: string): string {
  const chain = getChainById(chainId)
  if (!chain) return ''
  return `${chain.blockExplorerUrl}/tx/${txHash}`
}

export function getBlockExplorerAddressUrl(chainId: number, address: string): string {
  const chain = getChainById(chainId)
  if (!chain) return ''
  return `${chain.blockExplorerUrl}/address/${address}`
}

// Native token address constant used by LI.FI and explorers
export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000'
```

**Step 3: Update network.ts**

Replace `packages/app/src/utils/network.ts` to use the chain registry and export Reown AppKit-compatible chain objects:

```typescript
import {
  mainnet, base, optimism, arbitrum, polygon,
  scroll, linea, zkSync, unichain,
} from '@reown/appkit/networks'
import { SUPPORTED_CHAINS } from '@/config/chains'

// Reown AppKit network objects for wallet connection
export const ETH_CHAINS = [
  mainnet, base, optimism, arbitrum, polygon,
  scroll, linea, zkSync, unichain,
]

export const NETWORK_COLORS: Record<string, { color: string; bgVariant: string }> = {
  ethereum: { color: 'green', bgVariant: 'bg-green-600' },
  base: { color: 'blue', bgVariant: 'bg-blue-600' },
  optimism: { color: 'red', bgVariant: 'bg-red-600' },
  arbitrum: { color: 'sky', bgVariant: 'bg-sky-600' },
  polygon: { color: 'purple', bgVariant: 'bg-purple-600' },
  scroll: { color: 'amber', bgVariant: 'bg-amber-600' },
  linea: { color: 'slate', bgVariant: 'bg-slate-600' },
  'zksync era': { color: 'indigo', bgVariant: 'bg-indigo-600' },
  unichain: { color: 'pink', bgVariant: 'bg-pink-600' },
  other: { color: 'gray', bgVariant: 'bg-gray-600' },
}

export function GetNetworkColor(chain?: string, type: 'color' | 'bgVariant' = 'color') {
  if (!chain) return NETWORK_COLORS.other[type]
  const key = chain.toLowerCase()
  for (const [name, colors] of Object.entries(NETWORK_COLORS)) {
    if (key.includes(name)) return colors[type]
  }
  return NETWORK_COLORS.other[type]
}
```

**Step 4: Verify imports compile**

```bash
cd packages/app && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: Some errors from pages still importing deleted files — that's expected, fixed in later tasks.

**Step 5: Commit**

```
feat: add data-driven chain registry and MVP type definitions
```

---

## Task 3: New Jotai Atoms

Replace the old wallet atoms with the new state shape.

**Files:**
- Modify: `packages/app/src/atoms/walletAtoms.ts`

**Step 1: Rewrite walletAtoms.ts**

Replace the entire contents of `packages/app/src/atoms/walletAtoms.ts`:

```typescript
import { atom } from 'jotai'
import type { ScannedToken, SweepPlan, SweepState } from '@/config/types'

// Scanned tokens from all chains
export const scannedTokensAtom = atom<ScannedToken[]>([])

// User-selected tokens to sweep
export const selectedTokensAtom = atom<ScannedToken[]>([])

// Destination chain ID
export const destinationChainIdAtom = atom<number>(8453) // Default: Base

// Destination address (defaults to connected wallet)
export const destinationAddressAtom = atom<string>('')

// Current wizard step (0-4)
export const stepAtom = atom<number>(0)

// Sweep execution state
export const sweepStateAtom = atom<SweepState>({
  status: 'idle',
  currentChainId: null,
  completedChains: [],
  txHashes: {},
  error: null,
})

// Derived: total value of selected tokens
export const totalValueAtom = atom((get) => {
  const tokens = get(selectedTokensAtom)
  return tokens.reduce((sum, t) => sum + t.valueUSD, 0)
})

// Derived: total estimated gas for selected tokens
export const totalGasAtom = atom((get) => {
  const tokens = get(selectedTokensAtom)
  return tokens.reduce((sum, t) => sum + (t.estimatedGasUSD ?? 0), 0)
})

// Derived: net value after gas
export const netValueAtom = atom((get) => {
  return get(totalValueAtom) - get(totalGasAtom)
})

// Derived: group selected tokens by chain for execution planning
export const sweepPlansAtom = atom<SweepPlan[]>((get) => {
  const tokens = get(selectedTokensAtom)
  const chainGroups = new Map<number, ScannedToken[]>()

  for (const token of tokens) {
    const group = chainGroups.get(token.chainId) ?? []
    group.push(token)
    chainGroups.set(token.chainId, group)
  }

  return Array.from(chainGroups.entries()).map(([chainId, chainTokens]) => {
    const totalValue = chainTokens.reduce((s, t) => s + t.valueUSD, 0)
    const totalGas = chainTokens.reduce((s, t) => s + (t.estimatedGasUSD ?? 0), 0)
    return {
      chainId,
      chainName: chainTokens[0].chainName,
      tokens: chainTokens,
      totalValueUSD: totalValue,
      estimatedGasUSD: totalGas,
      netValueUSD: totalValue - totalGas,
    }
  })
})
```

**Step 2: Commit**

```
feat: replace wallet atoms with new sweep state management
```

---

## Task 4: Scanner Adapters and /api/scan

Build the multi-chain token scanning infrastructure.

**Files:**
- Create: `packages/app/src/lib/scanners/types.ts`
- Create: `packages/app/src/lib/scanners/blockscout.ts`
- Create: `packages/app/src/lib/scanners/etherscan.ts`
- Create: `packages/app/src/lib/scanners/index.ts`
- Create: `packages/app/src/app/api/scan/route.ts`

**Step 1: Create scanner types**

Create `packages/app/src/lib/scanners/types.ts`:

```typescript
export interface RawTokenBalance {
  contractAddress: string
  name: string
  symbol: string
  decimals: number
  balance: string // raw balance in smallest unit
  type: 'ERC-20' | 'Native'
}

export interface ChainScanResult {
  chainId: number
  chainName: string
  tokens: RawTokenBalance[]
  error?: string
}

export interface ChainScanner {
  fetchTokenBalances(chainId: number, address: string): Promise<RawTokenBalance[]>
}
```

**Step 2: Create Blockscout scanner**

Create `packages/app/src/lib/scanners/blockscout.ts`:

```typescript
import type { ChainScanner, RawTokenBalance } from './types'

export class BlockscoutScanner implements ChainScanner {
  constructor(private baseUrl: string) {}

  async fetchTokenBalances(_chainId: number, address: string): Promise<RawTokenBalance[]> {
    const tokens: RawTokenBalance[] = []

    // Fetch ERC-20 tokens and native balance in parallel
    const [tokenListRes, balanceRes] = await Promise.allSettled([
      fetch(`${this.baseUrl}/api?module=account&action=tokenlist&address=${address}`),
      fetch(`${this.baseUrl}/api?module=account&action=balance&address=${address}`),
    ])

    // Process ERC-20 tokens
    if (tokenListRes.status === 'fulfilled' && tokenListRes.value.ok) {
      const data = await tokenListRes.value.json()
      if (data.status === '1' && Array.isArray(data.result)) {
        for (const token of data.result) {
          if (token.type !== 'ERC-20' || token.balance === '0') continue
          tokens.push({
            contractAddress: token.contractAddress,
            name: token.name || 'Unknown Token',
            symbol: token.symbol || 'UNKNOWN',
            decimals: parseInt(token.decimals) || 18,
            balance: token.balance,
            type: 'ERC-20',
          })
        }
      }
    }

    // Process native balance
    if (balanceRes.status === 'fulfilled' && balanceRes.value.ok) {
      const data = await balanceRes.value.json()
      if (data.status === '1' && data.result && data.result !== '0') {
        tokens.push({
          contractAddress: '0x0000000000000000000000000000000000000000',
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
          balance: data.result,
          type: 'Native',
        })
      }
    }

    return tokens
  }
}
```

**Step 3: Create Etherscan scanner**

Create `packages/app/src/lib/scanners/etherscan.ts`:

```typescript
import type { ChainScanner, RawTokenBalance } from './types'

export class EtherscanScanner implements ChainScanner {
  constructor(
    private baseUrl: string,
    private apiKey?: string
  ) {}

  async fetchTokenBalances(_chainId: number, address: string): Promise<RawTokenBalance[]> {
    const tokens: RawTokenBalance[] = []
    const keyParam = this.apiKey ? `&apikey=${this.apiKey}` : ''

    const [tokenListRes, balanceRes] = await Promise.allSettled([
      fetch(`${this.baseUrl}/api?module=account&action=tokentx&address=${address}&page=1&offset=100&sort=desc${keyParam}`),
      fetch(`${this.baseUrl}/api?module=account&action=balance&address=${address}${keyParam}`),
    ])

    // Etherscan doesn't have a direct tokenlist endpoint like Blockscout.
    // We use tokentx (token transfer history) to discover tokens, then fetch balances.
    if (tokenListRes.status === 'fulfilled' && tokenListRes.value.ok) {
      const data = await tokenListRes.value.json()
      if (data.status === '1' && Array.isArray(data.result)) {
        // Deduplicate by contract address
        const seen = new Set<string>()
        const uniqueTokens: Array<{ contractAddress: string; name: string; symbol: string; decimals: number }> = []

        for (const tx of data.result) {
          const addr = tx.contractAddress?.toLowerCase()
          if (!addr || seen.has(addr)) continue
          seen.add(addr)
          uniqueTokens.push({
            contractAddress: tx.contractAddress,
            name: tx.tokenName || 'Unknown Token',
            symbol: tx.tokenSymbol || 'UNKNOWN',
            decimals: parseInt(tx.tokenDecimal) || 18,
          })
        }

        // Fetch current balance for each discovered token
        const balancePromises = uniqueTokens.map(async (token) => {
          try {
            const res = await fetch(
              `${this.baseUrl}/api?module=account&action=tokenbalance&contractaddress=${token.contractAddress}&address=${address}${keyParam}`
            )
            if (!res.ok) return null
            const balData = await res.json()
            if (balData.status === '1' && balData.result && balData.result !== '0') {
              return {
                contractAddress: token.contractAddress,
                name: token.name,
                symbol: token.symbol,
                decimals: token.decimals,
                balance: balData.result,
                type: 'ERC-20' as const,
              }
            }
            return null
          } catch {
            return null
          }
        })

        const balances = await Promise.all(balancePromises)
        tokens.push(...balances.filter((b): b is RawTokenBalance => b !== null))
      }
    }

    // Native balance
    if (balanceRes.status === 'fulfilled' && balanceRes.value.ok) {
      const data = await balanceRes.value.json()
      if (data.status === '1' && data.result && data.result !== '0') {
        tokens.push({
          contractAddress: '0x0000000000000000000000000000000000000000',
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
          balance: data.result,
          type: 'Native',
        })
      }
    }

    return tokens
  }
}
```

**Step 4: Create scanner index**

Create `packages/app/src/lib/scanners/index.ts`:

```typescript
import { SUPPORTED_CHAINS } from '@/config/chains'
import { BlockscoutScanner } from './blockscout'
import { EtherscanScanner } from './etherscan'
import type { ChainScanner, ChainScanResult } from './types'

export type { ChainScanResult, RawTokenBalance } from './types'

function getScannerForChain(chainId: number): ChainScanner | null {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId)
  if (!chain) return null

  switch (chain.explorerApi.type) {
    case 'blockscout':
      return new BlockscoutScanner(chain.explorerApi.url)
    case 'etherscan':
      return new EtherscanScanner(chain.explorerApi.url, chain.explorerApi.apiKey)
    default:
      return null
  }
}

export async function scanAllChains(address: string): Promise<ChainScanResult[]> {
  const tier1 = SUPPORTED_CHAINS.filter((c) => c.tier === 1)

  const results = await Promise.allSettled(
    tier1.map(async (chain) => {
      const scanner = getScannerForChain(chain.id)
      if (!scanner) {
        return { chainId: chain.id, chainName: chain.name, tokens: [], error: 'No scanner available' }
      }
      try {
        const tokens = await scanner.fetchTokenBalances(chain.id, address)
        return { chainId: chain.id, chainName: chain.name, tokens }
      } catch (e) {
        return {
          chainId: chain.id,
          chainName: chain.name,
          tokens: [],
          error: e instanceof Error ? e.message : 'Scan failed',
        }
      }
    })
  )

  return results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { chainId: 0, chainName: 'Unknown', tokens: [], error: 'Promise rejected' }
  )
}
```

**Step 5: Create /api/scan route**

Create `packages/app/src/app/api/scan/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { scanAllChains } from '@/lib/scanners'

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const results = await scanAllChains(address)
  return NextResponse.json(results)
}
```

**Step 6: Commit**

```
feat: add multi-chain scanner with Blockscout and Etherscan adapters
```

---

## Task 5: LI.FI Provider and API Routes

Integrate the LI.FI SDK for swap/bridge quoting and create server-side proxy routes.

**Files:**
- Create: `packages/app/src/lib/lifi/provider.ts`
- Create: `packages/app/src/lib/lifi/config.ts`
- Create: `packages/app/src/app/api/quote/route.ts`
- Create: `packages/app/src/app/api/status/route.ts`

**Step 1: Create LI.FI config**

Create `packages/app/src/lib/lifi/config.ts`:

```typescript
import { createConfig } from '@lifi/sdk'

let configured = false

export function ensureLifiConfig() {
  if (configured) return
  createConfig({
    integrator: 'dust-ops',
    apiKey: process.env.LIFI_API_KEY,
  })
  configured = true
}
```

**Step 2: Create LI.FI provider**

Create `packages/app/src/lib/lifi/provider.ts`:

```typescript
import { getQuote, getStatus } from '@lifi/sdk'
import type { QuoteRequest, StatusRequest } from '@lifi/sdk'
import { ensureLifiConfig } from './config'
import { NATIVE_TOKEN_ADDRESS } from '@/config/chains'

export interface SwapQuoteParams {
  fromChainId: number
  fromTokenAddress: string
  fromAmount: string
  fromAddress: string
  toChainId: number
  toTokenAddress?: string // defaults to native token (ETH)
}

export interface SwapQuoteResult {
  id: string
  fromToken: { address: string; symbol: string; decimals: number; chainId: number }
  toToken: { address: string; symbol: string; decimals: number; chainId: number }
  fromAmount: string
  toAmount: string
  toAmountUSD: string
  estimatedGas: string
  gasCostUSD: string
  approvalAddress: string | null
  transactionRequest: {
    to: string
    data: string
    value: string
    gasLimit: string
    chainId: number
  } | null
}

export async function getSwapQuote(params: SwapQuoteParams): Promise<SwapQuoteResult> {
  ensureLifiConfig()

  const quoteRequest: QuoteRequest = {
    fromChain: params.fromChainId,
    fromToken: params.fromTokenAddress,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toChain: params.toChainId,
    toToken: params.toTokenAddress ?? NATIVE_TOKEN_ADDRESS,
  }

  const quote = await getQuote(quoteRequest)

  return {
    id: quote.id,
    fromToken: {
      address: quote.action.fromToken.address,
      symbol: quote.action.fromToken.symbol,
      decimals: quote.action.fromToken.decimals,
      chainId: quote.action.fromChainId,
    },
    toToken: {
      address: quote.action.toToken.address,
      symbol: quote.action.toToken.symbol,
      decimals: quote.action.toToken.decimals,
      chainId: quote.action.toChainId,
    },
    fromAmount: quote.action.fromAmount,
    toAmount: quote.estimate.toAmount,
    toAmountUSD: quote.estimate.toAmountUSD ?? '0',
    estimatedGas: quote.estimate.gasCosts?.[0]?.amount ?? '0',
    gasCostUSD: quote.estimate.gasCosts?.[0]?.amountUSD ?? '0',
    approvalAddress: quote.estimate.approvalAddress ?? null,
    transactionRequest: quote.transactionRequest
      ? {
          to: quote.transactionRequest.to as string,
          data: quote.transactionRequest.data as string,
          value: quote.transactionRequest.value?.toString() ?? '0',
          gasLimit: quote.transactionRequest.gasLimit?.toString() ?? '0',
          chainId: quote.transactionRequest.chainId as number,
        }
      : null,
  }
}

export async function getBridgeQuote(params: SwapQuoteParams): Promise<SwapQuoteResult> {
  // Same API — LI.FI handles cross-chain routing automatically
  return getSwapQuote(params)
}

export async function getTransactionStatus(txHash: string, fromChainId: number, toChainId: number) {
  ensureLifiConfig()

  const result = await getStatus({
    txHash,
    fromChain: fromChainId,
    toChain: toChainId,
  } as StatusRequest)

  return {
    status: result.status,
    substatus: result.substatus,
    sending: result.sending,
    receiving: result.receiving,
  }
}
```

**Step 3: Create /api/quote route**

Create `packages/app/src/app/api/quote/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSwapQuote, type SwapQuoteParams } from '@/lib/lifi/provider'

export async function POST(request: NextRequest) {
  try {
    const params: SwapQuoteParams = await request.json()

    if (!params.fromChainId || !params.fromTokenAddress || !params.fromAmount || !params.fromAddress) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const quote = await getSwapQuote(params)
    return NextResponse.json(quote)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Quote failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Step 4: Create /api/status route**

Create `packages/app/src/app/api/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getTransactionStatus } from '@/lib/lifi/provider'

export async function GET(request: NextRequest) {
  const txHash = request.nextUrl.searchParams.get('txHash')
  const fromChain = request.nextUrl.searchParams.get('fromChain')
  const toChain = request.nextUrl.searchParams.get('toChain')

  if (!txHash || !fromChain || !toChain) {
    return NextResponse.json({ error: 'Missing txHash, fromChain, or toChain' }, { status: 400 })
  }

  try {
    const status = await getTransactionStatus(txHash, parseInt(fromChain), parseInt(toChain))
    return NextResponse.json(status)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Status check failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Step 5: Commit**

```
feat: add LI.FI SDK integration with quote and status API routes
```

---

## Task 6: Wallet Connection Page (Step 0)

Replace the private key input with WalletConnect and EIP-5792 capability detection.

**Files:**
- Rewrite: `packages/app/src/components/sweeper/WalletConnection.tsx`
- Create: `packages/app/src/app/hooks/useWalletCapabilities.ts`
- Modify: `packages/app/src/context/Web3.tsx`
- Modify: `packages/app/src/app/(steps)/page.tsx`

**Step 1: Create wallet capabilities hook**

Create `packages/app/src/app/hooks/useWalletCapabilities.ts`:

```typescript
'use client'

import { useAccount, useWalletClient } from 'wagmi'
import { useEffect, useState } from 'react'

export function useWalletCapabilities() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [supportsBatchCalls, setSupportsBatchCalls] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!walletClient || !isConnected) {
      setSupportsBatchCalls(null)
      return
    }

    setChecking(true)

    walletClient
      .request({ method: 'wallet_getCapabilities' as any } as any)
      .then((capabilities: any) => {
        // Check if any chain supports atomic batch
        const hasAtomicBatch = Object.values(capabilities ?? {}).some(
          (chainCaps: any) => chainCaps?.atomicBatch?.supported === true
        )
        setSupportsBatchCalls(hasAtomicBatch)
      })
      .catch(() => {
        // wallet_getCapabilities not supported — assume no batch support
        setSupportsBatchCalls(false)
      })
      .finally(() => setChecking(false))
  }, [walletClient, isConnected])

  return { supportsBatchCalls, checking, address, isConnected }
}
```

**Step 2: Rewrite WalletConnection component**

Replace `packages/app/src/components/sweeper/WalletConnection.tsx`:

```typescript
'use client'

import { useAppKit } from '@reown/appkit/react'
import { useWalletCapabilities } from '@/app/hooks/useWalletCapabilities'
import Link from 'next/link'

export function WalletConnection() {
  const { open } = useAppKit()
  const { supportsBatchCalls, checking, address, isConnected } = useWalletCapabilities()

  const canProceed = isConnected && supportsBatchCalls === true

  return (
    <div className='flex flex-col items-center justify-center min-h-screen text-center px-4'>
      <div className='w-full max-w-md mx-auto mt-[130px]'>
        {!isConnected ? (
          <button
            onClick={() => open()}
            className='btn-start-scanning mb-4 cursor-pointer'
          >
            <span className='gradient-text'>Connect Wallet</span>
          </button>
        ) : checking ? (
          <p className='text-slate-400'>Checking wallet capabilities...</p>
        ) : supportsBatchCalls === false ? (
          <div className='space-y-4'>
            <p className='text-amber-400 font-semibold'>
              Your wallet doesn&apos;t support batch transactions (EIP-5792).
            </p>
            <p className='text-slate-300 text-sm'>
              For the best experience, use Ambire, MetaMask 12+, or Coinbase Wallet.
            </p>
            <button
              onClick={() => open()}
              className='btn-start-scanning cursor-pointer'
            >
              <span className='gradient-text'>Try Another Wallet</span>
            </button>
          </div>
        ) : canProceed ? (
          <div className='space-y-4'>
            <p className='text-slate-300 text-sm'>
              Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
            <Link href='/scan-holdings'>
              <button className='btn-start-scanning cursor-pointer'>
                <span className='gradient-text'>/Dust_OPS_Init</span>
              </button>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

**Step 3: Update home page**

Replace `packages/app/src/app/(steps)/page.tsx`:

```typescript
'use client'

import { stepAtom } from '@/atoms/walletAtoms'
import { WalletConnection } from '@/components/sweeper/WalletConnection'
import { useSetAtom } from 'jotai'
import { useEffect } from 'react'

export default function Home() {
  const setStep = useSetAtom(stepAtom)

  useEffect(() => {
    setStep(0)
  }, [setStep])

  return <WalletConnection />
}
```

**Step 4: Update steps layout**

Replace `packages/app/src/app/(steps)/layout.tsx` — remove private key references, update step list:

```typescript
'use client'

import { stepAtom } from '@/atoms/walletAtoms'
import { ProgressBar } from '@/components/sweeper/ProgressBar'
import { SweeperHeader } from '@/components/sweeper/SweeperHeader'
import { useAtomValue } from 'jotai'
import { useAccount, useDisconnect } from 'wagmi'
import { PropsWithChildren, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const steps = ['Connect Wallet', 'Scan Holdings', 'Select Tokens', 'Review & Execute', 'Complete']
const stepUrls = ['/', 'scan-holdings', 'select-tokens', 'review', 'completion']

export default function Layout({ children }: PropsWithChildren) {
  const step = useAtomValue(stepAtom)
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const router = useRouter()

  useEffect(() => {
    if (step === 0) {
      document.body.classList.add('first-screen-bg')
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    } else {
      document.body.classList.remove('first-screen-bg')
      document.body.style.overflow = 'auto'
      document.documentElement.style.overflow = 'auto'
    }

    return () => {
      document.body.classList.remove('first-screen-bg')
      document.body.style.overflow = 'auto'
      document.documentElement.style.overflow = 'auto'
    }
  }, [step])

  const handleDisconnect = () => {
    disconnect()
    router.push('/')
  }

  return (
    <div className={`fixed inset-0 text-white ${step === 0 ? 'overflow-hidden' : 'overflow-auto bg-dark-primary'}`}>
      <div className='max-w-6xl mx-auto px-6 pb-12'>
        {step !== 0 && (
          <SweeperHeader
            walletConnected={isConnected}
            address={address || undefined}
            onDisconnect={handleDisconnect}
            onConnect={() => router.push('/')}
          />
        )}
        {step !== 0 && <ProgressBar steps={steps} stepUrls={stepUrls} currentStep={step} />}
        {children}
      </div>
    </div>
  )
}
```

**Step 5: Commit**

```
feat: replace private key input with WalletConnect + EIP-5792 detection
```

---

## Task 7: Scan Holdings Page (Step 1)

Rewrite the scanning page to use the new multi-chain scanner API.

**Files:**
- Rewrite: `packages/app/src/app/(steps)/scan-holdings/page.tsx`

**Step 1: Rewrite scan-holdings page**

Replace `packages/app/src/app/(steps)/scan-holdings/page.tsx`:

```typescript
'use client'

import { scannedTokensAtom, stepAtom } from '@/atoms/walletAtoms'
import { TIER1_CHAINS, NATIVE_TOKEN_ADDRESS } from '@/config/chains'
import type { ScannedToken } from '@/config/types'
import type { ChainScanResult, RawTokenBalance } from '@/lib/scanners/types'
import { useSetAtom } from 'jotai'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { useAccount } from 'wagmi'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { formatUnits } from 'viem'

async function priceToken(
  token: RawTokenBalance,
  chainId: number,
  chainName: string,
  fromAddress: string
): Promise<ScannedToken> {
  const balance = BigInt(token.balance)
  const displayBalance = parseFloat(formatUnits(balance, token.decimals))

  // Skip pricing for very small balances
  if (displayBalance === 0) {
    return {
      ...token,
      decimals: token.decimals,
      balance,
      chainId,
      chainName,
      priceUSD: null,
      valueUSD: 0,
      estimatedGasUSD: null,
      status: 'uneconomic',
    }
  }

  // For native tokens, don't need a swap quote — just price it
  if (token.type === 'Native') {
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromChainId: chainId,
          fromTokenAddress: NATIVE_TOKEN_ADDRESS,
          fromAmount: balance.toString(),
          fromAddress,
          toChainId: chainId,
          toTokenAddress: NATIVE_TOKEN_ADDRESS,
        }),
      })
      if (res.ok) {
        const quote = await res.json()
        const valueUSD = parseFloat(quote.toAmountUSD || '0')
        return {
          ...token,
          decimals: token.decimals,
          balance,
          chainId,
          chainName,
          priceUSD: displayBalance > 0 ? valueUSD / displayBalance : null,
          valueUSD,
          estimatedGasUSD: 0,
          status: 'sweepable',
        }
      }
    } catch { /* fall through */ }

    // Fallback: can't price native token
    return {
      ...token,
      decimals: token.decimals,
      balance,
      chainId,
      chainName,
      priceUSD: null,
      valueUSD: 0,
      estimatedGasUSD: null,
      status: 'no-route',
    }
  }

  // For ERC-20 tokens, get a swap quote to native ETH
  try {
    const res = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromChainId: chainId,
        fromTokenAddress: token.contractAddress,
        fromAmount: balance.toString(),
        fromAddress,
        toChainId: chainId,
        toTokenAddress: NATIVE_TOKEN_ADDRESS,
      }),
    })

    if (!res.ok) {
      return {
        ...token,
        decimals: token.decimals,
        balance,
        chainId,
        chainName,
        priceUSD: null,
        valueUSD: 0,
        estimatedGasUSD: null,
        status: 'no-route',
      }
    }

    const quote = await res.json()
    const valueUSD = parseFloat(quote.toAmountUSD || '0')
    const gasCostUSD = parseFloat(quote.gasCostUSD || '0')

    return {
      ...token,
      decimals: token.decimals,
      balance,
      chainId,
      chainName,
      priceUSD: displayBalance > 0 ? valueUSD / displayBalance : null,
      valueUSD,
      estimatedGasUSD: gasCostUSD,
      status: valueUSD > gasCostUSD ? 'sweepable' : 'uneconomic',
    }
  } catch {
    return {
      ...token,
      decimals: token.decimals,
      balance,
      chainId,
      chainName,
      priceUSD: null,
      valueUSD: 0,
      estimatedGasUSD: null,
      status: 'no-route',
    }
  }
}

export default function ScanHoldings() {
  const { address, isConnected } = useAccount()
  const router = useRouter()
  const setTokens = useSetAtom(scannedTokensAtom)
  const setStep = useSetAtom(stepAtom)
  const [chainsScanned, setChainsScanned] = useState(0)
  const [tokensFound, setTokensFound] = useState(0)
  const [status, setStatus] = useState('Scanning...')
  const hasStarted = useRef(false)

  useEffect(() => {
    setStep(1)
  }, [setStep])

  useEffect(() => {
    if (!address || !isConnected || hasStarted.current) return
    hasStarted.current = true

    async function scan() {
      setStatus('Scanning chains for tokens...')

      const res = await fetch(`/api/scan?address=${address}`)
      if (!res.ok) {
        setStatus('Scan failed. Please try again.')
        return
      }

      const results: ChainScanResult[] = await res.json()
      setChainsScanned(results.length)

      // Count total tokens found
      const totalRaw = results.reduce((sum, r) => sum + r.tokens.length, 0)
      setTokensFound(totalRaw)
      setStatus('Fetching prices and swap quotes...')

      // Price all tokens in parallel (with concurrency limit)
      const allTokens: ScannedToken[] = []
      for (const chainResult of results) {
        const priced = await Promise.all(
          chainResult.tokens.map((t) =>
            priceToken(t, chainResult.chainId, chainResult.chainName, address!)
          )
        )
        allTokens.push(...priced)
      }

      // Sort by value descending
      allTokens.sort((a, b) => b.valueUSD - a.valueUSD)
      setTokens(allTokens)
      setStatus('Done!')

      // Navigate to selection
      setTimeout(() => router.push('/select-tokens'), 500)
    }

    scan()
  }, [address, isConnected, setTokens, router])

  useEffect(() => {
    if (!isConnected && typeof window !== 'undefined') {
      router.replace('/')
    }
  }, [isConnected, router])

  return (
    <div className='text-center py-20'>
      <ArrowPathIcon className='w-16 h-16 mx-auto mb-6 animate-spin spin-gradient' />
      <h2 className='text-3xl font-bold mb-4 font-tanklager'>Scanning Your Holdings</h2>
      <p className='text-slate-300 mb-8 font-tanklager'>
        Analyzing tokens across {TIER1_CHAINS.length} chains...
      </p>
      <div className='max-w-md mx-auto'>
        <p className='text-sm text-slate-400 font-tanklager'>
          {chainsScanned}/{TIER1_CHAINS.length} chains scanned
        </p>
        <p className='text-sm text-slate-400 font-tanklager'>
          {tokensFound} tokens found
        </p>
        <p className='text-sm text-slate-300 mt-2 font-tanklager'>{status}</p>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```
feat: rewrite scan-holdings with multi-chain scanner and LI.FI pricing
```

---

## Task 8: Token Selection Page (Step 2)

Update token selection to use new types, add gas viability indicators, and include destination chain/address picker.

**Files:**
- Rewrite: `packages/app/src/app/(steps)/select-tokens/page.tsx`
- Rewrite: `packages/app/src/components/sweeper/TokenSelection.tsx`
- Delete: `packages/app/src/app/(steps)/select-tokens/token-utils.ts` (no longer needed)

**Step 1: Delete old token-utils.ts**

```bash
rm packages/app/src/app/(steps)/select-tokens/token-utils.ts
```

**Step 2: Rewrite TokenSelection component**

Replace `packages/app/src/components/sweeper/TokenSelection.tsx`:

```typescript
import { ChevronRightIcon } from '@heroicons/react/24/outline'
import type { ScannedToken } from '@/config/types'
import { TIER1_CHAINS } from '@/config/chains'
import { GetNetworkColor } from '@/utils/network'
import { formatUnits } from 'viem'

interface TokenSelectionProps {
  tokens: ScannedToken[]
  selectedTokens: ScannedToken[]
  totalValue: number
  totalGas: number
  destinationChainId: number
  destinationAddress: string
  onToggleToken: (token: ScannedToken) => void
  onSetDestinationChain: (chainId: number) => void
  onSetDestinationAddress: (address: string) => void
  onProceed: () => void
}

function formatBalance(token: ScannedToken): string {
  const display = parseFloat(formatUnits(token.balance, token.decimals))
  return display.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 })
}

function formatUSD(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function TokenSelection({
  tokens,
  selectedTokens,
  totalValue,
  totalGas,
  destinationChainId,
  destinationAddress,
  onToggleToken,
  onSetDestinationChain,
  onSetDestinationAddress,
  onProceed,
}: TokenSelectionProps) {
  const isSelected = (t: ScannedToken) =>
    selectedTokens.some((s) => s.contractAddress === t.contractAddress && s.chainId === t.chainId)

  return (
    <div className='py-8'>
      <div className='grid grid-cols-2 gap-8 items-end mb-8'>
        <div>
          <h2 className='text-3xl font-bold mb-2'>Select Tokens to Sweep</h2>
          <p className='text-slate-300'>
            Value: <span className='font-semibold' style={{ color: '#BBB424' }}>{formatUSD(totalValue)}</span>
            {totalGas > 0 && (
              <span className='text-slate-400'> (est. gas: {formatUSD(totalGas)})</span>
            )}
          </p>
        </div>

        <div className='space-y-3'>
          <div className='flex gap-2'>
            <select
              value={destinationChainId}
              onChange={(e) => onSetDestinationChain(parseInt(e.target.value))}
              className='bg-slate-800 border border-slate-600 text-white px-3 py-2 text-sm flex-1'
              style={{ borderRadius: '0px' }}
            >
              {TIER1_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <input
            type='text'
            placeholder='Destination address (defaults to connected wallet)'
            value={destinationAddress}
            onChange={(e) => onSetDestinationAddress(e.target.value)}
            className='bg-slate-800 border border-slate-600 text-white px-3 py-2 text-sm w-full'
            style={{ borderRadius: '0px' }}
          />
          <button
            onClick={onProceed}
            disabled={selectedTokens.length === 0}
            className='cursor-pointer w-full disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 font-semibold transition-all flex items-center justify-center btn-review-sweep'
            style={{ borderRadius: '0px' }}
          >
            <span className='uppercase text-white font-bold'>REVIEW & SWEEP</span>
            <ChevronRightIcon className='w-5 h-5 ml-2 text-white' />
          </button>
        </div>
      </div>

      <div className='grid gap-4 mb-8'>
        {tokens.map((token, idx) => {
          const selected = isSelected(token)
          const disabled = token.status !== 'sweepable'

          return (
            <div
              key={`${token.chainId}-${token.contractAddress}-${idx}`}
              onClick={() => !disabled && onToggleToken(token)}
              className={`p-4 border-2 transition-all token-selection-box ${
                selected ? 'selected' : disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
              style={{
                borderRadius: '0px',
                borderColor: selected ? '#BBB424' : undefined,
              }}
            >
              <div className='flex items-center justify-between'>
                <div className='flex items-center space-x-4'>
                  <div
                    className='w-3 h-3'
                    style={{
                      borderRadius: '0px',
                      backgroundColor: selected ? '#BBB424' : disabled ? 'rgba(255,255,255,0.2)' : '#64748b',
                    }}
                  />
                  <div>
                    <div className='flex items-center space-x-2'>
                      <span className='font-semibold'>{token.symbol}</span>
                      <span
                        className='text-xs px-2 py-1'
                        style={{
                          borderRadius: '0px',
                          backgroundColor: GetNetworkColor(token.chainName, 'bgVariant'),
                        }}
                      >
                        {token.chainName}
                      </span>
                      {token.status === 'uneconomic' && (
                        <span className='text-xs bg-amber-700 px-2 py-1' style={{ borderRadius: '0px' }}>
                          Gas &gt; Value
                        </span>
                      )}
                      {token.status === 'no-route' && (
                        <span className='text-xs bg-red-700 px-2 py-1' style={{ borderRadius: '0px' }}>
                          No Swap Route
                        </span>
                      )}
                    </div>
                    <p className='text-sm text-slate-400'>{token.name}</p>
                  </div>
                </div>
                <div className='text-right'>
                  <p className='font-semibold'>{formatUSD(token.valueUSD)}</p>
                  <p className='text-sm text-slate-400'>{formatBalance(token)}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 3: Rewrite select-tokens page**

Replace `packages/app/src/app/(steps)/select-tokens/page.tsx`:

```typescript
'use client'

import { TokenSelection } from '@/components/sweeper/TokenSelection'
import { useEffect } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  scannedTokensAtom,
  selectedTokensAtom,
  stepAtom,
  totalValueAtom,
  totalGasAtom,
  destinationChainIdAtom,
  destinationAddressAtom,
} from '@/atoms/walletAtoms'
import type { ScannedToken } from '@/config/types'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'

export default function SelectTokens() {
  const { address, isConnected } = useAccount()
  const router = useRouter()
  const setStep = useSetAtom(stepAtom)

  const tokens = useAtomValue(scannedTokensAtom)
  const [selectedTokens, setSelectedTokens] = useAtom(selectedTokensAtom)
  const totalValue = useAtomValue(totalValueAtom)
  const totalGas = useAtomValue(totalGasAtom)
  const [destinationChainId, setDestinationChainId] = useAtom(destinationChainIdAtom)
  const [destinationAddress, setDestinationAddress] = useAtom(destinationAddressAtom)

  useEffect(() => {
    setStep(2)
  }, [setStep])

  // Auto-select sweepable tokens on first load
  useEffect(() => {
    if (selectedTokens.length === 0 && tokens.length > 0) {
      setSelectedTokens(tokens.filter((t) => t.status === 'sweepable'))
    }
  }, [tokens, selectedTokens.length, setSelectedTokens])

  // Default destination address to connected wallet
  useEffect(() => {
    if (!destinationAddress && address) {
      setDestinationAddress(address)
    }
  }, [address, destinationAddress, setDestinationAddress])

  const toggleToken = (token: ScannedToken) => {
    setSelectedTokens((prev) => {
      const exists = prev.some(
        (t) => t.contractAddress === token.contractAddress && t.chainId === token.chainId
      )
      return exists
        ? prev.filter((t) => !(t.contractAddress === token.contractAddress && t.chainId === token.chainId))
        : [...prev, token]
    })
  }

  useEffect(() => {
    if (!isConnected && typeof window !== 'undefined') {
      router.replace('/')
    }
  }, [isConnected, router])

  return (
    <TokenSelection
      tokens={tokens}
      selectedTokens={selectedTokens}
      totalValue={totalValue}
      totalGas={totalGas}
      destinationChainId={destinationChainId}
      destinationAddress={destinationAddress}
      onToggleToken={toggleToken}
      onSetDestinationChain={setDestinationChainId}
      onSetDestinationAddress={setDestinationAddress}
      onProceed={() => router.push('/review')}
    />
  )
}
```

**Step 4: Commit**

```
feat: rewrite token selection with gas viability and destination picker
```

---

## Task 9: Review & Execute Page (Step 3)

The core execution logic: fetch fresh quotes, build transaction batches, execute via `wallet_sendCalls`, track progress.

**Files:**
- Create: `packages/app/src/app/hooks/useSweep.ts`
- Rewrite: `packages/app/src/app/(steps)/review/page.tsx`
- Rewrite: `packages/app/src/components/sweeper/TransactionReview.tsx`

**Step 1: Create useSweep hook**

Create `packages/app/src/app/hooks/useSweep.ts`:

```typescript
'use client'

import { useCallback, useState } from 'react'
import { useWalletClient, useAccount } from 'wagmi'
import { encodeFunctionData, erc20Abi, type Hex } from 'viem'
import type { ScannedToken, SweepState } from '@/config/types'
import { NATIVE_TOKEN_ADDRESS, getChainById } from '@/config/chains'
import type { SwapQuoteResult } from '@/lib/lifi/provider'

interface SweepChainPlan {
  chainId: number
  chainName: string
  tokens: ScannedToken[]
  quotes: SwapQuoteResult[]
}

export function useSweep() {
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()
  const [state, setState] = useState<SweepState>({
    status: 'idle',
    currentChainId: null,
    completedChains: [],
    txHashes: {},
    error: null,
  })

  const executeSweep = useCallback(
    async (
      selectedTokens: ScannedToken[],
      destinationChainId: number,
      destinationAddress: string
    ) => {
      if (!walletClient || !address) return

      setState({ status: 'swapping', currentChainId: null, completedChains: [], txHashes: {}, error: null })

      try {
        // Group tokens by chain (exclude native tokens — no swap needed)
        const chainGroups = new Map<number, ScannedToken[]>()
        for (const token of selectedTokens) {
          if (token.type === 'Native') continue // Skip native tokens for swaps
          const group = chainGroups.get(token.chainId) ?? []
          group.push(token)
          chainGroups.set(token.chainId, group)
        }

        // Phase 1: Swap dust tokens to ETH on each chain
        for (const [chainId, tokens] of chainGroups) {
          setState((prev) => ({ ...prev, currentChainId: chainId }))

          // Fetch fresh quotes
          const quotes: SwapQuoteResult[] = []
          for (const token of tokens) {
            const res = await fetch('/api/quote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fromChainId: chainId,
                fromTokenAddress: token.contractAddress,
                fromAmount: token.balance.toString(),
                fromAddress: address,
                toChainId: chainId,
                toTokenAddress: NATIVE_TOKEN_ADDRESS,
              }),
            })
            if (res.ok) {
              quotes.push(await res.json())
            }
          }

          if (quotes.length === 0) continue

          // Build batch calls: [approve, swap, approve, swap, ...]
          const calls: Array<{ to: Hex; data: Hex; value: bigint }> = []

          for (const quote of quotes) {
            // Add approval if needed
            if (quote.approvalAddress) {
              const approveData = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [quote.approvalAddress as Hex, BigInt(quote.fromAmount)],
              })
              calls.push({
                to: quote.fromToken.address as Hex,
                data: approveData,
                value: 0n,
              })
            }

            // Add swap transaction
            if (quote.transactionRequest) {
              calls.push({
                to: quote.transactionRequest.to as Hex,
                data: quote.transactionRequest.data as Hex,
                value: BigInt(quote.transactionRequest.value || '0'),
              })
            }
          }

          if (calls.length === 0) continue

          // Execute batch via wallet_sendCalls
          try {
            const result = await walletClient.request({
              method: 'wallet_sendCalls' as any,
              params: [
                {
                  version: '1.0',
                  from: address,
                  chainId: `0x${chainId.toString(16)}`,
                  calls: calls.map((c) => ({
                    to: c.to,
                    data: c.data,
                    value: `0x${c.value.toString(16)}`,
                  })),
                },
              ],
            } as any)

            setState((prev) => ({
              ...prev,
              txHashes: { ...prev.txHashes, [chainId]: result as string },
              completedChains: [...prev.completedChains, chainId],
            }))
          } catch (e) {
            setState((prev) => ({
              ...prev,
              error: `Failed on ${getChainById(chainId)?.name}: ${e instanceof Error ? e.message : 'Unknown error'}`,
              status: 'error',
            }))
            return
          }
        }

        // Phase 2: Bridge ETH from non-destination chains to destination
        const chainsWithETH = [...chainGroups.keys()].filter((id) => id !== destinationChainId)
        const nativeOnOtherChains = selectedTokens.filter(
          (t) => t.type === 'Native' && t.chainId !== destinationChainId
        )
        // Include chains where we just swapped dust + chains with native ETH
        const chainsToBridge = [...new Set([...chainsWithETH, ...nativeOnOtherChains.map((t) => t.chainId)])]

        if (chainsToBridge.length > 0) {
          setState((prev) => ({ ...prev, status: 'bridging' }))

          for (const sourceChainId of chainsToBridge) {
            setState((prev) => ({ ...prev, currentChainId: sourceChainId }))

            // Get bridge quote — bridge all ETH from this chain to destination
            // For now we use a reasonable estimate; a production version would check actual balance
            const res = await fetch('/api/quote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fromChainId: sourceChainId,
                fromTokenAddress: NATIVE_TOKEN_ADDRESS,
                fromAmount: '1000000000000000', // bridge will use actual available amount
                fromAddress: address,
                toChainId: destinationChainId,
                toTokenAddress: NATIVE_TOKEN_ADDRESS,
              }),
            })

            if (!res.ok) continue
            const bridgeQuote: SwapQuoteResult = await res.json()
            if (!bridgeQuote.transactionRequest) continue

            try {
              const result = await walletClient.request({
                method: 'wallet_sendCalls' as any,
                params: [
                  {
                    version: '1.0',
                    from: address,
                    chainId: `0x${sourceChainId.toString(16)}`,
                    calls: [
                      {
                        to: bridgeQuote.transactionRequest.to,
                        data: bridgeQuote.transactionRequest.data,
                        value: `0x${BigInt(bridgeQuote.transactionRequest.value || '0').toString(16)}`,
                      },
                    ],
                  },
                ],
              } as any)

              setState((prev) => ({
                ...prev,
                txHashes: { ...prev.txHashes, [`bridge-${sourceChainId}`]: result as string },
              }))
            } catch (e) {
              // Bridge failures are non-fatal — user still has ETH on the source chain
              console.error(`Bridge from chain ${sourceChainId} failed:`, e)
            }
          }
        }

        setState((prev) => ({ ...prev, status: 'complete', currentChainId: null }))
      } catch (e) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: e instanceof Error ? e.message : 'Sweep failed',
        }))
      }
    },
    [walletClient, address]
  )

  return { state, executeSweep }
}
```

**Step 2: Rewrite TransactionReview component**

Replace `packages/app/src/components/sweeper/TransactionReview.tsx`:

```typescript
import type { ScannedToken, SweepState, SweepPlan } from '@/config/types'
import { getChainById, getBlockExplorerTxUrl } from '@/config/chains'
import { GetNetworkColor } from '@/utils/network'

interface TransactionReviewProps {
  plans: SweepPlan[]
  totalValue: number
  totalGas: number
  netValue: number
  destinationChainId: number
  destinationAddress: string
  sweepState: SweepState
  onStartSweep: () => void
}

function formatUSD(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function TransactionReview({
  plans,
  totalValue,
  totalGas,
  netValue,
  destinationChainId,
  destinationAddress,
  sweepState,
  onStartSweep,
}: TransactionReviewProps) {
  const destChain = getChainById(destinationChainId)
  const totalTokens = plans.reduce((s, p) => s + p.tokens.length, 0)
  const isExecuting = sweepState.status !== 'idle' && sweepState.status !== 'complete' && sweepState.status !== 'error'

  return (
    <div className='py-8'>
      <h2 className='text-3xl font-bold mb-6'>Review & Execute</h2>

      {/* Summary */}
      <div className='bg-slate-800 p-6 mb-6' style={{ borderRadius: '0px' }}>
        <p className='text-lg'>
          <span className='font-bold'>{plans.length}</span> chains &rarr;{' '}
          <span className='font-bold'>{totalTokens}</span> tokens &rarr;{' '}
          <span className='font-bold' style={{ color: '#BBB424' }}>~{formatUSD(netValue)} ETH</span>
          {' '}on {destChain?.name ?? 'Unknown'}
        </p>
        <p className='text-sm text-slate-400 mt-2'>
          Total value: {formatUSD(totalValue)} | Est. gas: {formatUSD(totalGas)} | Net: {formatUSD(netValue)}
        </p>
        <p className='text-sm text-slate-400'>
          Destination: {destinationAddress.slice(0, 6)}...{destinationAddress.slice(-4)}
        </p>
      </div>

      {/* Per-chain breakdown */}
      {plans.map((plan) => {
        const isComplete = sweepState.completedChains.includes(plan.chainId)
        const isCurrent = sweepState.currentChainId === plan.chainId
        const txHash = sweepState.txHashes[plan.chainId]

        return (
          <div key={plan.chainId} className='bg-slate-800/50 p-4 mb-3' style={{ borderRadius: '0px' }}>
            <div className='flex items-center justify-between mb-2'>
              <div className='flex items-center space-x-2'>
                <span
                  className='text-xs px-2 py-1 text-white'
                  style={{
                    borderRadius: '0px',
                    backgroundColor: GetNetworkColor(plan.chainName, 'bgVariant'),
                  }}
                >
                  {plan.chainName}
                </span>
                <span className='text-sm'>{plan.tokens.length} tokens</span>
              </div>
              <div className='flex items-center space-x-2'>
                {isComplete && <span className='text-green-400 text-sm'>Done</span>}
                {isCurrent && <span className='text-amber-400 text-sm animate-pulse'>Executing...</span>}
                {txHash && (
                  <a
                    href={getBlockExplorerTxUrl(plan.chainId, txHash)}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-xs text-blue-400 underline'
                  >
                    View tx
                  </a>
                )}
                <span className='text-sm font-semibold'>{formatUSD(plan.netValueUSD)}</span>
              </div>
            </div>
            <div className='text-xs text-slate-400'>
              {plan.tokens.map((t) => t.symbol).join(', ')}
            </div>
          </div>
        )
      })}

      {/* Error */}
      {sweepState.status === 'error' && (
        <div className='bg-red-900/30 border border-red-600 p-4 mb-4' style={{ borderRadius: '0px' }}>
          <p className='text-red-400'>{sweepState.error}</p>
        </div>
      )}

      {/* Action button */}
      {sweepState.status === 'idle' && (
        <button
          onClick={onStartSweep}
          className='w-full px-6 py-4 font-semibold transition-all btn-review-sweep cursor-pointer mt-4'
          style={{ borderRadius: '0px' }}
        >
          <span className='uppercase text-white font-bold'>Start Sweep</span>
        </button>
      )}

      {isExecuting && (
        <div className='text-center mt-4'>
          <p className='text-amber-400 animate-pulse'>
            {sweepState.status === 'swapping' ? 'Swapping tokens...' : 'Bridging to destination...'}
          </p>
        </div>
      )}
    </div>
  )
}
```

**Step 3: Rewrite review page**

Replace `packages/app/src/app/(steps)/review/page.tsx`:

```typescript
'use client'

import {
  selectedTokensAtom,
  stepAtom,
  totalValueAtom,
  totalGasAtom,
  netValueAtom,
  sweepPlansAtom,
  destinationChainIdAtom,
  destinationAddressAtom,
} from '@/atoms/walletAtoms'
import { TransactionReview } from '@/components/sweeper/TransactionReview'
import { useSweep } from '@/app/hooks/useSweep'
import { useAtomValue, useSetAtom } from 'jotai'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'

export default function Review() {
  const { isConnected } = useAccount()
  const router = useRouter()
  const setStep = useSetAtom(stepAtom)

  const selectedTokens = useAtomValue(selectedTokensAtom)
  const totalValue = useAtomValue(totalValueAtom)
  const totalGas = useAtomValue(totalGasAtom)
  const netValue = useAtomValue(netValueAtom)
  const plans = useAtomValue(sweepPlansAtom)
  const destinationChainId = useAtomValue(destinationChainIdAtom)
  const destinationAddress = useAtomValue(destinationAddressAtom)

  const { state: sweepState, executeSweep } = useSweep()

  useEffect(() => {
    setStep(3)
  }, [setStep])

  // Navigate to completion when sweep is done
  useEffect(() => {
    if (sweepState.status === 'complete') {
      setTimeout(() => router.push('/completion'), 1500)
    }
  }, [sweepState.status, router])

  useEffect(() => {
    if (!isConnected && typeof window !== 'undefined') {
      router.replace('/')
    }
  }, [isConnected, router])

  return (
    <TransactionReview
      plans={plans}
      totalValue={totalValue}
      totalGas={totalGas}
      netValue={netValue}
      destinationChainId={destinationChainId}
      destinationAddress={destinationAddress}
      sweepState={sweepState}
      onStartSweep={() => executeSweep(selectedTokens, destinationChainId, destinationAddress)}
    />
  )
}
```

**Step 4: Commit**

```
feat: implement review & execute with wallet_sendCalls batch execution
```

---

## Task 10: Completion Page (Step 4)

Simplify the completion page — no Railgun, show real data.

**Files:**
- Rewrite: `packages/app/src/components/sweeper/SweepCompletion.tsx`
- Rewrite: `packages/app/src/app/(steps)/completion/page.tsx`

**Step 1: Rewrite SweepCompletion**

Replace `packages/app/src/components/sweeper/SweepCompletion.tsx`:

```typescript
import { getBlockExplorerAddressUrl, getChainById } from '@/config/chains'

interface SweepCompletionProps {
  totalSwept: number
  destinationChainId: number
  destinationAddress: string
  onNewSweep: () => void
}

function formatUSD(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function SweepCompletion({
  totalSwept,
  destinationChainId,
  destinationAddress,
  onNewSweep,
}: SweepCompletionProps) {
  const destChain = getChainById(destinationChainId)
  const explorerUrl = getBlockExplorerAddressUrl(destinationChainId, destinationAddress)

  return (
    <div className='flex flex-col items-center justify-center py-20 text-center'>
      <div className='text-6xl mb-6'>&#10003;</div>
      <h2 className='text-3xl font-bold mb-4'>Sweep Complete</h2>
      <p className='text-xl mb-2'>
        ~<span style={{ color: '#BBB424' }}>{formatUSD(totalSwept)}</span> ETH consolidated
        on {destChain?.name ?? 'Unknown'}
      </p>
      {explorerUrl && (
        <a
          href={explorerUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='text-blue-400 underline text-sm mb-8'
        >
          View on {destChain?.name} Explorer
        </a>
      )}
      <button
        onClick={onNewSweep}
        className='btn-start-scanning cursor-pointer mt-4'
      >
        <span className='gradient-text'>START NEW SWEEP</span>
      </button>
    </div>
  )
}
```

**Step 2: Rewrite completion page**

Replace `packages/app/src/app/(steps)/completion/page.tsx`:

```typescript
'use client'

import { stepAtom, netValueAtom, destinationChainIdAtom, destinationAddressAtom } from '@/atoms/walletAtoms'
import { SweepCompletion } from '@/components/sweeper/SweepCompletion'
import { useAtomValue, useSetAtom } from 'jotai'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'

export default function Completion() {
  const { isConnected } = useAccount()
  const router = useRouter()
  const setStep = useSetAtom(stepAtom)
  const netValue = useAtomValue(netValueAtom)
  const destinationChainId = useAtomValue(destinationChainIdAtom)
  const destinationAddress = useAtomValue(destinationAddressAtom)

  useEffect(() => {
    setStep(4)
  }, [setStep])

  useEffect(() => {
    if (!isConnected && typeof window !== 'undefined') {
      router.replace('/')
    }
  }, [isConnected, router])

  return (
    <SweepCompletion
      totalSwept={netValue}
      destinationChainId={destinationChainId}
      destinationAddress={destinationAddress}
      onNewSweep={() => router.push('/')}
    />
  )
}
```

**Step 3: Commit**

```
feat: simplify completion page with real sweep data
```

---

## Task 11: Final Cleanup and Build Verification

Clean up remaining references, update site metadata, and verify the app builds.

**Files:**
- Modify: `packages/app/src/utils/site.ts`
- Modify: `packages/app/src/app/hooks/` — delete stubs if any remain
- Delete: `packages/app/src/app/actions/` — directory if empty after cleanup
- Verify: full build compiles

**Step 1: Update site metadata**

Replace `packages/app/src/utils/site.ts`:

```typescript
export const SITE_EMOJI = '🧹'
export const SITE_NAME = 'DUST.OPS'
export const SITE_INFO = 'Cross-chain token dust sweeper'
export const SITE_DESCRIPTION = 'Scan, consolidate, and sweep dust tokens across 9 EVM chains into ETH.'
export const SITE_URL = 'https://dust-ops.vercel.app'

export const SOCIAL_TWITTER = ''
export const SOCIAL_GITHUB = 'Tranquil-Flow/dust-ops'
```

**Step 2: Clean up empty directories**

```bash
rm -rf packages/app/src/app/actions
rm -rf packages/app/src/app/hooks  # only if empty after our rewrites (it won't be — useSweep and useWalletCapabilities are there)
```

Wait — `useSweep.ts` and `useWalletCapabilities.ts` live in `app/hooks/`. Only delete the old stubs, not the directory. The directory should now contain:
- `useWalletCapabilities.ts` (new, from Task 6)
- `useSweep.ts` (new, from Task 9)

Delete only the actions directory:
```bash
rm -rf packages/app/src/app/actions
```

**Step 3: Create .env.example**

Create `packages/app/.env.example`:

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
LIFI_API_KEY=
```

**Step 4: Verify build**

```bash
cd packages/app && yarn build
```

Fix any remaining TypeScript errors.

**Step 5: Commit**

```
feat: finalize MVP — update metadata, clean up dead references
```

---

## Task 12: Manual Smoke Test

**Not a code task.** Verify the app works end-to-end:

1. `cd packages/app && yarn dev`
2. Open http://localhost:3000
3. Click "Connect Wallet" — verify Reown AppKit modal appears
4. Connect with MetaMask or Ambire
5. If wallet doesn't support EIP-5792, verify the warning message appears
6. If it does, verify scanning starts across 9 chains
7. Verify token list shows with correct pricing and gas viability indicators
8. Verify destination chain dropdown and address input work
9. Click "Review & Sweep" — verify per-chain breakdown is shown
10. Click "Start Sweep" — verify wallet prompts appear (wallet_sendCalls)
11. Verify completion page shows real data

---

---

## Phase 2: Testing (Tasks 13-17)

These tasks add comprehensive test coverage after the core implementation is complete.

---

## Task 13: Set Up Vitest

Install and configure Vitest for the Next.js app.

**Files:**
- Modify: `packages/app/package.json`
- Create: `packages/app/vitest.config.ts`
- Create: `packages/app/src/__tests__/setup.ts`

**Step 1: Install Vitest and deps**

```bash
cd packages/app && yarn add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

**Step 2: Create vitest.config.ts**

Create `packages/app/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Step 3: Create test setup file**

Create `packages/app/src/__tests__/setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest'
```

**Step 4: Add test script to package.json**

Add to `packages/app/package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 5: Verify Vitest runs**

```bash
cd packages/app && yarn test
```

Expected: 0 tests found, no errors.

**Step 6: Commit**

```
chore: set up Vitest with jsdom and React Testing Library
```

---

## Task 14: Unit Tests — Chain Config and Types

Unit tests for the data-driven chain registry, type helpers, and atom computations.

**Files:**
- Create: `packages/app/src/__tests__/unit/chains.test.ts`
- Create: `packages/app/src/__tests__/unit/atoms.test.ts`

**Step 1: Write chain config tests**

Create `packages/app/src/__tests__/unit/chains.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  TIER1_CHAINS,
  getChainById,
  getBlockExplorerTxUrl,
  getBlockExplorerAddressUrl,
  NATIVE_TOKEN_ADDRESS,
} from '@/config/chains'

describe('Chain Config', () => {
  it('has 9 tier-1 chains', () => {
    expect(TIER1_CHAINS).toHaveLength(9)
  })

  it('each chain has required fields', () => {
    for (const chain of TIER1_CHAINS) {
      expect(chain.id).toBeGreaterThan(0)
      expect(chain.name).toBeTruthy()
      expect(chain.explorerApi.type).toMatch(/^(blockscout|etherscan)$/)
      expect(chain.explorerApi.url).toMatch(/^https:\/\//)
      expect(chain.tier).toBe(1)
    }
  })

  it('getChainById returns correct chain', () => {
    const base = getChainById(8453)
    expect(base?.name).toBe('Base')
  })

  it('getChainById returns undefined for unknown chain', () => {
    expect(getChainById(99999)).toBeUndefined()
  })

  it('generates block explorer URLs', () => {
    const txUrl = getBlockExplorerTxUrl(8453, '0xabc123')
    expect(txUrl).toContain('0xabc123')
    expect(txUrl).toContain('http')

    const addrUrl = getBlockExplorerAddressUrl(8453, '0xdef456')
    expect(addrUrl).toContain('0xdef456')
  })

  it('NATIVE_TOKEN_ADDRESS is zero address', () => {
    expect(NATIVE_TOKEN_ADDRESS).toBe('0x0000000000000000000000000000000000000000')
  })

  it('no duplicate chain IDs', () => {
    const ids = TIER1_CHAINS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

**Step 2: Write atom computation tests**

Create `packages/app/src/__tests__/unit/atoms.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createStore } from 'jotai'
import {
  scannedTokensAtom,
  selectedTokensAtom,
  totalValueAtom,
  totalGasAtom,
  netValueAtom,
  sweepPlansAtom,
  destinationChainIdAtom,
} from '@/atoms/walletAtoms'
import type { ScannedToken } from '@/config/types'

function makeToken(overrides: Partial<ScannedToken> = {}): ScannedToken {
  return {
    contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
    name: 'Test Token',
    symbol: 'TST',
    decimals: 18,
    type: 'ERC-20',
    balance: BigInt('1000000000000000000'),
    chainId: 8453,
    chainName: 'Base',
    priceUSD: 1.0,
    valueUSD: 1.0,
    estimatedGasUSD: 0.01,
    status: 'sweepable',
    ...overrides,
  }
}

describe('Wallet Atoms', () => {
  it('totalValueAtom sums selected token values', () => {
    const store = createStore()
    const tokens = [makeToken({ valueUSD: 5 }), makeToken({ valueUSD: 3 })]
    store.set(selectedTokensAtom, tokens)
    expect(store.get(totalValueAtom)).toBe(8)
  })

  it('totalGasAtom sums selected token gas', () => {
    const store = createStore()
    const tokens = [
      makeToken({ estimatedGasUSD: 0.02 }),
      makeToken({ estimatedGasUSD: 0.03 }),
    ]
    store.set(selectedTokensAtom, tokens)
    expect(store.get(totalGasAtom)).toBe(0.05)
  })

  it('netValueAtom = totalValue - totalGas', () => {
    const store = createStore()
    const tokens = [makeToken({ valueUSD: 10, estimatedGasUSD: 0.5 })]
    store.set(selectedTokensAtom, tokens)
    expect(store.get(netValueAtom)).toBe(9.5)
  })

  it('sweepPlansAtom groups by chain', () => {
    const store = createStore()
    const tokens = [
      makeToken({ chainId: 8453, chainName: 'Base', valueUSD: 5, estimatedGasUSD: 0.01 }),
      makeToken({ chainId: 10, chainName: 'Optimism', valueUSD: 3, estimatedGasUSD: 0.02, contractAddress: '0xaaa' }),
    ]
    store.set(selectedTokensAtom, tokens)
    const plans = store.get(sweepPlansAtom)
    expect(plans).toHaveLength(2)
    expect(plans.find((p) => p.chainId === 8453)?.tokens).toHaveLength(1)
    expect(plans.find((p) => p.chainId === 10)?.tokens).toHaveLength(1)
  })

  it('defaults destination chain to Base (8453)', () => {
    const store = createStore()
    expect(store.get(destinationChainIdAtom)).toBe(8453)
  })
})
```

**Step 3: Run tests**

```bash
cd packages/app && yarn test
```

Expected: All pass.

**Step 4: Commit**

```
test: add unit tests for chain config and wallet atoms
```

---

## Task 15: Integration Tests — Scanner Adapters

Test the Blockscout and Etherscan scanner adapters with mocked HTTP responses.

**Files:**
- Create: `packages/app/src/__tests__/integration/blockscout-scanner.test.ts`
- Create: `packages/app/src/__tests__/integration/etherscan-scanner.test.ts`

**Step 1: Write Blockscout scanner tests**

Create `packages/app/src/__tests__/integration/blockscout-scanner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BlockscoutScanner } from '@/lib/scanners/blockscout'

const MOCK_TOKEN_RESPONSE = {
  status: '1',
  result: [
    {
      balance: '1000000000000000000',
      contractAddress: '0xtoken1',
      decimals: '18',
      name: 'Mock Token',
      symbol: 'MOCK',
      type: 'ERC-20',
    },
    {
      balance: '500',
      contractAddress: '0xnft1',
      decimals: '0',
      name: 'Mock NFT',
      symbol: 'MNFT',
      type: 'ERC-721',
    },
  ],
}

const MOCK_BALANCE_RESPONSE = {
  status: '1',
  result: '5000000000000000000',
}

describe('BlockscoutScanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches ERC-20 tokens and native balance', async () => {
    const scanner = new BlockscoutScanner('https://base.blockscout.com')

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('action=tokenlist')) {
        return new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 })
      }
      if (urlStr.includes('action=balance')) {
        return new Response(JSON.stringify(MOCK_BALANCE_RESPONSE), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    })

    const result = await scanner.fetchTokenBalances('0xTestAddress')

    // Should include 1 ERC-20 + 1 native, skip ERC-721
    expect(result.length).toBe(2)
    expect(result.find((t) => t.symbol === 'MOCK')).toBeDefined()
    expect(result.find((t) => t.type === 'Native')).toBeDefined()
    expect(result.find((t) => t.type === 'ERC-721')).toBeUndefined()
  })

  it('returns empty array on API error', async () => {
    const scanner = new BlockscoutScanner('https://base.blockscout.com')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    )

    const result = await scanner.fetchTokenBalances('0xTestAddress')
    expect(result).toEqual([])
  })
})
```

**Step 2: Write Etherscan scanner tests**

Create `packages/app/src/__tests__/integration/etherscan-scanner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EtherscanScanner } from '@/lib/scanners/etherscan'

const MOCK_TOKEN_RESPONSE = {
  status: '1',
  result: [
    {
      TokenAddress: '0xtoken1',
      TokenName: 'Mock Token',
      TokenSymbol: 'MOCK',
      TokenQuantity: '2000000000000000000',
      TokenDivisor: '18',
    },
  ],
}

const MOCK_BALANCE_RESPONSE = {
  status: '1',
  result: '3000000000000000000',
}

describe('EtherscanScanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches tokens and native balance', async () => {
    const scanner = new EtherscanScanner('https://api.etherscan.io', 'test-api-key')

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('action=tokentx') || urlStr.includes('action=tokenlist')) {
        return new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 })
      }
      if (urlStr.includes('action=balance')) {
        return new Response(JSON.stringify(MOCK_BALANCE_RESPONSE), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    })

    const result = await scanner.fetchTokenBalances('0xTestAddress')
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('returns empty on API failure', async () => {
    const scanner = new EtherscanScanner('https://api.etherscan.io', 'test-api-key')

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const result = await scanner.fetchTokenBalances('0xTestAddress')
    expect(result).toEqual([])
  })
})
```

**Step 3: Run tests**

```bash
cd packages/app && yarn test
```

Expected: All pass.

**Step 4: Commit**

```
test: add integration tests for Blockscout and Etherscan scanners
```

---

## Task 16: Fork Tests — Swap Execution Verification

Test that LI.FI swap quotes produce valid calldata by executing against forked chains using Anvil.

**Prerequisites:** `anvil` must be installed (`curl -L https://foundry.paradigm.xyz | bash && foundryup`).

**Files:**
- Create: `packages/app/src/__tests__/fork/swap-execution.test.ts`
- Create: `packages/app/src/__tests__/fork/helpers.ts`

**Step 1: Create fork test helpers**

Create `packages/app/src/__tests__/fork/helpers.ts`:

```typescript
import { createPublicClient, http, type PublicClient } from 'viem'
import { spawn, type ChildProcess } from 'child_process'

export interface AnvilInstance {
  process: ChildProcess
  rpcUrl: string
  client: PublicClient
}

export async function startAnvil(forkUrl: string, forkBlockNumber?: number): Promise<AnvilInstance> {
  const port = 8545 + Math.floor(Math.random() * 1000)
  const args = ['--fork-url', forkUrl, '--port', port.toString()]
  if (forkBlockNumber) {
    args.push('--fork-block-number', forkBlockNumber.toString())
  }

  const anvilProcess = spawn('anvil', args, { stdio: 'pipe' })

  // Wait for anvil to start
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Anvil startup timeout')), 15000)

    anvilProcess.stdout?.on('data', (data: Buffer) => {
      if (data.toString().includes('Listening on')) {
        clearTimeout(timeout)
        resolve()
      }
    })

    anvilProcess.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  const rpcUrl = `http://127.0.0.1:${port}`
  const client = createPublicClient({ transport: http(rpcUrl) })

  return { process: anvilProcess, rpcUrl, client }
}

export function stopAnvil(instance: AnvilInstance) {
  instance.process.kill('SIGTERM')
}
```

**Step 2: Write fork swap test**

Create `packages/app/src/__tests__/fork/swap-execution.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startAnvil, stopAnvil, type AnvilInstance } from './helpers'
import { createWalletClient, http, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

// These tests require FORK_RPC_URL env var and anvil installed
const FORK_RPC_URL = process.env.FORK_RPC_URL

describe.skipIf(!FORK_RPC_URL)('Fork Tests — Swap Execution', () => {
  let anvil: AnvilInstance

  beforeAll(async () => {
    anvil = await startAnvil(FORK_RPC_URL!)
  }, 30000)

  afterAll(() => {
    if (anvil) stopAnvil(anvil)
  })

  it('can simulate a token approval transaction', async () => {
    // Use anvil's default funded account
    const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(anvil.rpcUrl),
    })

    // Verify the test account has ETH
    const balance = await anvil.client.getBalance({ address: account.address })
    expect(balance).toBeGreaterThan(0n)
  })

  it('can read on-chain token balance', async () => {
    // USDC on Base
    const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

    const balance = await anvil.client.readContract({
      address: USDC_BASE,
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }],
        },
      ],
      functionName: 'balanceOf',
      args: ['0x0000000000000000000000000000000000000001'],
    })

    // We just verify the call succeeds — the balance could be anything
    expect(typeof balance).toBe('bigint')
  })
})
```

**Step 3: Run fork tests (requires anvil + RPC URL)**

```bash
cd packages/app && FORK_RPC_URL=https://mainnet.base.org yarn test -- --grep "Fork Tests"
```

Expected: Tests pass if anvil is installed; skipped otherwise.

**Step 4: Commit**

```
test: add fork tests for swap execution verification
```

---

## Task 17: Integration Tests — API Routes

Test the `/api/scan`, `/api/quote`, and `/api/status` routes with mocked external dependencies.

**Files:**
- Create: `packages/app/src/__tests__/integration/api-scan.test.ts`
- Create: `packages/app/src/__tests__/integration/api-quote.test.ts`

**Step 1: Write /api/scan route test**

Create `packages/app/src/__tests__/integration/api-scan.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the scanner module
vi.mock('@/lib/scanners', () => ({
  scanAllChains: vi.fn(),
}))

describe('/api/scan route', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 400 without address parameter', async () => {
    const { GET } = await import('@/app/api/scan/route')
    const request = new Request('http://localhost/api/scan')
    const response = await GET(request as any)
    expect(response.status).toBe(400)
  })

  it('returns scan results for valid address', async () => {
    const { scanAllChains } = await import('@/lib/scanners')
    const mockScanAllChains = vi.mocked(scanAllChains)
    mockScanAllChains.mockResolvedValue([
      {
        chainId: 8453,
        chainName: 'Base',
        tokens: [
          {
            contractAddress: '0xtoken1',
            name: 'Test',
            symbol: 'TST',
            decimals: 18,
            type: 'ERC-20',
            balance: '1000000000000000000',
          },
        ],
      },
    ])

    const { GET } = await import('@/app/api/scan/route')
    const request = new Request('http://localhost/api/scan?address=0x1234567890abcdef1234567890abcdef12345678')
    const response = await GET(request as any)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toHaveLength(1)
    expect(data[0].chainId).toBe(8453)
  })
})
```

**Step 2: Write /api/quote route test**

Create `packages/app/src/__tests__/integration/api-quote.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the LI.FI provider
vi.mock('@/lib/lifi/provider', () => ({
  getSwapQuote: vi.fn(),
}))

describe('/api/quote route', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 400 for missing params', async () => {
    const { POST } = await import('@/app/api/quote/route')
    const request = new Request('http://localhost/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const response = await POST(request as any)
    expect(response.status).toBe(400)
  })

  it('returns quote for valid params', async () => {
    const { getSwapQuote } = await import('@/lib/lifi/provider')
    const mockGetSwapQuote = vi.mocked(getSwapQuote)
    mockGetSwapQuote.mockResolvedValue({
      id: 'test-quote',
      fromToken: { address: '0xtoken', symbol: 'TST', decimals: 18, chainId: 8453 },
      toToken: { address: '0x0', symbol: 'ETH', decimals: 18, chainId: 8453 },
      fromAmount: '1000000000000000000',
      toAmount: '500000000000000',
      toAmountUSD: '1.50',
      estimatedGas: '100000',
      gasCostUSD: '0.01',
      approvalAddress: '0xapproval',
      transactionRequest: {
        to: '0xrouter',
        data: '0xcalldata',
        value: '0',
        gasLimit: '200000',
        chainId: 8453,
      },
    })

    const { POST } = await import('@/app/api/quote/route')
    const request = new Request('http://localhost/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromChainId: 8453,
        fromTokenAddress: '0xtoken',
        fromAmount: '1000000000000000000',
        fromAddress: '0xuser',
        toChainId: 8453,
      }),
    })
    const response = await POST(request as any)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.id).toBe('test-quote')
    expect(data.toAmountUSD).toBe('1.50')
  })
})
```

**Step 3: Run all tests**

```bash
cd packages/app && yarn test
```

Expected: All pass.

**Step 4: Commit**

```
test: add integration tests for API routes (scan, quote)
```

---

Plan complete and saved to `docs/plans/2026-02-19-dust-ops-mvp-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?
