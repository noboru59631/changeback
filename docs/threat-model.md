# ChangeBack — Threat Model v1.0

**Date:** 2026-10-16  
**Scope:** `ChangeBackFactory` + `ChangeBackVault` on Arc (chain IDs 5042 / 5042002)  
**Methodology:** STRIDE categories mapped to contract surface, ordered by severity

---

## Assets at Risk

| Asset | Description |
|---|---|
| **Vault principal (C)** | USDC deposited by participants; must only be spent via approved proposals or returned to original depositors |
| **Entitlements** | Each participant's immutable proportional share of R; must not be diluted, front-run, or redirected |
| **Liveness** | Participants must eventually be able to claim their entitlement regardless of other participants' actions |
| **Accuracy** | `totalSpent + totalRefunded + remainingLiability == C` must hold after finalization |

---

## Trust Assumptions

1. **ERC-20 token contract** (USDC at `0x3600...`): assumed non-malicious, correct transfer semantics, 6-decimal ERC-20 interface. The USDC issuer (Circle) may blocklist addresses.
2. **Participants**: each knows their own address and can submit transactions. No off-chain coordination is required for refunds (anyone can call `claimFor`). However, the contract does **not** execute refunds automatically — someone must submit each transaction.
3. **Quorum (M-of-N)**: the contract does not protect participants from each other beyond the threshold requirement. A quorum can spend all funds. This is the intended design.
4. **Guardian**: one of the participants; trusted to pause responsibly but acknowledged as a griefing vector.
5. **Arc chain**: assumed liveness; extended network outage is a residual risk.
6. **OpenZeppelin 5.1.0**: audited, pinned. Identified no Cancun-opcode use at this version.
7. **Arc EVM compatibility**: This contract targets Paris bytecode (conservative), compatible with the Arc Osaka chain baseline. See https://docs.arc.io/integrate/evm-differences for Arc-specific EVM differences. Forge unit tests do not cover Arc-specific precompiles or the address blocklist.

---

## Threat Table

### T1 — Fund Theft via Malicious Proposal Destination (M-signer collusion)

| | |
|---|---|
| **Category** | Elevation of Privilege / Tampering |
| **Vector** | Any group of ≥ `threshold` participants approves a proposal whose `destination` they control |
| **Impact** | USDC drained up to the remaining accounting balance |
| **Mitigations** | Destination is immutable post-proposal; no admin path; factory has no access; no delegatecall; UI shows full destination + amount before each approval |
| **Residual risk** | **This is the primary trust assumption of the system.** Any quorum of `threshold` signers can authorize any payment. This is the intended shared-budget design. The contract does **not** protect participants from the quorum itself — it only protects against sub-threshold actors. Participants must choose co-signers they trust. |

### T2 — Reentrancy via Token Callback

| | |
|---|---|
| **Category** | Tampering |
| **Vector** | Malicious ERC-20 token calls back into vault during `execute` or `claimFor` |
| **Impact** | Double-spend of vault funds |
| **Mitigations** | `ReentrancyGuard` on `deposit`, `execute`, `claimFor`; CEI pattern: state debited before external call; `executed = true` set before `safeTransfer`; production vault hard-codes USDC (not injectable) |
| **Residual risk** | None for production vault (USDC is non-reentrant). Mock tests exercise this path explicitly. |

### T3 — Fee-on-Transfer Token Inflation

| | |
|---|---|
| **Category** | Tampering |
| **Vector** | A token that charges a fee on transfer would credit less than `amount`, inflating the accounting balance above actual token balance |
| **Impact** | Later claims could fail (insufficient actual balance) |
| **Mitigations** | Delta-check in `deposit`: `actual = balanceAfter − balanceBefore`; revert if `actual != amount` |
| **Residual risk** | None for USDC (no fee). Revert on any fee-on-transfer attempt. |

### T4 — Unsolicited Transfer Inflation of Entitlements

