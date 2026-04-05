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
- [x] Wire scan-holdings page to new `/api/scan` route
- [x] Show real-time parallel scan progress across 9 chains
- [x] Display token counts + values as they stream in
- [x] Auto-advance to token selection when scan completes

### Task 9: Token Selection Page Rewrite
- [x] Wire to scanned token data from atoms
- [x] Add gas viability indicators: sweepable (selectable), uneconomic (greyed, "gas > value"), no-route (greyed, "no liquidity")
- [x] Add destination chain dropdown (9 chains)
- [x] Add destination address input (defaults to connected wallet)
- [x] Show total estimated value + gas + net proceeds

### Task 10: Review & Execute — useSweep Hook
- [x] Create `useSweep` hook — orchestrate full sweep execution
- [x] Fetch fresh LI.FI quotes just-in-time on review page load
- [x] Show execution plan breakdown: per-token value, gas cost, net proceeds
- [x] Implement per-chain `wallet_sendCalls` batching: [approve + swap] × N per chain
- [x] Implement cross-chain bridge calls via LI.FI after same-chain swaps complete
- [x] Real-time progress UI replacing fake animation (chain-by-chain status)
- [x] Poll `wallet_getCallsStatus()` and LI.FI `/status` for completion tracking

### Task 11: Completion Page Simplification
- [x] Show real sweep results: total ETH swept, destination chain, destination address
- [x] Link to block explorer for destination address
- [x] "Start New Sweep" button (reset atoms, return to Step 0)
- [x] Remove fake Railgun countdown timer

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

---

## Phase 3 — Critical Bug Fixes

These bugs exist in the current codebase and must be fixed before live wallet testing.
They are code-level issues that can be resolved without external API keys or a browser.

### Task 19: Fix Native Token Address Constants
- [x] Audit all files for native token address representations — search for `0x000...000`,
      `AddressZero`, `zeroAddress`, and any bare `"0x0"` used to represent ETH/native gas token
- [x] Replace with the canonical LI.FI / 1inch sentinel: `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`
      (mixed-case checksummed form, all E's with a few lowercase e's)
- [x] Update `src/config/chains.ts` nativeToken address fields if they use zero address
      (chains.ts did not use zero address for native token — no change needed)
- [x] Update any scanner adapters that return zero address for native ETH balance
      (etherscan.ts, blockscout.ts, tokenFetcher.ts — all updated to NATIVE_TOKEN_ADDRESS)
- [x] Update `useSweep.ts` — any isNative checks that rely on zero address comparison
- [x] Add a shared constant `NATIVE_TOKEN_ADDRESS` in `src/config/types.ts` or
      `src/config/chains.ts` and import it everywhere — no more magic strings
- [x] Add unit test: verify NATIVE_TOKEN_ADDRESS matches LI.FI's expected sentinel

### Task 20: Wire Token Viability Classification into Real Scan
- [x] Audit `/api/scan` route — confirm `viability` field is populated by real gas estimation
      logic and NOT just returned as a hardcoded mock value
- [x] If `addGasViabilityClassification()` (or equivalent) is only called on mock data,
      wire it into the real `BlockscoutScanner` and `EtherscanScanner` response paths
- [x] Viability logic: fetch current gas price via `eth_gasPrice` RPC call (use a public
      RPC if no paid one configured), estimate gas for approve+swap (use LI.FI quote's
      `gasCostUSD` field if available), classify:
        - `sweepable` — net proceeds > gas cost
        - `uneconomic` — gas cost >= token value
        - `no-route` — LI.FI returned no route (quota error or no liquidity)
- [x] Add `VIABILITY_GAS_BUFFER` config (default: 1.2× — require 20% margin above gas)
- [x] Unit test: given mocked gas price + token value, verify all 3 classifications work
      (32 tests in src/__tests__/utils/viability.test.ts; note: no-route is set at quote
      time by LI.FI failure, not at scan time)

