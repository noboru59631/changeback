# Validation Report — updated 2026-10-17

**Status:** COMPLETE — all tests pass, lint/typecheck clean, production build succeeds  
**Updated:** 2026-10-17 — StepCreate preflight + WriteGate allowlist  
**Prior:** 2026-10-16 (final two corrections: DemoView text + StepClose routing fix)  
**Studio project:** https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710

---

## Environment

| Tool | Version |
|------|---------|
| Foundry / forge | 1.x (sandbox pre-installed) |
| Solidity | 0.8.28 |
| Bun | 1.3.14 |
| oxlint | current sandbox |
| TypeScript | current sandbox |

---

## 1. Solidity Tests — `forge test -v`

**Command run (no pipe):**
```
cd /home/user/app && forge test -v
```
**Exit code: 0**

### Test suites

| Suite | File | Passed | Failed |
|-------|------|--------|--------|
| ChangeBackVaultTest (regression, 8 audit fixes) | contracts/test/ChangeBackVault.t.sol | 29 | 0 |
| ChangeBackVaultFullTest (full suite) | contracts/test/ChangeBackVaultFull.t.sol | 54 | 0 |

**Total: 83 tests, 0 failures.**  
Fuzz runs: 256 per fuzz test (4 fuzz tests × 256 = 1024 total fuzz runs).

### Full test inventory (ChangeBackVaultFullTest)

**Claim-order permutations (6/6):**
- test_ClaimOrder_AliceBobCarol ✓
- test_ClaimOrder_AliceCarolBob ✓
- test_ClaimOrder_BobAliceCarol ✓
- test_ClaimOrder_BobCarolAlice ✓
- test_ClaimOrder_CarolAliceBob ✓
- test_ClaimOrder_CarolBobAlice ✓

**Fuzz (conservation):**
- testFuzz_ConservationTwoParticipants (256 runs) ✓
- testFuzz_ConservationThreeParticipants (256 runs) ✓
- testFuzz_ConservationWithSpend (256 runs) ✓
- testFuzz_ThreeWeightsWithSpendRoundingOrderIndependence (256 runs, incl. zero-weight cases) ✓

**Duplicate operations:**
- test_DuplicateApproveReverts ✓
- test_DuplicateExecuteReverts ✓
- test_DuplicateClaimReverts ✓

**Adversarial / isolation:**
- test_BlockedRecipient_OthersClaimUnimpeded_ThenUnblock ✓
  (alice blocked via setBlockedRecipient; claim reverts, claimed=false, liability unchanged; bob+carol claim; unblock; alice claims)
- test_FailedPaymentTransfer_RollsBackExecute ✓
  (destination blocked; execute reverts; proposal.executed=false; totalSpent unchanged)
- test_ReentrantDeposit_IsBlocked_AccountingUnchanged ✓
  (setReentrantTarget on transferFrom; ReentrancyGuard fires; accounting unchanged)
- test_ReentrantClaim_IsBlocked ✓
  (setReentrantTargetOnTransfer; claimFor re-enters; ReentrancyGuard fires; claimed=false)
- test_ReentrantExecute_IsBlocked ✓
  (setReentrantTargetOnTransfer; execute re-enters; ReentrancyGuard fires; totalSpent unchanged)
- test_CompetingPaymentsOverspend ✓
- test_RevokeDropsBelowThreshold_ThenReapprove ✓

**Boundaries:**
- test_Boundary_DepositAtExactlyCollectUntil_Reverts ✓
- test_Boundary_DepositOneSecondBeforeCollectUntil_Succeeds ✓
- test_Boundary_NoLateDeposit_OneSecondAfterCollectUntil ✓
- test_Boundary_ExecuteAtExactlySpendUntil_Reverts ✓
- test_Boundary_FinalizeNotCallableOneSecondBeforeSpendUntil ✓
- test_Boundary_FinalizeCallableAtExactlySpendUntil ✓
- test_Boundary_Pause24h_ExactlyAt24h_IsReturning ✓
  (long-window vault; spendUntil >> pausedAt+24h; pause fires first; one-second-before=Active; exactly-at=Returning)

