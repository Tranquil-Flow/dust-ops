# Dust Ops MVP Design

## Overview

Dust Ops is a cross-chain token sweeper for EVM wallets. It scans fragmented wallets across multiple chains, identifies liquid dust tokens, consolidates them into ETH via DEX swaps, bridges the proceeds to a user-chosen destination chain, and delivers consolidated ETH to a specified address.

This document describes the MVP architecture — a frontend-orchestrated, contract-free approach using aggregator APIs and EIP-5792 wallet batching.

## Decisions

| Aspect | Decision |
|--------|----------|
| Architecture | Frontend-orchestrated, no custom smart contracts |
| Wallet connection | WalletConnect via Reown AppKit, `wallet_sendCalls` (EIP-5792) only |
| Wallet promotion | Ambire/Kohaku recommended for best EIP-7702 atomic batching |
| Chains | 9 MVP: Ethereum, Base, Optimism, Arbitrum, Polygon, Scroll, Linea, zkSync Era, Unichain |
| Scanning | Multi-explorer parallel scan (Blockscout + Etherscan-compatible APIs) |
| Swaps | LI.FI API (single provider for swaps and bridges) |
| Bridges | LI.FI API |
| Output token | ETH only |
| Destination | User picks chain + address |
| Gas strategy | User pays directly on L2; uneconomic tokens greyed out (gas > value) |
| Privacy (Railgun) | Deferred to v2 |
| Paymaster/gasless | Deferred to v2 |
| Solver/multi-user batching | Deferred to v2/v3 |
| Sequential tx fallback | Deferred to future version |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    DUST.OPS MVP                      │
│                                                      │
│  Next.js App (Vercel)                                │
│  ┌───────────────────────────────────────────────┐   │
│  │ Frontend (React + Wagmi + Reown AppKit)       │   │
│  │                                                │   │
│  │  WalletConnect ──→ wallet_sendCalls (EIP-5792) │   │
│  │       │                                        │   │
│  │       ▼                                        │   │
│  │  Scan 9 chains ──→ Select tokens ──→ Execute   │   │
│  └───────────────┬───────────────────────┬────────┘   │
│                  │                       │            │
│  ┌───────────────▼───────┐  ┌────────────▼────────┐  │
│  │ /api/scan (proxy)     │  │ /api/quote (proxy)  │  │
│  │ Explorer APIs ×9      │  │ LI.FI swap + bridge │  │
│  │ Price discovery       │  │ Quote caching (30s) │  │
│  └───────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

Key principles:

- No custom smart contracts. Aggregator APIs return calldata, the user's wallet executes it.
- Server-side API proxy avoids CORS issues, manages rate limits, and caches quotes.
- Wallet-first: user connects via WalletConnect and signs everything themselves.
- Per-chain batching: `wallet_sendCalls` groups [approve + swap] calls per chain. Bridge transactions are separate calls per source chain.

## Chain Support

### MVP Chains (Tier 1 — scanned immediately)

| Chain | Chain ID | Explorer API | Gas Tier |
|-------|----------|-------------|----------|
| Ethereum | 1 | Etherscan | High (~$0.50-3.00/swap) |
| Base | 8453 | Blockscout | Ultra-low (~$0.01) |
| Optimism | 10 | Blockscout | Low (~$0.02-0.04) |
| Arbitrum | 42161 | Arbiscan | Low (~$0.03-0.05) |
| Polygon | 137 | Polygonscan | Ultra-low (~$0.01) |
| Scroll | 534352 | Scrollscan | Low (~$0.02) |
| Linea | 59144 | Lineascan | Low (~$0.02) |
| zkSync Era | 324 | Era explorer | Low (~$0.02) |
| Unichain | 1301 | Blockscout | Ultra-low (~$0.01) |

### Future Expansion (Tier 2+)

Chain config is data-driven. Adding a chain means adding an entry to the registry:

```typescript
const CHAINS: ChainConfig[] = [
  {
    id: 8453,
    name: 'Base',
    explorerApi: { type: 'blockscout', url: 'https://base.blockscout.com' },
    lifiChainKey: 'bas',
    tier: 1,
  },
  // adding a chain = adding an entry here
]
```

