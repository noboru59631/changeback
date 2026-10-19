# ChangeBack — Submission Record

Historical checklist from 2026-10-16. Current submission status and evidence placeholders are in docs/microgrants-submission.md. Testnet E2E is complete; Mainnet deployment, public app, public repository and video remain pending.

**Status:** DRAFT — all deployments and publishing BLOCKED pending explicit approval  
**Date:** 2026-10-16

---

## Project Identity

| Field | Value |
|---|---|
| **Project name** | ChangeBack |
| **Tagline** | A shared wallet that closes itself |
| **Arc Studio project URL** | https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710 |
| **Target chain (testnet)** | Arc Testnet (chain ID 5042002) |
| **Target chain (mainnet)** | Arc Mainnet (chain ID 5042) — requires independent reviewed export, not yet done |
| **Token** | USDC at `0x3600000000000000000000000000000000000000` |

---

## Submission Checklist

The following items must be complete and explicitly approved before any submission or deployment proceeds.

### Contracts
- [x] `ChangeBackVaultBase.sol` — abstract logic, all 8 audit fixes applied
- [x] `ChangeBackVault.sol` — production concrete wrapper, USDC hard-coded, no arbitrary token path
- [x] `ChangeBackFactory.sol` — Arc chain ID enforcement, isVault registry
- [x] `ChangeBackVaultHarness.sol` — test-only, never deployed
- [x] `forge build` passes (warnings only, no errors)
- [x] `forge test` passes: 29/29 tests

### Documentation
- [x] `docs/spec.md` — accurate automation/transaction wording; M-signer collusion disclosed; spendUntil immutability documented; close() predicate correct; Arc EVM differences linked; Arc integration test gap disclosed
- [x] `docs/threat-model.md` — T1 updated for M-signer collusion; trust assumptions updated; Arc EVM note added; deployment status noted
- [x] `docs/validation.md` — test run record (29/29, 2026-10-16)
- [x] `docs/provenance.md` — Studio URL, deployment status, known gaps
- [x] `docs/submission.md` — this file

### Frontend
- [ ] React frontend built (6-step lifecycle UI)
- [ ] Typecheck + lint passing
- [ ] Manual demo walkthrough confirmed

### Deployment (BLOCKED)
- [ ] **Explicit owner approval received**
- [ ] Testnet deployment via Arc Studio (testnet only)
- [ ] Testnet integration tests / smoke test
- [ ] Independent professional audit (recommended before mainnet)
- [ ] Mainnet deployment via independent reviewed export route (outside Arc Studio)

### Publishing (BLOCKED)
- [ ] **Explicit owner approval received**
- [ ] Deploy to hosting (Netlify / HF / Vercel)
- [ ] Public announcement

---

## Deployment Notes (when approved)

- Arc Studio can deploy to **Arc Testnet only**. Use the `deploy_contract` tool or the Contracts panel.
- Mainnet deployment must be performed outside Arc Studio using the exported build artifacts (`contracts/out/`). This requires independent review, a separate wallet with mainnet funds, and the owner's explicit sign-off.
- The factory constructor enforces `block.chainid` — it will revert if deployed to any chain other than Arc Mainnet (5042) or Arc Testnet (5042002).
- USDC address `0x3600000000000000000000000000000000000000` is the same on both Arc networks.

---

## Open Items Before Submission

1. Build and test React frontend (6-step lifecycle UI).
2. Write `docs/demo-script.md`.
3. Confirm studio project URL is correct in all docs (currently: https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710).
4. Receive explicit approval to proceed with testnet deployment and/or publishing.