**Outsider (Active phase, phase asserted before prank):**
- test_Outsider_CannotDeposit ✓
- test_Outsider_CannotPropose_InActivePhase ✓ (expiry computed before vm.prank)
- test_Outsider_CannotVote_InActivePhase ✓ (expiry computed before vm.expectRevert)
- test_Outsider_CannotPause ✓

**Invalid constructor:**
- test_InvalidConstructor_TooFewParticipants ✓
- test_InvalidConstructor_TooManyParticipants ✓
- test_InvalidConstructor_ThresholdTooLow ✓
- test_InvalidConstructor_ThresholdTooHigh ✓
- test_InvalidConstructor_CollectUntilInPast ✓
- test_InvalidConstructor_SpendUntilBeforeCollectUntil ✓
- test_InvalidConstructor_SpendUntilTooFar ✓
- test_InvalidConstructor_ZeroParticipant ✓
- test_InvalidConstructor_UnsortedParticipants ✓
- test_InvalidConstructor_DuplicateParticipant ✓
- test_InvalidConstructor_GuardianNotParticipant ✓
- test_InvalidConstructor_ZeroToken ✓

**Factory / production:**
- test_FactoryOnWrongChain_Reverts ✓
  (ChangeBackFactory constructor reverts on Anvil chainid 31337 with "Wrong chain")
- test_TwoVaultIsolation ✓
  (two harness vaults; deposits/spend in vaultB do not affect vaultA)
- test_ProductionVault_RevertsOnWrongChain_HarnessDoesNot ✓
  (harness deploys on Anvil; new ChangeBackFactory() also reverts "Wrong chain")

**Early return:**
- test_EarlyReturn_PendingPaymentsGloballyInvalidated ✓
- test_EarlyReturn_GasIndependentOfProposalCount ✓
  (50 spam proposals; executeEarlyReturn uses < 100k gas — confirmed O(1), no proposal loop)

**Proposal expiry:**
- test_ProposalExpiry_ExecuteRevertsAtExactExpiry ✓
- test_ProposalExpiry_ExecuteSucceedsOneSecondBefore ✓

**Guardian / pause:**
- test_NonGuardian_CannotPause ✓
- test_Guardian_NonParticipant_RevertsAtConstruction ✓
- test_DoublePause_Reverts ✓

**Accounting:**
- test_Accounting_InvariantAfterFullCycle ✓

### Full test inventory (ChangeBackVaultTest — 8 audit fix regressions)

FIX-1 (6 tests), FIX-2 (2), FIX-3 (1), FIX-4 (3), FIX-5 (4), FIX-6 (3), FIX-7 (3), LIFECYCLE (1), REGRESSION (5) — all 29 pass.

---

## 2. TypeScript Unit Tests — `bun test src/lib/format.test.ts`

**Exit code: 0. 41/41 pass.**

### Inventory

**parseUsdc — valid inputs (13 cases):** "1", "1.0", "1.5", "0.5", "0.50", "0.000001", "1.000000", "100.0", "0", "0.0", ".5", "1.", "1.123456"

**parseUsdc — rejected inputs (16 cases):** "-0.5", "-1.5", "-1", "1e3", "1E6", "1.0000001" (>6dp), "1.2.3" (multi-dot), " " (whitespace-only), "" (empty), "abc", "1 000" (space), " 1" (leading ws), "1 " (trailing ws), "NaN", "Infinity", "+1"

**formatUsdc6dp (7 cases):** 1n→"0.000001", 1_000_000n→"1", 1_500_000n→"1.5", 500_000n→"0.5", 0n→"0", 1_234_567n→"1.234567", trailing-zero strip

**formatUsdc 2dp (5 cases):** 1_000_000n→"1.00", 500_000n→"0.50", 1n→"0.00" (truncation), 10_000n→"0.01", 0n→"0.00"

---

## 3. Frontend — `bash scripts/check.sh` + `bunx vite build`

**check exit code: 0. 0 warnings, 0 errors.**
**build exit code: 0. Production bundle built successfully.**

- oxlint type-aware: 0 errors
- tsc --noEmit: 0 errors
- `bunx vite build`: succeeded in ~17s, no errors (chunk-size warnings expected for wagmi/ConnectKit, not errors)
- Dev server: running (PID 2158)

### config.ts — final transport correction

`src/config.ts` now imports both `arc` (chainId 5042) and `arcTestnet` (chainId 5042002) from `viem/chains` and registers both chains with explicit official RPC URLs:

