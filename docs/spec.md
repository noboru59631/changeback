# ChangeBack — Technical Specification v1.0

**Project:** ChangeBack  
**Tagline:** A shared wallet that closes itself  
**Date:** 2026-10-16  
**Status:** Pre-deployment review draft — all deployments and publishing BLOCKED pending explicit approval  
**Chain target:** Arc Testnet (chain ID 5042002) / Arc Mainnet (chain ID 5042)  
**Token:** USDC ERC-20 at `0x3600000000000000000000000000000000000000` (6 decimals on both networks)  
**Arc EVM target:** Osaka chain baseline; Paris bytecode target (conservative compatible default)  
**Studio build provenance:** https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710

---

## 1. Purpose

ChangeBack creates temporary, self-closing shared budgets for overseas Web3 communities and international hackathon teams (2–20 participants). Team members contribute USDC, approve expenditures by on-chain quorum vote, and receive back their proportional share of unspent funds once the spending window ends.

The primary differentiator from a general multisig is the **finite funding/spending lifecycle with immutable contribution-based return entitlements**. ChangeBack is not a debt ledger, a perpetual treasury, or a token-gated wallet.

**Important accuracy note:** ChangeBack does not operate autonomously. The spending eligibility window ends when `block.timestamp` reaches `spendUntil` (or the `earlyReturnExecuted` flag is set). After that, anyone may submit an external transaction to call `finalize()` and then individual `claimFor(participant)` transactions — each of which requires gas and an active caller. No keeper, relayer, or automation service is provided; participants (or any third party) are responsible for submitting these transactions. The contract guarantees correctness of the math and that no admin can redirect funds; it does not guarantee automatic execution without human action.

---

## 2. Actors and Roles

| Actor | Description |
|---|---|
| **Factory deployer** | Deploys `ChangeBackFactory`. Has no privileged access to individual vaults. |
| **Creator** | Any address that calls `Factory.createVault(...)`. Becomes a participant and optionally the guardian. |
| **Participant** | One of 2–20 fixed addresses registered at vault creation. May deposit, propose, vote, execute, and claim. |
| **Guardian** | One designated participant (immutable). Can pause the vault (Collect/Approve/Spend blocked) but **cannot withdraw, redirect funds, or cancel refunds**. |
| **Anyone** | Can call `finalize()`, `claimFor(participant)`, and `close()` (permissionlessly at the right phase) to unblock members who are offline. |

Trust hierarchy: **No address has privileged withdrawal power over another participant's funds.** The guardian can block new activity but cannot seize. The factory cannot touch vault state.

**M-signer collusion risk:** Any group of `threshold` or more participants can approve a payment proposal to a destination they control, spending up to the full remaining accounting balance. The contract does not prevent this — it is the intended mechanism (shared budget). Participants must trust the quorum they join. The contract does not provide absolute protection from other participants; it guarantees only that fewer than `threshold` signers cannot act unilaterally.

---

## 3. System Components

### 3.1 `ChangeBackFactory`

- Deploys new `ChangeBackVault` instances via `new ChangeBackVault(...)`.
- Emits `VaultCreated(address indexed vault, address indexed creator, address[] participants, uint256 threshold)` for on-chain discoverability.
- Maintains a mapping `isVault[address] => bool` and a public `vaultCount` counter.
- Has no admin functions, no upgrade path, no fee extraction.
- Hard-codes the USDC ERC-20 address and the Arc chain IDs; validates at construction that `block.chainid` matches a supported Arc network. Constructor token injection is **not available in production** (only in mock test deployments via a separate test contract).

### 3.2 `ChangeBackVault`

An immutable, non-upgradeable, non-proxy contract instance per budget.

---

## 4. Construction Parameters

| Parameter | Type | Constraints |
|---|---|---|
| `participants` | `address[]` | 2–20 elements; unique; sorted ascending; no zero address |
| `threshold` | `uint256` | 2 ≤ threshold ≤ participants.length |
| `collectUntil` | `uint256` | Unix timestamp; > block.timestamp; < spendUntil |
| `spendUntil` | `uint256` | Unix timestamp; > collectUntil; ≤ block.timestamp + 90 days |
| `guardian` | `address` | Must be one of `participants` |
| `token` | `address` | Production: hard-coded to `0x3600...0000`; test injection allowed only via mock harness |

Constructor reverts on any constraint violation. No setters exist post-deployment.

---

