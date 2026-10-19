# Testnet Acceptance Plan — ChangeBack

**Status:** DRAFT — awaiting explicit user approval before any wallet-signing step  
**Chain:** Arc Testnet (chainId 5042002)  
**Factory:** `0x0cf03f85278a7d1ce3057b77043e1b9af3da2ec0`  
**Factory vaultCount (live):** 0  
**Factory SHA256 match:** confirmed (2B93EFF082DB65ED3A9726EAA56A2169408DEC68AA295FA570CCF5A1D9095E42)  
**Date prepared:** 2026-10-16  

---

## Hard boundaries (unchanged)

- No Mainnet actions of any kind.
- No vault creation, token approval, deposit, payment, claim, or close until each stage is explicitly approved.
- UI write-allowlist remains empty; `REVIEWED_FACTORY_ADDRESSES` is not populated until separately approved.
- No GitHub push, publication, or hosting.

---

## 1. Required signer addresses

Three **distinct** wallets are required — one per participant. They must be:

- Funded with Arc Testnet USDC (≥ 1.000001 each, plus a small reserve for gas).
- Different from each other and from the Circle-managed deployer wallet.
- **Sorted in strictly ascending order** for the `participants[]` constructor argument (the factory enforces `addr > prev`).

| Role | Placeholder | Must be replaced with a real funded testnet address |
|------|------------|-----------------------------------------------------|
| Participant A (guardian) | `0xAAAA…` | REPLACE before any action |
| Participant B | `0xBBBB…` | REPLACE; must be > Participant A numerically |
| Participant C | `0xCCCC…` | REPLACE; must be > Participant B numerically |

**Do not use any Circle-managed deployer wallet as a participant.** The deployer address is internal to the Circle platform and is not a suitable test signer.

---

## 2. Testnet token funding

Token: USDC at `0x3600000000000000000000000000000000000000` (Arc Testnet, 6 decimals).  
Each participant needs testnet USDC from the Arc Studio "Get test USDC" sidebar button or the faucet endpoint. No real funds are used; this is testnet only.

Suggested amounts (extra for gas reserve):
- Participant A: 1.500000 USDC (1_500_000 raw units)
- Participant B: 1.500000 USDC
- Participant C: 1.500000 USDC

---

## 3. Factory ABI — createVault arguments

```solidity
function createVault(
    address[] calldata participants,  // sorted ascending, 2–20 addresses
    uint256 threshold,                // 2 ≤ threshold ≤ participants.length
    uint256 collectUntil,             // Unix timestamp; must be > block.timestamp
    uint256 spendUntil,               // Unix timestamp; must be > collectUntil and ≤ now+90days
    address guardian                  // must be one of participants[]
) external returns (address vault)
```

**Safe deadline arithmetic (example — compute fresh at tx time):**

| Parameter | Suggested value | Note |
|-----------|----------------|------|
| `collectUntil` | `block.timestamp + 3600` | 1 hour from now; use fresh timestamp at signing time |
| `spendUntil` | `block.timestamp + 86400` | 24 hours from now; must be > collectUntil |
| `threshold` | `2` | 2-of-3 approval |
| `guardian` | Participant A address | Must be in participants[] |

**Deadlines are immutable once the vault is deployed.** Compute them at the moment of signing — do not reuse a timestamp computed hours earlier.

---

## 4. Case A — Equal contributions, 1 USDC spend

### Setup

| Field | Value |
|-------|-------|
| Participants | A, B, C (sorted ascending) |
| Threshold | 2 |
| Contribution each | 1.000001 USDC = 1_000_001 raw units |
| Total contributions (C) | 3.000003 USDC = 3_000_003 raw units |
| Spend proposal | 1.000000 USDC = 1_000_000 raw units to a distinct receiver address |
| Receiver | A separate funded or unfunded testnet address (not a participant) |

### Token approval (ERC-20 approve)

Each participant must call `approve` on the USDC contract **before** calling `deposit`.  
**Exact, non-unlimited approval amount:**

```
token.approve(vaultAddress, 1_000_001)   // raw units; exactly the deposit amount
```

Contract: `0x3600000000000000000000000000000000000000`  
Function: `approve(address spender, uint256 amount) returns (bool)`

