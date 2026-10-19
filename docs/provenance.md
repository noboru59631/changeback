# Build Provenance

Historical record from 2026-10-16. Superseded for current release status by README.md and docs/mainnet-review.md. A local export now exists, testnet E2E is complete, and targeted frontend fixes were prepared outside Studio on 2026-10-19. Reconciliation with the latest Studio state is pending. Statements below about no exports or deployments describe the original historical state only.

**Studio project URL:** https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710  
**Builder GitHub:** https://github.com/noboru59631  
**Proposed repo:** noboru59631/changeback — NOT created or pushed yet (requires later confirmation)  
**Date:** 2026-10-16

---

## Origin

All source code in this project was generated inside Arc Studio (Circle's hosted builder environment). No code was written or committed outside this sandbox. The sandbox is the authoritative source; no local clone has been made.

## Source file inventory

### Contracts (Solidity)

| File | Description |
|------|-------------|
| contracts/ChangeBackVaultBase.sol | Abstract vault logic (all state, proposals, claims) |
| contracts/ChangeBackVault.sol | Production concrete wrapper — hard-coded Arc USDC, Arc chain guard |
| contracts/ChangeBackFactory.sol | Factory — deploys ChangeBackVault, records isVault registry, Arc chain guard |
| contracts/test/ChangeBackVaultHarness.sol | Test-only harness — injects MockERC20, no chain guard |
| contracts/test/MockERC20.sol | Test mock — fee-on-transfer, blocked-recipient, reentrancy injection |
| contracts/test/ChangeBackVault.t.sol | Regression tests (29) — 8 audit fixes |
| contracts/test/ChangeBackVaultFull.t.sol | Full test suite (54) — fuzz, adversarial, boundaries |

### Frontend (TypeScript / React)

| File | Description |
|------|-------------|
| src/App.tsx | Application shell — config panel, demo view, chain selection, factory trust |
| src/lib/abi.ts | **Generated** from forge artifacts by scripts/generate-abi.ts |
| src/lib/constants.ts | Chain config (testnet + mainnet), phase enums |
| src/lib/format.ts | parseUsdc (strict), formatUsdc6dp (exact), formatUsdc (2dp display) |
| src/lib/format.test.ts | 41 bun:test unit tests for format.ts |
| src/lib/errors.ts | Error parsing helpers |
| src/components/ChainGate.tsx | Wallet + chain gate (Arc Testnet + Mainnet) |
| src/components/StepRail.tsx | Six-step lifecycle rail |
| src/components/VaultCard.tsx | Read-only vault status card |
| src/components/StepCreate.tsx | Step 1 — Create vault via factory |
| src/components/StepCollect.tsx | Step 2 — Deposit USDC |
| src/components/StepApproveSpend.tsx | Steps 3+4 — Propose, approve, execute payments; early return |
| src/components/StepReturn.tsx | Step 5 — Finalize + claimFor |
| src/components/StepClose.tsx | Step 6 — Close vault |
| src/components/DemoView.tsx | Read-only design preview (no wallet, no transactions) |
| src/components/TxButton.tsx | Transaction button (pending/confirming states) |
| scripts/generate-abi.ts | ABI generation script (reads forge artifacts, writes src/lib/abi.ts) |

### Documentation

| File | Description |
|------|-------------|
| docs/spec.md | Functional specification |
| docs/threat-model.md | Security threat model |
| docs/validation.md | Test results, exit codes, known gaps |
| docs/provenance.md | This file |
| docs/submission.md | Submission checklist |
| docs/demo-script.md | 60–90s walkthrough script |

---

## What is NOT in this build

- No deployed contract addresses (testnet or mainnet)
- No transaction hashes
- No mainnet evidence of any kind
- No private keys or secrets
- No GitHub repository (not yet created)
- No public hosting deployment

All deployment, publication, and GitHub push steps are BLOCKED pending explicit user approval.

---

## Arc Studio disclosure

Per https://docs.arc.io/ai/arc-studio, Arc Studio deploys to testnet only within the Studio environment. Mainnet deployment requires exporting the reviewed code and deploying from the user's own wallet and toolchain outside of Arc Studio.

The factory and vault contracts target Arc Testnet (chainId 5042002) and Arc Mainnet (chainId 5042). The EVM baseline is Osaka; the bytecode target is Paris (conservative, compatible).