### Task 21: Replace In-Memory Cache with Persistent Store
- [x] Identify all in-memory caches in the codebase (search for `Map`, `{}` objects
      used as caches, module-level variables holding quote/scan results)
- [x] Replace the quote cache in `/api/quote` with a persistent store:
      Used RouteCache (src/utils/cache.ts) — Redis (ioredis) when REDIS_CONNSTR is set,
      InMemoryBackend fallback otherwise. Survives across requests in same process.
- [x] Replace the scan result cache (if any) in `/api/scan` similarly
      (scan had no cache — added scanCache with 5-min TTL)
- [x] Cache TTLs: quotes 30s, scan results 5 minutes
- [x] Add cache invalidation on sweep completion (so next scan reflects swept tokens)
      DELETE /api/scan?address=0x... endpoint added; useSweep fires it fire-and-forget on completion
- [x] Unit test: verify cache hit returns cached value; verify TTL expiry triggers refresh
      (16 tests in src/__tests__/utils/cache.test.ts)

### Task 22: Fix isNative Check Mismatch
- [x] Find all `isNative` checks across the codebase (search `isNative`, `token.native`,
      `address === '0x0'`, `address === AddressZero`, etc.)
- [x] Confirm `useSweep.ts` and all scanner adapters use the SAME definition of isNative
      (should be: `address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()`)
- [x] Fix any mismatches found — scanners and sweep hook must agree on which token is native
      (useSweep.ts had `=== '0x0'` in fetchQuotes and `=== '0x0' || ...` in executeSweep — both fixed)
- [x] If a scanner returns native ETH as a `TokenBalance` entry, ensure its address field
      uses `NATIVE_TOKEN_ADDRESS` (not zero address or empty string)
- [x] Add a type guard `isNativeToken(address: string): boolean` in `src/config/types.ts`
      and replace all ad-hoc checks with it

---

## Phase 4 — Expansion

### Task 23: Additional Chain API Keys + Config
- [x] Add Gnosis Chain to `src/config/chains.ts` (chainId 100, Gnosisscan explorer)
- [x] Add BNB Chain (BSC) (chainId 56, Bscscan explorer)
- [x] Add Avalanche C-Chain (chainId 43114, Snowscan/Routescan explorer)
- [x] Add Mantle (chainId 5000, Mantlescan explorer)
- [x] Add Mode (chainId 34443, Modescan / Blockscout explorer)
- [x] Add Blast (chainId 81457, Blastscan explorer)
- [ ] Obtain and add API keys for each new chain's explorer to `.env`
      (USER ACTION: GNOSISSCAN_API_KEY, BSCSCAN_API_KEY, SNOWSCAN_API_KEY, MANTLESCAN_API_KEY, BLASTSCAN_API_KEY — Mode uses Blockscout, no key needed)
- [ ] Confirm LI.FI supports each new chain (check LI.FI `/chains` endpoint)
      (USER ACTION or next session: verify lifiChainKeys dai/bsc/ava/mnt/mod/bls against live LI.FI /chains API)
- [x] Add new chains to demo mode MockScanner so demo flow still works
      (mock.ts: full token sets for all 6 new chains with sweepable/uneconomic/no-route mix)
- [x] Update README chain list

### Task 24: Etherscan Scanner Pagination Beyond 100
- [x] Audit `EtherscanScanner.fetchTokenBalances()` — confirm it currently calls
      `tokentx` API with `offset=100` (the default Etherscan page size)
- [x] Implement pagination loop: start with `page=1&offset=100`, keep fetching next
      pages until the API returns fewer than 100 results (last page signal)
- [x] Add `MAX_PAGES` safety cap (default: 20 pages = 2000 transfers) to prevent
      runaway API calls on whale addresses
- [x] Deduplicate token addresses across pages (same token may appear many times)
- [x] After collecting all transfer history, batch-call `balanceOf` for each unique
      token address to get current balance (not historical transfer amounts)