## 5. Lifecycle Phases (canonical, derived from `block.timestamp`)

```
Phase            Condition (checked in order)
─────────────────────────────────────────────────────────────────
Closed           closed == true
Returning        earlyReturnExecuted == true                      ← early-return flag (spendUntil unchanged)
                 OR (paused == true && block.timestamp >= pausedAt + 24h)
                 OR block.timestamp >= spendUntil
Active           block.timestamp >= collectUntil  (none of the above)
Collecting       block.timestamp < collectUntil
```

Key invariants:
- `spendUntil` is **immutable** and never reassigned. Early return is recorded via the `earlyReturnExecuted` boolean flag; the deadline value itself is preserved.
- `getPhase()` therefore reflects `earlyReturnExecuted` and the 24-hour-pause path, even before `spendUntil` is reached.
- `finalize()` is callable when `getPhase() == Returning` (covers all three Returning triggers: early-return flag, pause-expired, and normal expiry).

The `getPhase()` view function returns one of these four values. UI derives step position from it.

---

## 6. Permitted Operations by Phase

| Operation | Collecting | Active | Returning | Closed |
|---|---|---|---|---|
| `deposit(amount)` | Participant only, not paused | — | — | — |
| `proposePayment(...)` | — | Participant, not paused | — | — |
| `approve(proposalId)` | — | Participant, not paused | — | — |
| `revoke(proposalId)` | — | Participant, not paused | — | — |
| `execute(proposalId)` | — | ≥ threshold votes, not expired, not paused | — | — |
| `earlyReturn(...)` | — | Participant, not paused | — | — |
| `executeEarlyReturn(proposalId)` | — | ≥ threshold, not paused | — | — |
| `pause()` | Guardian only | Guardian only | — | — |
| `finalize()` | — | — | Anyone, or auto in first claim | — |
| `claimFor(participant)` | — | — | Anyone | — |
| `close()` | — | — | `getPhase()==Returning`, finalized (lazy), `totalRemainingLiability == 0` | — |

---

## 7. Deposit Mechanics

- Only registered participants may deposit.
- `amount > 0`.
- `block.timestamp < collectUntil`.
- Vault must not be paused.
- Uses `IERC20.transferFrom(msg.sender, address(this), amount)`.
- Actual credit = `balanceAfter − balanceBefore` (delta check rejects fee-on-transfer tokens — reverts if delta != amount).
- Contributions recorded in `contributions[participant]`; `totalContributions C` updated.
- Re-deposits are additive; the ledger is immutable once the Collecting phase ends.
- No withdrawals during Collecting: all contributions are frozen once `collectUntil` passes.

---

## 8. Proposal Mechanics

### 8.1 Payment Proposal

```
struct Proposal {
    ProposalType    proposalType;  // PAYMENT | EARLY_RETURN
    address         destination;   // != address(0), != vault address (PAYMENT only)
    uint256         amount;        // > 0 (PAYMENT only)
    bytes32         memoHash;      // keccak256 of caller-provided memo string (off-chain)
    uint256         expiresAt;     // > block.timestamp at creation, <= spendUntil
    uint256         approvalCount; // live tally
    bool            executed;
    bool            cancelled;
    mapping(address => bool) voted;
}
```

- `proposalId` is a monotonically incrementing `uint256` scoped per vault.
- Any participant may create a proposal (Active phase, not paused).
- `expiresAt` must be in the future and not exceed `spendUntil`.
- `destination` must be non-zero and must not equal the vault's own address.

### 8.2 Early-Return Proposal

- Same struct, `proposalType = EARLY_RETURN`, `destination = address(0)`, `amount = 0`.
- Requires same threshold.
- On execution, sets `earlyReturnExecuted = true`. This causes `getPhase()` to return `Returning` immediately, even though `spendUntil` remains unchanged (it is immutable). **`spendUntil` is never reassigned.**
- Pending PAYMENT proposals become globally invalid because `execute()` requires `getPhase() == Active`; no per-proposal cancellation loop is run (removed in FIX-2 as an unbounded-gas risk). The UI should derive proposal invalidity from `getPhase()`.

*Note: Early return is included in v1.*

### 8.3 Approvals and Revocations

- `approve(proposalId)`: records `voted[msg.sender] = true`, increments `approvalCount`. Reverts if already voted, already executed, cancelled, or expired.
- `revoke(proposalId)`: clears `voted[msg.sender]`, decrements `approvalCount`. Only valid before execution.
- Approvals are on-chain from `msg.sender` only — no off-chain signatures, no replay risk.
- One vote per signer per proposal.