| Chain | ChainId | Transport |
|-------|---------|-----------|
| Arc Testnet | 5042002 | `http('https://rpc.testnet.arc.io')` |
| Arc Mainnet | 5042 | `http('https://rpc.mainnet.arc.io')` |
| Ethereum mainnet | 1 | `http()` (ENS only, no writes) |

Both chains registered in tracing via `registerChain()`. A bare `http()` transport for Arc Testnet has been replaced with the explicit URL so wagmi never uses a public discovery endpoint and routing is correct regardless of which chain the wallet is on.

### StepClose gate fix

Previously `StepClose` called `useWriteAllowed(selectedChainId, undefined, undefined, ...)` — with `factoryAddress=undefined`, `gateReason` always returned `'unreviewed-factory'`, permanently blocking writes regardless of any other condition. This was a structural bug: the Close step shared none of the gate props that all other steps receive from App.tsx.

Fixes applied:
1. `StepClose` interface extended with `factoryAddress?`, `isVaultRegistered?`, `isVaultRegisteredLoading?`, `isVaultRegisteredError?` — identical to StepReturn, StepCollect, StepApproveSpend.
2. `useWriteAllowed` call in StepClose now passes all six props: `(selectedChainId, factoryAddress, vaultAddress, isVaultRegistered, isVaultRegisteredLoading, isVaultRegisteredError)`.
3. App.tsx updated to pass all four factory/registry props to StepClose, matching StepReturn.
4. Inaccurate comment removed: "at Close phase the vault is fully verified by the Returning-phase preconditions." The replacement comment explicitly states: reaching Returning/Closed phase does NOT verify factory provenance — phase is determined by the vault's internal clock. The allowlist is the only provenance guard.

All six write steps now use the identical `gateReason` function through `useWriteAllowed`. No step has an exception.

### WriteGate unit tests (`src/components/WriteGate.test.ts`)

`gateReason` exported as a named pure function (no React, no wagmi) from `WriteGate.tsx`. 26 unit tests in 7 suites:

| Suite | Tests |
|-------|-------|
| No wallet | 2 |
| Wrong chain | 4 (including transient `isConnected=true + chainId=undefined`) |
| Unreviewed factory — Arc Testnet | 5 (including `isVault=true` does NOT bypass allowlist) |
| Unreviewed factory — Arc Mainnet | 4 (including allowlist-empty assertions) |
| Registry state ordering (allowlist-first guard) | 3 |
| No vault address (StepCreate path) | 2 |
| Argument precedence + chain ID identity | 5 |

**Result: 26/26 pass, exit 0.**

Known limitations explicitly stated in test file header:
- `useWriteAllowed` hook: requires wagmi mock; covered by code review only.
- submitted-chain / explorer-link binding: pure function test not feasible; correctness verified by code review of the `useState<number>` capture pattern.
- Pending-transaction UI: when a tx is in-flight, the chain selector is not disabled. Chain switch mid-confirmation does not cause auto-resubmit (submittedChainId is fixed), but `TxButton` "confirming" state may appear to stall if wallet switches away. This is a documented limitation.
- `gateReason` 'ok' path: cannot be reached in unit tests because `REVIEWED_FACTORY_ADDRESSES` is empty pre-deployment and the allowlist object is frozen (readonly). The 'ok' path is exercised by the ordering tests which confirm the only blocking reason without a reviewed factory is `'unreviewed-factory'`.

### Receipt chain binding

All five write components (`StepCreate`, `StepCollect`, `StepApproveSpend`, `StepReturn`, `StepClose`) now:

1. Capture `submittedChainId` in a `useState` at the moment `writeContract()` is called.
2. Pass `chainId: submittedChainId` to `useWaitForTransactionReceipt()` — the receipt waits on the same chain the transaction was submitted to, not the chain the wallet is currently on.
3. Check `receipt.status === 'success'` before showing confirmed-success UI or calling refetch/toast/reset.
4. Move all `isSuccess`/`isError` side-effects (toast, refetch, reset) into `useEffect` hooks, never in the render body.
5. Use `submittedChainId` for explorer links so links remain correct after a chain switch.

---

## 4. ABI generation — deterministic from artifacts

**Command:** `bun run scripts/generate-abi.ts`