### Deposit (per participant)

```
vault.deposit(1_000_001)
```

### Return pool and entitlement formula

From `_finalize()` in `ChangeBackVaultBase.sol` (verified against source):

```
pool   = totalContributions − totalSpent
       = 3_000_003 − 1_000_000 = 2_000_003

totalWeight = totalContributions = 3_000_003

// Telescoping floor-division (participant order = sorted ascending = A, B, C):
//
// All three contributions are equal (1_000_001 each), so the weight factor
// cancels exactly in each cumulative fraction:
//   pool × (k × 1_000_001) / (3 × 1_000_001) = pool × k / 3
//
// This gives exact rational values:
//   k=1: pool / 3     = 2_000_003 / 3 = 666_667 + 2/3   → floor = 666_667
//   k=2: 2×pool / 3   = 4_000_006 / 3 = 1_333_335 + 1/3 → floor = 1_333_335

cumW_A = 1_000_001  (k=1)
floorA = floor(pool × 1 / 3)
       = floor(666_667 + 2/3)   // exact rational; not a decimal approximation
       = 666_667
shareA = 666_667 − 0 = 666_667

cumW_B = 2_000_002  (k=2)
floorB = floor(pool × 2 / 3)
       = floor(1_333_335 + 1/3) // exact rational; not a decimal approximation
       = 1_333_335
shareB = 1_333_335 − 666_667 = 666_668

// Carol (last) receives the remainder — no division, no rounding:
shareC = pool − 1_333_335 = 2_000_003 − 1_333_335 = 666_668

sum    = 666_667 + 666_668 + 666_668 = 2_000_003  ✓ (equals pool exactly, zero dust)
```

**Expected entitlements (raw units / USDC display):**

| Participant | Raw units | USDC (6dp) |
|-------------|-----------|------------|
| A (address-smallest) | 666_667 | 0.666667 |
| B | 666_668 | 0.666668 |
| C (address-largest) | 666_668 | 0.666668 |
| **Sum** | **2_000_003** | **2.000003** |

**Why A gets one micro-unit less than B and C:** The telescoping formula accumulates `floor()` rounding left-to-right; the last participant receives the remainder with no rounding. With equal weights and an indivisible pool (2_000_003 is not divisible by 3), the first participant gets `floor(pool/3)` = 666_667 and the remaining two get 666_668. This is Case A — it **is** the nondivisible-refund case. This is deterministic and contract-verified by `test_Concrete3Member_1_000_001Each_ExactEntitlements`.

### Payment proposal arguments

```
vault.proposePayment(
    receiverAddress,     // not a participant; testnet address you control
    1_000_000,           // 1.000000 USDC
    bytes32(0),          // memoHash; 0x000…000 is valid
    expiresAt            // Unix timestamp; must be > block.timestamp AND ≤ spendUntil
)
// returns: proposalId (uint256, starts at 0)
```

### Approval (2 of 3 signers)

```
vault.approve(proposalId)   // called by Participant A
vault.approve(proposalId)   // called by Participant B  (or any 2 of {A,B,C})
```

### Execute

```
vault.execute(proposalId)   // callable by anyone once approvalCount ≥ threshold
```

### Finalize / claimFor / close

These are permissionless — any address may call them:

```
vault.finalize()             // or triggered lazily by first claimFor
vault.claimFor(addressA)
vault.claimFor(addressB)
vault.claimFor(addressC)
vault.close()                // only callable once totalRemainingLiability == 0
```

### Expected final state

| Variable | Expected value |
|----------|---------------|
| `totalContributions` | 3_000_003 |
| `totalSpent` | 1_000_000 |
| `returnPool` | 2_000_003 |
| `totalRefunded` | 2_000_003 |
| `totalRemainingLiability` | 0 |
| `closed` | true |
| receiver balance delta | +1_000_000 raw USDC |

---

## 5. Case B — Zero-spend full-exact-refund

Case A (above) is the nondivisible case (pool not divisible by 3). Case B below confirms the exact-refund path when no spending occurred and pool = C = totalWeight.

### Setup