### 8.4 Execution

- Permissionless once `approvalCount >= threshold`.
- Checks: not executed, not cancelled, not expired, phase == Active, not paused.
- Checks `totalContributions − totalSpent − amount >= 0` (accounting balance, not actual ERC-20 balance — protects against unsolicited transfer inflation).
- Records proposal as executed and debits `totalSpent += amount` **before** the token transfer (CEI pattern).
- Calls `IERC20.safeTransfer(destination, amount)`. On failure, reverts (rolling back the state debit). Uses OpenZeppelin `SafeERC20`.
- No double-execute guard needed beyond `executed` flag.

---

## 9. Accounting Model

```
C  = totalContributions        (fixed after collectUntil)
S  = totalSpent                (incremented by each executed payment)
R  = totalContributions - totalSpent   (return pool, snapshotted at finalize)
```

The vault tracks `C` from deposits (delta-checked). `S` increments from executions. `R` is **never derived from `token.balanceOf(vault)`** — unsolicited transfers do not change entitlements.

Unsolicited ERC-20 transfers to the vault address are acknowledged as "stranded surplus." The vault does not hold a recovery function for them in v1. They are displayed in the UI as non-entitlement surplus.

---

## 10. Return Distribution (Finalization)

### 10.1 Trigger

`finalize()` is callable by anyone when `getPhase() == Returning`. This is true in any of three cases:
1. `block.timestamp >= spendUntil` (normal scheduled expiry).
2. `earlyReturnExecuted == true` (quorum voted to return early; `spendUntil` value is preserved).
3. `paused == true && block.timestamp >= pausedAt + 24 hours` (guardian-pause escape).

`finalize()` may also be triggered lazily by the first `claimFor(participant)` call after any of the above conditions is true. **Both `finalize()` and individual `claimFor()` calls are external transactions that require gas; they are not executed automatically.** No keeper or relayer is bundled with this contract.

Once finalized, `returnPool R` is snapshotted and immutable.

### 10.2 Entitlement Computation

Let `n = participants.length`, participants sorted ascending by address (canonical order fixed at construction).

For participant `i` (0-indexed):

```
W_i = contributions[participants[i]]

Cumulative weight up to and including i:
  cumulativeW[i] = W_0 + W_1 + ... + W_i

Entitlement[i] = floor(R * cumulativeW[i] / C) - floor(R * cumulativeW[i-1] / C)
               (where cumulativeW[-1] = 0)
```

This is the telescoping floor-division formula. It guarantees:
- `sum(Entitlement[i]) == R` exactly (telescopes to `floor(R * C / C) = R`).
- Each entitlement differs from the exact proportional share by less than 1 micro-USDC (1 unit at 6 decimals).
- Allocation is **independent of claim order** — no last-claimer bonus or dust.
- If `C == 0` (no contributions), `R == 0` and all entitlements are 0; `close()` is immediately callable.

### 10.3 Claim

- `claimFor(participant)` transfers `entitlement[participant]` to the original `participant` address.
- The claimed flag / remaining liability is decremented **before** the transfer (CEI).
- A reverting or blocked `participant` address (e.g. blacklisted by USDC issuer) fails only their own claim; other participants are unaffected.
- Zero entitlements skip the transfer call (Arc rejects zero-value ERC-20 calls in some paths).
- No expiry on claims; no confiscation.

---

## 11. Pause Mechanics

- `pause()` callable only by `guardian` in Collecting or Active phase.
- Sets `paused = true` and records `pausedAt = block.timestamp` (written once; cannot be reset while paused).
- **No unpause in v1.** This is deliberate: an unpause function would allow the guardian to cancel and re-enable spending, creating a griefing / time-manipulation vector.
- Paused vault: all deposit/propose/approve/execute calls revert. `finalize()`, `claimFor()`, and `close()` remain callable.
- After `pausedAt + 24 hours`, **anyone** may call `finalize()` to snapshot R and begin the Returning phase, even before `spendUntil`.
- Disclosures:
  - The guardian can effectively cancel the budget (force Returning) but **can never seize funds**.
  - Guardian griefing (refusing to participate, pausing at a bad time) is a residual risk. Participants should choose a trusted guardian.
  - USDC issuer blocklist, network outage, lost keys, and threshold-signers colluding are residual risks not preventable by this contract.