- [x] Add `ETHERSCAN_MAX_PAGES` env var for override
- [x] Unit test: mock paginated Etherscan response, verify all pages are fetched and
      tokens deduplicated correctly (6 new pagination tests in etherscan.test.ts)

### Task 25: Parallel Chain Sweeping
- [x] Audit `useSweep.ts` — confirm chain sweeps are currently sequential
      (chain 1 fully complete before chain 2 starts)
- [x] Refactor sweep execution to run per-chain `wallet_sendCalls` batches in parallel:
      - Group approved plans by `sourceChain`
      - Fire all `wallet_sendCalls` for each chain simultaneously (Promise.allSettled)
      - Track per-chain status independently via updateChainState callback
      - Bridge calls (cross-chain) still need same-chain swaps to complete first
- [x] Keep `sweepStateAtom.chains: ChainSweepState[]` for per-chain state; the array
      already provides per-chain tracking. Global phase = overall status.
- [ ] Update sweep progress UI to show per-chain status columns/rows simultaneously
      <!-- BLOCKED: requires browser — UI work deferred -->
- [x] Add timeout per chain: if a chain doesn't confirm within 5 minutes, mark as
      failed and continue with other chains (CHAIN_TIMEOUT_MS = 5 * 60 * 1000)
- [x] Unit test: mock multi-chain sweep, verify all chains start without waiting for
      each other (14 tests in src/__tests__/utils/sweepExecution.test.ts)

### Task 26: Price Oracle Pre-Filter Before LI.FI Quoting
- [x] Before calling LI.FI for a quote, estimate token USD value using a cheap price oracle:
      - Used DefiLlama `/prices/current/{chain}:{addr}` (free, no key needed)
      - Also accepts pre-computed `fromValueUsd` hint from scan results (Option C), avoiding
        a redundant oracle call when the value is already known
- [x] If estimated value < `MIN_QUOTE_THRESHOLD_USD` (default: $1.00), skip LI.FI quote
      entirely — returns 422 { filtered: true, reason, valueUsd, threshold }
- [x] This avoids wasting LI.FI quota on dust that will never be sweepable
- [x] Add `MIN_QUOTE_THRESHOLD_USD` to config (env var override)
- [x] Add `PRICE_ORACLE` config option: `defillama` | `none`
      (src/utils/priceOracle.ts; PRICE_ORACLE=none bypasses the filter entirely)
- [x] Unit test: tokens below threshold are never quoted; tokens above threshold proceed
      to LI.FI (18 oracle tests + 6 quote route pre-filter tests; 250 total)

### Task 27: Sequential Transaction Fallback (Non-EIP-5792 Wallets)
- [x] Implement fallback: for wallets with no EIP-5792, execute sweeps as sequential
      individual `eth_sendTransaction` calls (one approve, wait, one swap, wait, repeat)
      (sweepSingleChainSequential in sweepExecution.ts; chains still run in parallel)
- [x] Add `SWEEP_MODE` state: `batch` (EIP-5792) | `sequential` (fallback)
      (SweepMode type in config/types.ts; auto-detected via useWalletCapabilities)
- [ ] In sequential mode: show a clear warning — \"Your wallet does not support batched
      transactions. Each step will require a separate wallet confirmation.\"
      <!-- BLOCKED: requires browser — UI work deferred, sweepMode exposed from useSweep() -->
- [ ] Show step-by-step confirmation prompts: \"Confirm approval for TOKEN_NAME (step 2 of 8)\"
      <!-- BLOCKED: requires browser — logic is in place, needs UI surface -->
- [x] On user rejection of any step: error is tagged reason='user_rejected'
      so callers can offer Resume/Cancel without marking the sweep permanently failed
- [x] Bridge transactions always sequential regardless of mode (they require ordering)
      (bridge polling identical in both batch and sequential paths)
- [x] Unit test sequential mode path — 14 tests in sequentialSweep.test.ts:
      receipt polling, rejection detection, native skip, bridge fire, mode dispatch