| Field | Value |
|-------|-------|
| Contribution each | 1.000001 USDC = 1_000_001 |
| Spend | 0 (no payment proposal) |
| Total C | 3_000_003 |
| pool | 3_000_003 |

With zero spend, pool = C = totalWeight; the formula simplifies because `pool × cumW / totalWeight = cumW` exactly:

```
floorA = floor(3_000_003 × 1_000_001 / 3_000_003) = 1_000_001   shareA = 1_000_001
floorB = floor(3_000_003 × 2_000_002 / 3_000_003) = 2_000_002   shareB = 1_000_001
shareC = 3_000_003 − 2_000_002 = 1_000_001
```

Everyone receives exactly their contribution back. Sum = 3_000_003 = C ✓. No rounding — all fractions are integers.

**This case confirms exact same-amount refund when no spending occurred.**

## 5b. Case C — Asymmetric weights (3 : 2 : 1 ratio)

| Participant | Contribution | Raw units |
|------------|-------------|-----------|
| A | 3.000000 USDC | 3_000_000 |
| B | 2.000000 USDC | 2_000_000 |
| C | 1.000000 USDC | 1_000_000 |
| Total | 6.000000 USDC | 6_000_000 |

With spend = 1.000000 USDC (1_000_000), pool = 5_000_000:

```
totalWeight = 6_000_000

floorA = floor(5_000_000 × 3_000_000 / 6_000_000) = floor(2_500_000.000) = 2_500_000
shareA = 2_500_000

floorB = floor(5_000_000 × 5_000_000 / 6_000_000) = floor(4_166_666.666…) = 4_166_666
shareB = 4_166_666 − 2_500_000 = 1_666_666

shareC = 5_000_000 − 4_166_666 = 833_334

sum = 2_500_000 + 1_666_666 + 833_334 = 5_000_000  ✓
```

**Expected (display):**

| Participant | Raw | USDC |
|------------|-----|------|
| A (3 USDC contributed) | 2_500_000 | 2.500000 |
| B (2 USDC contributed) | 1_666_666 | 1.666666 |
| C (1 USDC contributed) | 833_334 | 0.833334 |

Note: B gets 1.666666 (not 1.666667) because the rounding residual goes to C via the telescope formula.

---

## 6. Gas budget

**All figures below are TBD — to be determined from `eth_estimateGas` and live Arc Testnet fee data immediately before each transaction is confirmed.**

The Foundry gas reporter gives Anvil-measured gas units but does not translate to Arc USDC cost because:
- Arc uses USDC as native gas, so cost = gasUsed × effectiveGasPrice (in 18-decimal native units) converted to 6-decimal USDC display via `gasTokenToUsdc`.
- The deployed child vault bytecode (`ChangeBackVault.sol`) is substantially larger than the harness, and `createVault` deploys a full vault — the gas cost will be higher than any per-operation estimate.
- Arc Testnet gas pricing may differ from Anvil's default.

**Before confirming any testnet transaction:**
1. Call `eth_estimateGas` for each function with the exact parameters.
2. Multiply by the current `eth_gasPrice` (or `maxFeePerGas`).
3. Confirm the result is acceptable and the wallet holds sufficient balance in the native view.

The existing `test_EarlyReturn_GasIndependentOfProposalCount` Foundry test confirms `executeEarlyReturn` costs < 100,000 gas on Anvil; no other gas bounds are asserted. Do not use Anvil gas figures as Arc budgets.

---

## 7. Evidence collection steps (per stage)

For each on-chain transaction record:

1. **Tx hash** — from wallet or RPC receipt
2. **Block number** — from receipt
3. **Gas used + effective gas price** — from receipt (`gasUsed × effectiveGasPrice` in 18-decimal native units = USDC gas cost)
4. **Receipt status** — must be 0x1 (success)
5. **Post-tx read verification** — call relevant getter (e.g. `vaultCount()`, `getPhase()`, `contributions(addr)`, `entitlement(addr)`) and record result

### Important: balance verification on Arc

On Arc, USDC native gas and USDC ERC-20 are the **same token pool** exposed two ways. A naive "balance before" minus "balance after" will mix gas spend with USDC transfers and produce a wrong delta.