---

## 12. Close

`close()` requires:
1. `getPhase() == Returning` (prevents closure during Collecting or Active).
2. The vault must be finalized (lazily triggered if not already done).
3. `totalRemainingLiability == 0` (all positive-entitlement claims paid out).

It sets `closed = true`, preventing any further state changes. It is an accounting closure only — no `selfdestruct`, no fund movement. Stranded surplus (if any) remains at the contract address permanently.

Zero-entitlement participants (those who did not deposit) do not contribute to `totalRemainingLiability` and therefore do not block `close()`, regardless of whether they have called `claimFor`. Participants with positive entitlement must each have their claim processed before `close()` can succeed.

---

## 13. Arc-Specific Constraints

- The contract uses ERC-20 `transferFrom` / `safeTransfer` exclusively. **No `msg.value` accepted**; the `receive()` and `fallback()` functions are absent.
- Zero-value ERC-20 transfers are guarded against (skip transfer on zero entitlement).
- No transfers to `address(0)` (all destinations validated).
- No `SELFDESTRUCT` usage.
- `PREVRANDAO` is not used (Arc always returns 0 anyway; not applicable here).
- The contract does not use blob transactions, type-3 transactions, or EIP-4788.
- Uses Paris bytecode target (`foundry.toml`) as a conservative option compatible with the Osaka chain baseline. See official Arc EVM differences: https://docs.arc.io/integrate/evm-differences

**Arc integration test gap (disclosed):** The Foundry unit tests run against a local EVM simulation (Forge cheatcodes / `vm.warp`). They do not exercise Arc-specific precompiles, the Arc address blocklist, Arc's USDC native-gas duality, or Arc's exact block-production timing. Behavior on the actual Arc Testnet chain may differ from the Forge simulation for edge cases involving those features. Arc-specific integration tests against a live Arc Testnet fork or node are a known gap and are **not included in the current test suite.**

---

## 14. Libraries

| Library | Version | Usage | Justification |
|---|---|---|---|
| `OpenZeppelin ReentrancyGuard` | 5.1.0 | Wraps `deposit`, `execute`, `claimFor` | Industry-standard, minimal, audited |
| `OpenZeppelin SafeERC20` | 5.1.0 | `safeTransfer`, `safeTransferFrom` | Guards against non-reverting ERC-20 implementations |
| `Math.mulDiv` | 5.1.0 | Full-precision `floor(R * W / C)` | 512-bit intermediate prevents overflow on large amounts; reviewed in OZ 5.x |

No yield, bridge, fee, delegation, proxy, or upgrade logic is used.

---

## 15. UI Step Map

| Step # | Step Name | Phase | Key Action |
|---|---|---|---|
| 1 | Create | — | Factory.createVault(...) |
| 2 | Collect | Collecting | deposit(amount) |
| 3 | Approve | Active | proposePayment / approve / revoke |
| 4 | Spend | Active | execute(proposalId) |
| 5 | Return | Returning | finalize() / claimFor(address) |
| 6 | Close | Closed | close() |

The six-step lifecycle rail in the UI reflects the current phase read from `getPhase()`.

---

## 16. Known Limitations (v1)

1. No automation: finalization, claims, and close all require externally submitted transactions with gas. No keeper or relayer is provided.
2. No unpause: guardian pause is irreversible. Documented as a deliberate tradeoff.
3. No fee-on-transfer token support: reverts if token charges a fee.
4. No recovery for stranded surplus (unsolicited transfers): acknowledged, no `sweep()` function in v1.
5. Guardian is a single point of availability: if guardian key is lost, pausing is impossible — not a fund-loss risk.
6. Proposal approvals are not reservations: competing proposals may be approved but only one can execute if funds are insufficient for both.
7. USDC issuer can freeze individual participants' wallets: their claim reverts, but this affects only them.
8. M-signer collusion: threshold signers can authorize payments to any destination, including one they control. This is the intended design; choose participants carefully.
9. Arc integration tests not included: Forge unit tests do not cover Arc-specific precompiles, the address blocklist, or USDC native-gas duality. See section 13.

---

## 17. Out of Scope

- Fee extraction
- Yield / interest on pooled funds
- Cross-chain bridging
- Upgradeable proxy
- Delegatecall
- Admin withdrawal
- NFT / token-gated access
- Arbitrary external calls from the vault