| | |
|---|---|
| **Category** | Tampering |
| **Vector** | Attacker sends USDC directly to vault address to inflate `R` and steal a larger-than-entitled share |
| **Impact** | Entitlement dilution or last-claimer bonus |
| **Mitigations** | `R = totalContributions − totalSpent` is derived from the accounting ledger, **never from `balanceOf`**; unsolicited transfers are not counted; stranded surplus stays unreachable in v1 |
| **Residual risk** | None for entitlement math. Stranded surplus is permanently locked (acknowledged limitation). |

### T5 — Duplicate Vote / Vote Replay

| | |
|---|---|
| **Category** | Tampering |
| **Vector** | Same participant votes twice, or off-chain signature replayed |
| **Impact** | Approval count inflated; proposal executes below real threshold |
| **Mitigations** | `voted[msg.sender]` mapping per proposal; `msg.sender` is the signer (no off-chain sig); revert on second vote |
| **Residual risk** | None. |

### T6 — Proposal Destination / Amount Mutation

| | |
|---|---|
| **Category** | Tampering |
| **Vector** | Proposal fields changed after signers approved |
| **Impact** | Funds sent to wrong address / wrong amount |
| **Mitigations** | Proposal struct is written once at `proposePayment` and never modified; all fields are immutable post-creation |
| **Residual risk** | None. |

### T7 — Guardian Griefing (Pause Abuse)

| | |
|---|---|
| **Category** | Denial of Service |
| **Vector** | Guardian pauses vault to cancel all spending, then sits out |
| **Impact** | Team can't execute approved payments |
| **Mitigations** | After `pausedAt + 24h` anyone can call `finalize()` → Returning phase; all contributions refunded proportionally; guardian **cannot seize funds** |
| **Residual risk** | Guardian can effectively cancel the budget. Disclosed. Participants choose their guardian at creation. |

### T8 — Last-Claimer Dust / Claim-Order Dependency

| | |
|---|---|
| **Category** | Tampering / Fairness |
| **Vector** | Rounding favors early or late claimers |
| **Impact** | One participant gets more or less than their fair share |
| **Mitigations** | Telescoping floor-division formula guarantees `sum(entitlements) == R` exactly; each entitlement differs from exact share by < 1 micro-USDC; claim amounts are precomputed and fixed, not derived incrementally |
| **Residual risk** | None by design. |

### T9 — Competing Proposal Fund Exhaustion

| | |
|---|---|
| **Category** | Tampering |
| **Vector** | Two proposals both reach threshold; second executor finds insufficient accounting balance |
| **Impact** | Second `execute` reverts (correct behavior) |
| **Mitigations** | `execute` checks `C − S − amount >= 0` before transfer; reverts on insufficient funds; approvals are not reservations — this is disclosed in the UI |
| **Residual risk** | None — revert is the correct outcome. UI warns users. |

### T10 — Blocked Participant Prevents Close

| | |
|---|---|
| **Category** | Denial of Service |
| **Vector** | A participant whose USDC address is blocklisted cannot receive their claim, so `totalRemainingLiability` never reaches 0 |
| **Impact** | `close()` permanently blocked |
| **Mitigations** | Each claim is individual; a failing claim only affects that participant. However, `close()` requires all liabilities settled — a blocklisted participant's claim will always revert. This is a known limitation (USDC issuer risk). |
| **Residual risk** | Blocklisted participant permanently prevents `close()`. Their entitlement is permanently locked. Only USDC Circle governance can remediate. Disclosed. |
| **Note** | Zero-entitlement participants are skipped (no transfer attempt), so they do not block close. |

### T11 — Phase Confusion / Timestamp Manipulation

| | |
|---|---|
| **Category** | Tampering |
| **Vector** | Miner / validator adjusts `block.timestamp` to enable operations outside the correct phase |
| **Impact** | Deposits after collection, spending after spendUntil |
| **Mitigations** | `block.timestamp` manipulation on Arc PoA / consensus chain is bounded (typically ±15s); deadlines are minutes/hours/days in scale; not a significant practical risk |
| **Residual risk** | A single-block window around exact deadlines. Disclosed. Callers racing the deadline accept this ambiguity. |