**Use Transfer event logs, not balance deltas, to verify USDC amounts received:**

- For `claimFor(addr)`: read the `Transfer(from=vault, to=addr, value)` event from the receipt log. The `value` is the exact raw USDC transferred. This is independent of gas cost.
- For `execute(proposalId)`: read the `Transfer(from=vault, to=receiver, value)` event. Compare to proposal `amount`.
- For `deposit(amount)`: read the `Transfer(from=participant, to=vault, value)` event. Compare to `contributions(participant)` getter.

**Do NOT rely on `balanceOf(signer_before) - balanceOf(signer_after)` for signers** because gas is deducted from the same pool. The ERC-20 `balanceOf` view will show a smaller delta than expected for any tx where the signer also paid gas.

**For non-signer addresses** (e.g. the payment receiver who never signs a tx), `balanceOf` delta is reliable because no gas was deducted from their account.

---

## 8. Arc-specific considerations

**Not tested in Foundry mock suite:**
- Arc precompiles (BLOCKHASH, COINBASE behaviour per https://docs.arc.io/integrate/evm-differences)
- Arc USDC blocklist enforcement (the USDC contract at 0x3600… may enforce a blocklist not present in MockERC20)
- Osaka chain baseline / Paris bytecode target compatibility (confirmed by production compile, not by live execution)
- Actual gas pricing in USDC units

**Reference:** https://docs.arc.io/integrate/evm-differences

The mock test suite exercises all contract logic branches. Arc integration tests (using live RPC and funded wallets) are pending approval as part of the testnet acceptance run itself.

---

## 9. Pending UI limitations

The following are not covered by automated tests and require manual verification during testnet acceptance:

| Limitation | Status |
|-----------|--------|
| `useWriteAllowed` hook (React hook, not pure function) | Code review only; not unit-testable without wagmi mock |
| Submitted-chain binding during mid-confirmation wallet chain switch | Code review only; no component test framework present |
| Chain selector disabled during pending confirmation | Not implemented; chain switch does not auto-resubmit but TxButton confirming state may stall |
| UI allowlist (`REVIEWED_FACTORY_ADDRESSES`) is empty | No vault creation possible from UI until explicitly populated |

---

## 10. GO / NO-GO assessment

### GO conditions (all must be confirmed before starting)

- [ ] Three distinct funded testnet wallets identified and addresses provided (sorted ascending)
- [ ] Each wallet has ≥ 1.5 USDC on Arc Testnet
- [ ] Each wallet has Arc Testnet native gas (same USDC, but native view; faucet via Arc Studio sidebar)
- [ ] User explicitly approves vault creation transaction
- [ ] User explicitly approves each subsequent stage (deposit, propose, approve, execute, finalize/claim, close)

### NO-GO blockers (current state)

- **UI allowlist is empty** — the frontend write-gate blocks vault creation until `REVIEWED_FACTORY_ADDRESSES` is populated. The factory itself is deployed and ready; the UI block is intentional. Populating the allowlist requires a separate explicit approval.
- **No funded testnet wallets provided** — wallet addresses are placeholders; none are real addresses.
- **No confirmed receiver address** — the payment destination for the 1 USDC spend is unspecified.

### Current status: **NO-GO** — awaiting wallet addresses, explicit stage approvals, and allowlist update approval.

---

## 11. Deployed factory read-only confirmation (live, no signing)

| Getter | Value | Source |
|--------|-------|--------|
| `vaultCount()` | 0 | `read_contract` Arc Testnet |
| `USDC_ADDRESS()` | `0x3600000000000000000000000000000000000000` | `read_contract` Arc Testnet |
| `ARC_TESTNET_CHAIN_ID()` | 5042002 | `read_contract` Arc Testnet |
| `ARC_MAINNET_CHAIN_ID()` | 5042 | `read_contract` Arc Testnet |
| `isVault(0x0001)` | false | `read_contract` Arc Testnet |
| Runtime SHA256 | 2B93EFF082DB65ED3A9726EAA56A2169408DEC68AA295FA570CCF5A1D9095E42 | artifact vs. independent RPC |
| Runtime size | 11850 bytes | artifact vs. independent RPC |