Future tiers:
- Tier 2: scanned in background, results stream in progressively
- Tier 3: scanned only on explicit user request ("scan all chains")

## Token Scanning

Server-side `/api/scan` route proxies explorer APIs:

- Parallel scan across all tier 1 chains
- Fetch ERC-20 token lists + native ETH balances per chain
- Price each token via LI.FI quote API (more accurate than price feeds for obscure tokens — the aggregator knows if a swap route actually exists)
- Estimate gas cost per token per chain
- Classify each token: **sweepable** (value > gas), **uneconomic** (value < gas, greyed out), **no-route** (no swap liquidity, greyed out)

### Scanner Adapter Interface

```typescript
interface ChainScanner {
  fetchTokenBalances(address: string): Promise<TokenBalance[]>
}
```

Implementations: `BlockscoutScanner`, `EtherscanScanner`. Each chain config specifies which adapter type to use.

## Wallet Connection

### EIP-5792 Only

Users connect via Reown AppKit (WalletConnect). On connect, the app calls `wallet_getCapabilities` to check for `wallet_sendCalls` support.

- If supported: proceed to scanning
- If not supported: show message recommending Ambire, MetaMask 12+, or Coinbase Wallet. Do not proceed.

No sequential transaction fallback in MVP.

### Ambire Promotion

After wallet connect, if the connected wallet supports `wallet_sendCalls` but is not Ambire, show a subtle informational banner: "For the fastest sweep experience with atomic batch transactions, try Ambire wallet." Non-blocking.

Ambire handles EIP-7702 delegation internally. When the dApp sends `wallet_sendCalls`, Ambire batches the calls atomically via its own delegation mechanism. The dApp code is identical for all wallets — Ambire users simply get a better underlying execution.

## Swap & Bridge Execution

### LI.FI Integration

Single provider for both swaps and bridges.

**Provider abstraction** (for future provider swaps):

```typescript
interface SwapProvider {
  getSwapQuote(params: SwapParams): Promise<Quote>
  getBridgeQuote(params: BridgeParams): Promise<Quote>
  getStatus(txHash: string): Promise<TxStatus>
}
```

MVP ships with `LiFiProvider`. The interface allows swapping to 0x, 1inch, Socket, etc. in future versions.

### Execution Flow

```
Per-chain sweep:
  1. Fetch fresh LI.FI quotes (just-in-time, not stale)
  2. Build tx list: [approve₁, swap₁, approve₂, swap₂, ...]
  3. wallet_sendCalls({ calls: [...], chainId })
  4. wallet_getCallsStatus() to poll completion
  5. User now has ETH on this chain

Cross-chain consolidation:
  6. Fetch bridge quotes from LI.FI
  7. For each non-destination chain with ETH:
       wallet_sendCalls({ calls: [bridge_tx], chainId })
  8. Poll LI.FI /status API for bridge completion
```

### Server-Side Quote Proxy

`/api/quote` proxies LI.FI API calls:
- Manages rate limits
- Caches quotes with 30s TTL (quotes go stale fast)
- Returns normalized response format

`/api/status` proxies LI.FI status API:
- Polls transaction and bridge completion status

## Gas Strategy

### MVP Approach

User pays gas directly. On L2s this is $0.01-0.07 for a batched sweep.

Minimum viable dust thresholds (approximate):
- Base/Polygon/Unichain: ~$0.10
- Arbitrum/Optimism/Scroll/Linea/zkSync: ~$0.50
- Ethereum L1: ~$3.00+

Tokens where estimated gas exceeds token value are greyed out in the selection UI with a "costs more than it's worth" label. Users cannot select them.

### Future Versions

- **v2**: Paymaster-sponsored sweeps (Pimlico/Biconomy). User needs zero ETH. Paymaster deducts gas fee from swap proceeds.
- **v2**: Permit2 gasless approvals for tokens with existing Permit2 allowances.
- **v3**: Solver/intent model. Users sign off-chain intents, a solver batches multiple users' dust into one mega-transaction and takes a small cut.