### T12 — Factory Registry Spoofing

| | |
|---|---|
| **Category** | Spoofing |
| **Vector** | Attacker deploys a counterfeit vault at a similar address and presents it as a ChangeBack vault |
| **Impact** | Users interact with malicious vault |
| **Mitigations** | `Factory.isVault[address]` registry checked by UI before displaying any vault; UI shows factory address prominently; users can verify the factory bytecode |
| **Residual risk** | Users who bypass the UI and interact directly accept this risk. |

### T13 — Constructor Griefing / Invalid Vault

| | |
|---|---|
| **Category** | Denial of Service |
| **Vector** | Attacker creates a vault with impossible parameters to waste gas |
| **Impact** | No fund loss; wasted gas |
| **Mitigations** | Constructor reverts immediately on invalid params; no side effects before the first successful construction |
| **Residual risk** | None economically. |

### T14 — No `msg.value` / Native Token Confusion

| | |
|---|---|
| **Category** | Tampering |
| **Vector** | User accidentally sends native USDC (18-decimal) as `msg.value` to the vault |
| **Impact** | On Arc, native USDC sent as `msg.value` to a contract without a `receive()` reverts |
| **Mitigations** | Vault has no `receive()` or `fallback()` — all native-value calls revert. UI uses only ERC-20 path. |
| **Residual risk** | None — revert protects the user. |

---

## Residual Risks (Accepted)

| Risk | Severity | Mitigation | Accepted Because |
|---|---|---|---|
| ≥ threshold signers collude to spend | **High** | Threshold ≥ 2; UI shows destination before each approval | Intended design; social contract; cannot be prevented on-chain |
| No automatic refund execution | Medium | Anyone can call `finalize()` / `claimFor()`; no expiry on claims | No keeper provided; participants or third parties submit transactions |
| Guardian cancels budget | Medium | 24h escape hatch → Returning phase; full refund available | No contract solution without new griefing vectors |
| USDC issuer blocklists a participant | Low | Other participants unaffected; their claim reverts in isolation | External governance risk; out of scope |
| USDC issuer freezes the vault contract | Critical | No mitigation possible | External governance risk; out of scope |
| Block timestamp skew at deadline | Low | Bounded by consensus; deadlines are coarse | Practical risk negligible |
| Stranded surplus locked forever | Low | Disclosed; no recovery function in v1 | No safe permissionless recovery without new attack surface |
| Blocklisted participant blocks `close()` | Low | Zero-entitlement participants skip transfer | Rare; USDC governance resolves |
| Extended Arc network outage | Low | Time-locked deadlines are generous (≤90 days) | Chain liveness assumption; standard for L1 |
| Arc precompile/blocklist behavior untested | Low | Paris bytecode target; no precompile calls; ERC-20 only | Forge unit tests are sufficient for contract logic; Arc-specific integration tests are a known gap |

---

## What This Contract Does NOT Prevent

1. **Social engineering of signers.** A malicious proposal can be created by any participant; threshold signers decide.
2. **Regulatory action against USDC.** Circle's USDC is a regulated asset; issuer actions supersede contract logic.
3. **Front-running of execute calls.** Two callers racing to execute the same proposal; the second reverts cleanly.
4. **Sybil attacks.** Participant set is fixed at creation; sybils must be admitted at vault creation time.

---

## Security Review Status

This contract has NOT been independently audited by a third party. The Arc Studio internal review (balanced severity) covers critical and high findings only. An independent professional audit is strongly recommended before mainnet deployment with significant funds.

**Deployment status:** All deployments are BLOCKED pending explicit approval. Arc Studio deploys to testnet only; any mainnet deployment requires an independent reviewed export route outside Arc Studio, per https://docs.arc.io/ai/arc-studio. The Studio build provenance URL is https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710.
