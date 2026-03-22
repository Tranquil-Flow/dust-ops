# dust-ops — MVP Tasks

> Single source of truth for automated work sessions.
> Design docs: `docs/plans/2026-02-19-dust-ops-mvp-design.md` and `docs/plans/2026-02-19-dust-ops-mvp-implementation.md`

---

## Phase 1 — Core Implementation

### Task 1: Remove Dead Hackathon Code
- [ ] Delete `packages/foundry/` directory (Solidity contracts)
- [ ] Delete `lib/` directory (LayerZero/OpenZeppelin submodules)
- [ ] Delete `.gitmodules` file
- [ ] Delete `ethglobalprague/` submodule reference
- [ ] Remove private key flow: `privateKeyAtom`, `usePrivateAccount` hook, private key input in `WalletConnection.tsx`
- [ ] Remove `getHoldingsAction.tsx` (Sepolia/Rootstock server action)
- [ ] Remove `getQuoteAction.ts` (Uniswap V4 quoting)
- [ ] Remove `abis.ts` (65KB contract ABIs)
- [ ] Remove privacy deposit page (`privacy-deposit/`) + `SweepProcessing.tsx` animation
- [ ] Remove Railgun-related atoms and UI references
- [ ] Remove hardcoded gas estimates and ETH price constants
- [ ] Remove `examples/` directory (EIP-7702 experiments with leaked env vars)
- [ ] Remove debug/test pricing utilities (`debug-pricing.ts`, `test-pricing.ts`, `pricing-comparison.ts`)
- [ ] Remove unused dependencies from package.json: `@uniswap/*`, `@privy-io/react-auth`, `siwe`
- [ ] Install `@lifi/sdk`
- [ ] Verify build still compiles after cleanup

### Task 2: Chain Registry & Types
- [ ] Create `src/config/chains.ts` — 9-chain registry (Ethereum, Base, Optimism, Arbitrum, Polygon, Scroll, Linea, zkSync Era, Unichain) with explorer API configs, LI.FI chain keys, gas tiers
- [ ] Create `src/config/types.ts` — `ScannedToken`, `SweepPlan`, `SweepState`, `Quote`, `ChainConfig` types
- [ ] Wire chain config into `network.ts` (replace hardcoded 3-chain list)

### Task 3: State Atoms
- [ ] Replace `privateKeyAtom` / `railgunAddressAtom` with new sweep atoms: `scannedTokensAtom`, `selectedTokensAtom`, `sweepPlansAtom`, `sweepStateAtom`, `destinationAtom`
- [ ] Remove stale atom references across components

### Task 4: Scanner Adapters
- [ ] Create `ChainScanner` interface: `fetchTokenBalances(address: string): Promise<TokenBalance[]>`
- [ ] Implement `BlockscoutScanner` (for Base, Optimism, Unichain, Scroll)
- [ ] Implement `EtherscanScanner` (for Ethereum, Arbitrum, Polygon, Linea, zkSync Era)
- [ ] Create `/api/scan` server-side route — parallel multi-chain scan with price discovery
- [ ] Add gas viability classification per token (sweepable / uneconomic / no-route)

### Task 5: LI.FI Integration
- [ ] Create `SwapProvider` interface: `getSwapQuote()`, `getBridgeQuote()`, `getStatus()`
- [ ] Implement `LiFiProvider` using `@lifi/sdk`
- [ ] Create `/api/quote` route — LI.FI quote proxy with 30s TTL caching
- [ ] Create `/api/status` route — transaction/bridge status polling proxy

### Task 6: Demo / Testnet Mode
- [ ] Create `src/config/demo.ts` — feature flag (`NEXT_PUBLIC_DEMO_MODE=true`) to toggle demo mode
- [ ] Create `MockScanner` adapter — returns realistic fake token balances across multiple chains (mix of sweepable, uneconomic, and no-route tokens)
- [ ] Create `MockSwapProvider` — returns fake LI.FI quotes with realistic gas estimates and simulated 2-3s execution delays
- [ ] Create mock wallet hook — simulates `wallet_sendCalls` and `wallet_getCallsStatus` without a real wallet connection
- [ ] Wire demo mode into scan/quote/status API routes — when flag is set, return mock data instead of calling external APIs
- [ ] Wire demo mode into wallet connection — skip WalletConnect, auto-connect with a demo address
- [ ] Add visible "DEMO MODE" banner in the UI header when active
- [ ] Ensure full wizard flow works end-to-end in demo mode: connect → scan → select → review → execute → complete
- [ ] Document demo mode setup in CLAUDE.md

