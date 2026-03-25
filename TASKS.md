# dust-ops — MVP Tasks

> Single source of truth for automated work sessions.
> Design docs: `docs/plans/2026-02-19-dust-ops-mvp-design.md` and `docs/plans/2026-02-19-dust-ops-mvp-implementation.md`

---

## Phase 1 — Core Implementation

### Task 1: Remove Dead Hackathon Code
- [x] Delete `packages/foundry/` directory (Solidity contracts)
- [x] Delete `lib/` directory (LayerZero/OpenZeppelin submodules)
- [x] Delete `.gitmodules` file
- [x] Delete `ethglobalprague/` submodule reference
- [x] Remove private key flow: `privateKeyAtom`, `usePrivateAccount` hook, private key input in `WalletConnection.tsx`
- [x] Remove `getHoldingsAction.tsx` (Sepolia/Rootstock server action)
- [x] Remove `getQuoteAction.ts` (Uniswap V4 quoting)
- [x] Remove `abis.ts` (65KB contract ABIs)
- [x] Remove privacy deposit page (`privacy-deposit/`) + `SweepProcessing.tsx` animation
- [x] Remove Railgun-related atoms and UI references
- [x] Remove hardcoded gas estimates and ETH price constants
- [x] Remove `examples/` directory (EIP-7702 experiments with leaked env vars)
- [x] Remove debug/test pricing utilities (`debug-pricing.ts`, `test-pricing.ts`, `pricing-comparison.ts`)
- [x] Remove unused dependencies from package.json: `@uniswap/*`, `@privy-io/react-auth`, `siwe`
- [x] Install `@lifi/sdk`
- [x] Verify build still compiles after cleanup

### Task 2: Chain Registry & Types
- [x] Create `src/config/chains.ts` — 9-chain registry (Ethereum, Base, Optimism, Arbitrum, Polygon, Scroll, Linea, zkSync Era, Unichain) with explorer API configs, LI.FI chain keys, gas tiers
- [x] Create `src/config/types.ts` — `ScannedToken`, `SweepPlan`, `SweepState`, `Quote`, `ChainConfig` types
- [x] Wire chain config into `network.ts` (replace hardcoded 3-chain list)

### Task 3: State Atoms
- [x] Replace `privateKeyAtom` / `railgunAddressAtom` with new sweep atoms: `scannedTokensAtom`, `selectedTokensAtom`, `sweepPlansAtom`, `sweepStateAtom`, `destinationAtom`
- [x] Remove stale atom references across components

### Task 4: Scanner Adapters
- [x] Create `ChainScanner` interface: `fetchTokenBalances(address: string): Promise<TokenBalance[]>`
- [x] Implement `BlockscoutScanner` (for Base, Optimism, Unichain, Scroll)
- [x] Implement `EtherscanScanner` (for Ethereum, Arbitrum, Polygon, Linea, zkSync Era)
- [x] Create `/api/scan` server-side route — parallel multi-chain scan with price discovery
- [x] Add gas viability classification per token (sweepable / uneconomic / no-route)

### Task 5: LI.FI Integration
- [x] Create `SwapProvider` interface: `getSwapQuote()`, `getBridgeQuote()`, `getStatus()`
- [x] Implement `LiFiProvider` using `@lifi/sdk`
- [x] Create `/api/quote` route — LI.FI quote proxy with 30s TTL caching
- [x] Create `/api/status` route — transaction/bridge status polling proxy

### Task 6: Demo / Testnet Mode
- [x] Create `src/config/demo.ts` — feature flag (`NEXT_PUBLIC_DEMO_MODE=true`) to toggle demo mode
- [x] Create `MockScanner` adapter — returns realistic fake token balances across multiple chains (mix of sweepable, uneconomic, and no-route tokens)
- [x] Create `MockSwapProvider` — returns fake LI.FI quotes with realistic gas estimates and simulated 2-3s execution delays
- [x] Create mock wallet hook — simulates `wallet_sendCalls` and `wallet_getCallsStatus` without a real wallet connection
- [x] Wire demo mode into scan/quote/status API routes — when flag is set, return mock data instead of calling external APIs
- [x] Wire demo mode into wallet connection — skip WalletConnect, auto-connect with a demo address
- [x] Add visible "DEMO MODE" banner in the UI header when active
- [x] Ensure full wizard flow works end-to-end in demo mode: connect → scan → select → review → execute → complete
- [x] Document demo mode setup in CLAUDE.md

### Task 7: Wallet Connection (WalletConnect)
- [x] Replace private key input with Reown AppKit WalletConnect modal in Step 0 (was already done in Task 1 cleanup — AppKit w3m-button already wired)
- [x] Create `useWalletCapabilities` hook — detect `wallet_sendCalls` (EIP-5792) support
- [x] Gate progress: if wallet lacks EIP-5792, show recommendation for Ambire/MetaMask 12+/Coinbase Wallet
- [x] Optional Ambire promotion banner for non-Ambire EIP-5792 wallets

