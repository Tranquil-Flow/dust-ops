# DUST.OPS

## Current public-address planner

**[Open the verified planner](https://dust-ops-planner.vercel.app/)**

The current hosted release accepts a **public EVM address** to inspect holdings, request quotes, simulate an unsigned plan, and review its exact JSON. **Wallet connection and transaction execution are disabled.** It does not transfer funds or provide transaction privacy.

**Never enter a private key, seed phrase, or signing secret.**

### Unsafe legacy deployment

`dust-ops.vercel.app` is an **unsupported legacy deployment**, not the current release. It still exposes private-key entry and is outside the replacement project's administrative control. **Do not use it or enter secrets there.** Removing our links does not disable that site; owner-side containment is still outstanding.

The original hackathon material's private-key instructions, execution claims, and privacy guarantees do not apply to the current planner and must not be treated as safe operating instructions.

## Using the planner

1. Enter a public wallet address.
2. Review the scan's coverage and unavailable/native-only chain disclosures.
3. Select eligible holdings and a destination.
4. Review quotes, simulation status, and the exact unsigned plan.

Execution remains disabled even when simulation succeeds. Provider coverage and quotes can change; a simulation is not a guarantee that a future transaction will succeed.

If a scan is rate-limited, wait 60 seconds, then use **Return to address form** and try again. Avoid automated retry loops. Hosting may pause when its spending threshold is reached.

## Release and source boundaries

The hosted planner was qualified from candidate `0117a9e35a92456341f9bee0b9d6d2f9adddf7d8` in an isolated release checkout. **This README update does not publish that candidate to this default branch or qualify the historical code here for installation or execution.** The hosted release and this branch's source must not be assumed identical.

The planner is not an externally audited wallet-execution product. Physical-wallet operation, transaction execution, cross-chain execution qualification, and execution-tier review remain separate work. Installed dependencies retain documented moderate audit findings; no blanket security or anonymity guarantee is made.

Browser dependency notices are available in the deployed application's footer.

## Project history

DUST.OPS originated as an ETHGlobal Prague 2025 hackathon project. Historical plans and Git history are retained for context, not as current deployment or security guidance.