### Task 7: Wallet Connection (WalletConnect)
- [ ] Replace private key input with Reown AppKit WalletConnect modal in Step 0
- [ ] Create `useWalletCapabilities` hook — detect `wallet_sendCalls` (EIP-5792) support
- [ ] Gate progress: if wallet lacks EIP-5792, show recommendation for Ambire/MetaMask 12+/Coinbase Wallet
- [ ] Optional Ambire promotion banner for non-Ambire EIP-5792 wallets

### Task 8: Scan Holdings Page Rewrite
- [ ] Wire scan-holdings page to new `/api/scan` route
- [ ] Show real-time parallel scan progress across 9 chains
- [ ] Display token counts + values as they stream in
- [ ] Auto-advance to token selection when scan completes

### Task 9: Token Selection Page Rewrite
- [ ] Wire to scanned token data from atoms
- [ ] Add gas viability indicators: sweepable (selectable), uneconomic (greyed, "gas > value"), no-route (greyed, "no liquidity")
- [ ] Add destination chain dropdown (9 chains)
- [ ] Add destination address input (defaults to connected wallet)
- [ ] Show total estimated value + gas + net proceeds

### Task 10: Review & Execute — useSweep Hook
- [ ] Create `useSweep` hook — orchestrate full sweep execution
- [ ] Fetch fresh LI.FI quotes just-in-time on review page load
- [ ] Show execution plan breakdown: per-token value, gas cost, net proceeds
- [ ] Implement per-chain `wallet_sendCalls` batching: [approve + swap] × N per chain
- [ ] Implement cross-chain bridge calls via LI.FI after same-chain swaps complete
- [ ] Real-time progress UI replacing fake animation (chain-by-chain status)
- [ ] Poll `wallet_getCallsStatus()` and LI.FI `/status` for completion tracking

### Task 11: Completion Page Simplification
- [ ] Show real sweep results: total ETH swept, destination chain, destination address
- [ ] Link to block explorer for destination address
- [ ] "Start New Sweep" button (reset atoms, return to Step 0)
- [ ] Remove fake Railgun countdown timer

### Task 12: Final Cleanup & Build Verification
- [ ] Update page metadata and titles
- [ ] Remove any remaining TODO/FIXME comments referencing hackathon
- [ ] Verify `yarn build` compiles cleanly
- [ ] Verify all pages render without errors in dev mode

### Task 13: Manual Smoke Test Checklist
- [ ] App loads, WalletConnect modal appears on Step 0
- [ ] EIP-5792 capability detection works (gate or proceed)
- [ ] Scan page fetches tokens from at least 1 chain
- [ ] Token selection correctly classifies sweepable vs uneconomic
- [ ] Review page shows fresh quotes
- [ ] All step transitions work correctly
- [ ] No console errors in production build

---

## Phase 2 — Testing

### Task 14: Test Infrastructure Setup
- [ ] Install Vitest + jsdom + React Testing Library
- [ ] Configure vitest.config.ts for Next.js app
- [ ] Add `test` script to packages/app/package.json

### Task 15: Unit Tests — Chain Config & Atoms
- [ ] Test chain registry: all 9 chains present, valid config shape
- [ ] Test atom state transitions: token selection, destination changes, sweep state machine

### Task 16: Scanner Adapter Tests
- [ ] Unit tests for `BlockscoutScanner` with mocked HTTP responses
- [ ] Unit tests for `EtherscanScanner` with mocked HTTP responses
- [ ] Test error handling: API timeouts, malformed responses, rate limits

### Task 17: Fork Tests — Swap Execution
- [ ] Set up Anvil fork test harness
- [ ] Test LI.FI quote fetching against forked mainnet
- [ ] Test `wallet_sendCalls` batching logic (approve + swap sequence)
- [ ] Test bridge transaction construction

### Task 18: API Route Tests
- [ ] Integration tests for `/api/scan` with mocked scanner adapters
- [ ] Integration tests for `/api/quote` with mocked LI.FI responses
- [ ] Test quote caching (30s TTL) behavior
- [ ] Test error propagation and rate limit handling

---

## Automation Notes

**Automatable from container (no external deps):**
- Tasks 1-6: Cleanup, registry, types, adapters, LI.FI integration, demo mode
- Tasks 12, 14-16, 18: Final cleanup, test setup, unit/integration tests

**Requires external services (blocked for autonomous):**
- Task 7: WalletConnect needs NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
- Tasks 8-11: Full UI wiring needs working wallet connection + API keys
- Task 13: Manual smoke test — requires browser + wallet extension
- Task 17: Fork tests need RPC endpoint for Anvil forking

**Recommended autonomous work order:**
Tasks 1 → 2 → 3 → 4 → 5 → 6 → 14 → 15 → 16 → 18 → 12
Then user provides API keys for Tasks 7-11, 13, 17.