### Task 8: Scan Holdings Page Rewrite
- [ ] Wire scan-holdings page to new `/api/scan` route  <!-- BLOCKED: requires Task 7 -->
- [ ] Show real-time parallel scan progress across 9 chains  <!-- BLOCKED: requires Task 7 -->
- [ ] Display token counts + values as they stream in  <!-- BLOCKED: requires Task 7 -->
- [ ] Auto-advance to token selection when scan completes  <!-- BLOCKED: requires Task 7 -->

### Task 9: Token Selection Page Rewrite
- [ ] Wire to scanned token data from atoms  <!-- BLOCKED: requires Task 8 -->
- [ ] Add gas viability indicators: sweepable (selectable), uneconomic (greyed, "gas > value"), no-route (greyed, "no liquidity")  <!-- BLOCKED: requires Task 8 -->
- [ ] Add destination chain dropdown (9 chains)  <!-- BLOCKED: requires Task 8 -->
- [ ] Add destination address input (defaults to connected wallet)  <!-- BLOCKED: requires Task 8 -->
- [ ] Show total estimated value + gas + net proceeds  <!-- BLOCKED: requires Task 8 -->

### Task 10: Review & Execute — useSweep Hook
- [ ] Create `useSweep` hook — orchestrate full sweep execution  <!-- BLOCKED: requires Task 9 -->
- [ ] Fetch fresh LI.FI quotes just-in-time on review page load  <!-- BLOCKED: requires Task 9 -->
- [ ] Show execution plan breakdown: per-token value, gas cost, net proceeds  <!-- BLOCKED: requires Task 9 -->
- [ ] Implement per-chain `wallet_sendCalls` batching: [approve + swap] × N per chain  <!-- BLOCKED: requires Task 9 -->
- [ ] Implement cross-chain bridge calls via LI.FI after same-chain swaps complete  <!-- BLOCKED: requires Task 9 -->
- [ ] Real-time progress UI replacing fake animation (chain-by-chain status)  <!-- BLOCKED: requires Task 9 -->
- [ ] Poll `wallet_getCallsStatus()` and LI.FI `/status` for completion tracking  <!-- BLOCKED: requires Task 9 -->

### Task 11: Completion Page Simplification
- [ ] Show real sweep results: total ETH swept, destination chain, destination address  <!-- BLOCKED: requires Task 10 -->
- [ ] Link to block explorer for destination address  <!-- BLOCKED: requires Task 10 -->
- [ ] "Start New Sweep" button (reset atoms, return to Step 0)  <!-- BLOCKED: requires Task 10 -->
- [ ] Remove fake Railgun countdown timer  <!-- BLOCKED: requires Task 10 -->

### Task 12: Final Cleanup & Build Verification
- [x] Update page metadata and titles
- [x] Remove any remaining TODO/FIXME comments referencing hackathon
- [x] Verify `yarn build` compiles cleanly
- [ ] Verify all pages render without errors in dev mode  <!-- BLOCKED: requires browser + manual testing -->

### Task 13: Manual Smoke Test Checklist
- [ ] App loads, WalletConnect modal appears on Step 0  <!-- BLOCKED: requires browser + WALLETCONNECT_PROJECT_ID -->
- [ ] EIP-5792 capability detection works (gate or proceed)  <!-- BLOCKED: requires browser + wallet extension -->
- [ ] Scan page fetches tokens from at least 1 chain  <!-- BLOCKED: requires browser + API keys -->
- [ ] Token selection correctly classifies sweepable vs uneconomic  <!-- BLOCKED: requires browser + API keys -->
- [ ] Review page shows fresh quotes  <!-- BLOCKED: requires browser + API keys -->
- [ ] All step transitions work correctly  <!-- BLOCKED: requires browser -->
- [ ] No console errors in production build  <!-- BLOCKED: requires browser -->

---

## Phase 2 — Testing

### Task 14: Test Infrastructure Setup
- [x] Install Vitest + jsdom + React Testing Library
- [x] Configure vitest.config.ts for Next.js app
- [x] Add `test` script to packages/app/package.json

### Task 15: Unit Tests — Chain Config & Atoms
- [x] Test chain registry: all 9 chains present, valid config shape
- [x] Test atom state transitions: token selection, destination changes, sweep state machine

### Task 16: Scanner Adapter Tests
- [x] Unit tests for `BlockscoutScanner` with mocked HTTP responses
- [x] Unit tests for `EtherscanScanner` with mocked HTTP responses
- [x] Test error handling: API timeouts, malformed responses, rate limits

### Task 17: Fork Tests — Swap Execution
- [ ] Set up Anvil fork test harness  <!-- BLOCKED: requires RPC endpoint -->
- [ ] Test LI.FI quote fetching against forked mainnet  <!-- BLOCKED: requires RPC endpoint -->
- [ ] Test `wallet_sendCalls` batching logic (approve + swap sequence)  <!-- BLOCKED: requires RPC endpoint -->
- [ ] Test bridge transaction construction  <!-- BLOCKED: requires RPC endpoint -->

### Task 18: API Route Tests
- [x] Integration tests for `/api/scan` with mocked scanner adapters
- [x] Integration tests for `/api/quote` with mocked LI.FI responses
- [x] Test quote caching (30s TTL) behavior
- [x] Test error propagation and rate limit handling

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