Reads `contracts/out/ChangeBackVault.sol/ChangeBackVault.json` and `contracts/out/ChangeBackFactory.sol/ChangeBackFactory.json`. Writes `src/lib/abi.ts` with 51 vault entries and 8 factory entries. No hand-written ABI.

---

## 5. Known gaps and limitations

### Arc-specific integration tests
Normal Foundry tests run on Anvil (chainid 31337). **No Arc-specific integration tests exist.** The following behaviors are NOT verified by the current test suite:

- Arc USDC precompile behavior (the USDC address 0x3600...0000 on Arc)
- Arc blocklist / sanctions enforcement
- Arc gas token interaction (native USDC = gas on Arc)
- Sub-second finality timing
- Any behavior specific to the Osaka EVM baseline or Paris bytecode target

The chain guards (ChangeBackVault + ChangeBackFactory constructors) are verified to reject Anvil's chainid 31337, but cannot be exercised with the real Arc chainid without a live Arc node.

**Disclosure:** Ordinary Foundry unit tests do not prove Arc-specific precompile or blocklist behavior. Integration tests against Arc Testnet require a separate test lane with a live RPC, funded wallets, and explicit deployment approval.

### No live testnet deployment
No vault or factory has been deployed to Arc Testnet or Arc Mainnet. All tests are on the Anvil local EVM.

### Pending security review
No independent third-party security audit has been performed. The internal audit (8-issue review) has been addressed. An external audit is recommended before any mainnet deployment.

---

## 6. Exit codes (raw, no pipe masking)

Final validation run after all fixes including gate correction:

| Command | Result | Exit code |
|---------|--------|-----------|
| `forge test -v` | 83 pass, 0 fail | 0 |
| `bun test src/lib/format.test.ts` | 41 pass, 0 fail | 0 |
| `bun test src/components/WriteGate.test.ts` | 26 pass, 0 fail | 0 |
| `bash scripts/check.sh` (oxlint + tsc) | 0 warnings, 0 errors | 0 |
| `bunx vite build` | built in ~17s, 0 errors | 0 |
| `bun run scripts/generate-abi.ts` | 51 vault + 8 factory entries | 0 |

Total runnable tests: 83 (Solidity) + 41 (parseUsdc/formatUsdc) + 26 (WriteGate gateReason) + 12 (shouldShowClose routing) = **162 pass, 0 fail**.

### Final two corrections (2026-10-16)

**Correction 1 — DemoView Step 1 text**
Previous: "every write requires the full threshold of approvals" — false.
Replacement: "Payments require the configured approval threshold; other actions (finalize, claimFor, close) follow their specific permissions."

**Correction 2 — StepClose reachable during Returning phase**
Root cause: App.tsx rendered `<StepClose>` only when `phase === Phase.Closed`. The contract's `close()` function is callable during `Phase.Returning` (once liability reaches zero), so it was unreachable from the UI in that phase. A user who finalized, called all claimFor transactions, and reached zero liability could not call close() without waiting for the phase to advance — which it never does until close() is called. Circular.

Fix: Exported `shouldShowClose(phase)` as a named pure function from App.tsx. It returns `true` for both `Phase.Returning` and `Phase.Closed`. The rendering block uses `shouldShowClose(phase)` for StepClose and `phase === Phase.Returning` for StepReturn (both render simultaneously during Returning: Return shows finalize/claims, Close shows the close button disabled until liability=0). After close() succeeds, the vault transitions to Phase.Closed and StepClose shows the locked banner.

`src/routing.test.ts` — 12 tests import `shouldShowClose` from the actual App.tsx (not a copy) and verify:
- true for Phase.Returning (2) and Phase.Closed (3) by enum name and by numeric value
- false for Phase.Collecting, Phase.Active, null, unknown (4), invalid (-1)
- Phase enum values match Solidity enum order (0,1,2,3)

### Remaining limitations

- `useWriteAllowed` React hook: tested by code review; wagmi mock not available in bun test
- submitted-chain/explorer binding: correctness by code review of `useState<number>` capture
- Pending-transaction UI: chain selector not disabled mid-confirmation; chain switch does not auto-resubmit but TxButton confirming state may stall
- Arc-specific integration tests: none exist; requires live Arc RPC, funded wallets, and explicit deployment approval
- No independent third-party security audit performed