## UI Flow

### Step 0: Connect Wallet
- Reown AppKit modal
- Check `wallet_sendCalls` capability via `wallet_getCapabilities`
- If not supported: show "Please use Ambire/MetaMask/Coinbase" message, block progress
- On connect: advance to Step 1

### Step 1: Scan & Discover
- Parallel scan across 9 chains
- Fetch balances + prices via explorer APIs
- Estimate gas per token via LI.FI quote
- Classify: sweepable / uneconomic / no-route
- Auto-advance to Step 2

### Step 2: Select Tokens + Destination
- Pre-select all sweepable tokens
- Grey out uneconomic tokens ("gas > value")
- Grey out no-route tokens ("no swap liquidity")
- Show total estimated value + estimated gas + net proceeds
- Destination chain dropdown
- Destination address input (defaults to connected wallet)
- User confirms: advance to Step 3

### Step 3: Review & Execute
- Fetch fresh LI.FI quotes (just-in-time)
- Show breakdown: per-token value, gas cost, net proceeds
- Show execution plan: "3 chains → 12 tokens → ~$47.30 ETH on Base"
- "Start Sweep" button
- Execute chain by chain with real-time progress UI:
  - Chain A: wallet_sendCalls [approve+swap ×N] → track status
  - Chain B: wallet_sendCalls [approve+swap ×N] → track status
  - Then bridge txs per source chain → track via LI.FI /status
- All complete: advance to Step 4

### Step 4: Complete
- Show total swept: "$47.30 ETH on Base"
- Link to destination address on block explorer
- "Start New Sweep" button

## Codebase Changes

### Remove
- `packages/foundry/` — Solidity contracts directory
- `lib/` — LayerZero/OpenZeppelin submodules
- `.gitmodules` — submodule config
- `ethglobalprague/` — submodule reference
- `privateKeyAtom`, `usePrivateAccount` hook, private key input field
- `getHoldingsAction.tsx` — Sepolia/Rootstock server action
- `getQuoteAction.ts` — Uniswap V4-specific quoting
- `abis.ts` — contract ABIs (65KB)
- Privacy deposit page + `SweepProcessing` animation
- Railgun-related atoms and UI
- Hardcoded gas estimates and ETH price

### Keep and Modify
- Next.js app structure + Tailwind + DaisyUI design system
- Reown AppKit / WalletConnect setup (`Web3.tsx`) — becomes primary wallet connection
- Token selection UI (`TokenSelection.tsx`) — add gas viability indicators
- Step wizard layout — reduce from 6 to 5 steps
- `/api/` route patterns — repurpose for scan/quote/status proxies
- Jotai atoms pattern — new atoms for new state shape
- Branding, logos, design system

### Build New
- `ChainConfig` registry — data-driven chain definitions
- `ChainScanner` adapters — Blockscout + Etherscan-compatible implementations
- `SwapProvider` interface + `LiFiProvider` implementation
- `/api/scan` — server-side multi-chain token scanner
- `/api/quote` — server-side LI.FI quote proxy with 30s TTL cache
- `/api/status` — transaction/bridge status polling proxy
- `useSweep` hook — orchestrates full sweep execution
- `useWalletCapabilities` hook — detects `wallet_sendCalls` support
- Real-time execution progress UI in Step 3
- Gas viability calculation per token

## Environment Variables

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID  # Reown AppKit
NEXT_PUBLIC_LIFI_API_KEY              # LI.FI API (optional, free tier available)
REDIS_CONNSTR                         # Quote/scan caching
```

Infura/Alchemy keys no longer required — LI.FI handles RPC routing internally.

## v2 Roadmap (Not MVP)

- Railgun privacy routing
- Paymaster-sponsored gasless sweeps
- Permit2 gasless approvals
- Sequential transaction fallback for wallets without EIP-5792
- Output token selection (ETH or USDC)
- Solver/intent model for multi-user batching
- Approval revoking (wallet hygiene combo feature)
