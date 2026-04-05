# dust-ops

Cross-chain EVM token sweeper — scans fragmented wallets, consolidates dust into ETH via LI.FI swaps/bridges, delivers to chosen destination chain.

---

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS v4
- DaisyUI v5
- Viem 2
- Wagmi 2
- Reown AppKit (WalletConnect)
- Jotai (global state)
- LI.FI SDK (swaps + bridges)

---

## Architecture

Frontend-orchestrated — no custom smart contracts deployed. All swap and bridge operations are routed through the LI.FI API. Server-side API routes act as proxies for wallet scanning and quote fetching. Batched transaction execution uses EIP-5792 wallet_sendCalls.

---

## Monorepo Structure

Yarn workspaces monorepo. Application code lives in packages/app/.

    dust-ops/
    ├── packages/
    │   └── app/              # Next.js application
    │       └── src/
    │           ├── app/
    │           │   └── (steps)/   # Wizard step pages
    │           ├── components/
    │           │   └── sweeper/   # Sweeper UI components
    │           └── utils/         # Shared utilities
    ├── docs/
    │   └── plans/            # Design and implementation docs
    └── package.json          # Workspace root

### Key Directories

- packages/app/src/app/(steps)/     — Multi-step wizard flow (connect, scan, review, sweep, done)
- packages/app/src/utils/           — Scanner adapters, quote helpers, sweep execution logic
- packages/app/src/components/sweeper/ — All sweeper-specific React components

---

## Design Docs

Full MVP design and implementation plans live in:

- docs/plans/2026-02-19-dust-ops-mvp-design.md
- docs/plans/2026-02-19-dust-ops-mvp-implementation.md

Read these before beginning any significant feature work.

---

## Project Registry

Single source of truth for project management (tasks, status, notes):

    /workspace/Projects/.hermes-planner/registry.json

---

## MVP Target Chains

Ethereum, Base, Optimism, Arbitrum, Polygon, Scroll, Linea, zkSync Era, Unichain

---

## Environment Variables

Create packages/app/.env.local with:

    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=   # Required — get from cloud.reown.com
    NEXT_PUBLIC_LIFI_API_KEY=               # Optional — improves rate limits
    REDIS_CONNSTR=                          # Required for server-side scan/quote caching

---

## Commands

    yarn install        # Install all workspace dependencies
    yarn dev            # Start dev server (packages/app on :3000)
    yarn build          # Production build
    yarn test           # Run test suite

## Running Tests (Agent / Sandbox Environments)

The standard `yarn test` calls vitest from the workspace root but requires
process forking that some sandboxes restrict. Use instead:

    # From the monorepo root (uses root vitest.config.ts with correct @ alias):
    node node_modules/vitest/vitest.mjs run --pool=vmForks --no-file-parallelism

The root `vitest.config.ts` sets up the `@` path alias pointing to
`packages/app/src`, required by scanner and API route tests.

Run commands from the monorepo root unless otherwise noted.

---

## Current State

Hackathon prototype. The existing UI contains a fake/stubbed transaction flow that does not perform real swaps or bridges. The project is currently undergoing an MVP rebuild according to the design docs listed above. Do not treat any existing sweep execution code as production-ready.

---

## Testing

No tests exist yet. When adding tests, prioritize:

1. Scanner adapters (token balance fetching per chain)
2. Quote proxy API routes (LI.FI quote request/response handling)
3. Sweep execution logic (transaction batching, EIP-5792 call construction)

---

## Important Rules

These rules are non-negotiable. Violating them blocks the project from going to production.

1. No private key handling in the browser — ever. Do not store, derive, or transmit private keys client-side.
2. No custom smart contracts. All on-chain logic must go through existing LI.FI contracts.
3. All swaps and bridges must use the LI.FI API. Do not integrate other DEX aggregators or bridge protocols directly.
4. Wallet connection via WalletConnect only (Reown AppKit). Do not add injected wallet connectors or other connection methods unless explicitly approved.
5. EIP-5792 wallet_sendCalls support is required for batched sweep execution. Do not fall back to sequential eth_sendTransaction without a gated fallback path.

---

## Git Workflow

- Never push to remote.
- Commit after each completed task with a clear, descriptive message.
- Keep commits atomic — one logical change per commit.

---

## Demo Mode

Run the app in demo mode for development without external APIs:

    NEXT_PUBLIC_DEMO_MODE=true yarn dev

Or add `?demo=true` to any URL.

Demo mode uses mock scanners and swap providers that return realistic fake data.
All API routes automatically use mock backends when demo mode is active.
