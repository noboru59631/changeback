# Native next-stage validation — 2026-10-24 JST

Follow-up: manual faucet verification and explicit approval to receive 20 test USDC per test
participant resolved the funding blocker. Public native E2E now succeeds; see
`native-public-testnet-validation.md`. The pre-funding observations below remain historical evidence.
Studio-native development and production operation are still pending.

Mainnet NO-GO. Collection remains disabled; no participant payment destination or QR is displayed.
Baseline: PR #3 `2c72f29bfde804f53cd05c375d88bc4c3f56da94`, stacked on unchanged PR #2
`438d534aa88ccefb9a09504fa5076088b976881e`.

## Studio provenance

Existing project: https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710
Thread: `0aff6dd8-b25e-4a3b-80bd-f3a235f9c0b5`.
Reloaded the existing project and submitted a native-source review/test request at 17:36 JST.
The service returned **You've reached your daily limit**, with complimentary usage refreshing
tomorrow and an optional $10 higher allowance. No purchase was made. No native Studio development,
source import, review completion, or Studio-native test success is claimed.

Preview refresh continued to show **Connecting to sandbox**. The last working earlier view showed
the old Vault with an event-accounting link, not the new native interface. A previously downloaded
Studio ZIP (`changeback_m3ebyh.zip`) contains the unfinished receipt-proof mock but no native
escrow/factory. It is historical export evidence, not a new Studio export or native synchronization.
The unsafe proof prototype has not been adopted. Reopening or importing code alone will not satisfy
the native Studio development gate; actual edits, review and test logs remain required.

## Changes authored locally in this stage

- Added regression tests for actual router sender vs transaction origin, rollback of all failed-refund
  accounting and successful same-sender retry, and reserved short/excess funds despite unaccounted funds.
- Local signed keeper E2E now starts a fresh operating-system process on every pass. Six process runs
  cover scheduled payment, refunds, blocked recipient, recovery and two idempotent zero-job passes.
- Added a strictly read-only official-RPC probe with historical receipt/block verification,
  shared native/ERC20 balance comparison and unsigned factory deployment gas estimation.
- Prepared separate Testnet-only account generation and bounded public execution scripts. The public
  runner is preparation, not publicly exercised proof. It refuses writes without explicit flags/approval
  amounts, verifies chain/factory/registry/terms/budgets, bounds committed gas to 5 test USDC and
  participant principal to 30, and records the signed transaction hash before submission.
  Pending/unknown transactions stop progress; they must not be blindly replaced or cleared.

## Verification scope

| Check | Result |
| --- | --- |
| Solidity full suite | 130 passed, zero failures; native 20; six fuzz tests at 256 runs |
| Native final targeted suite | 20 passed after descriptive test-name adjustment |
| Accounting/keeper Node tests | 22 passed |
| App typecheck / production build | Passed; existing annotation/bundle warnings |
| Local normal transaction E2E | 30 collected = venue 12 + staff 2 + refund 16; zero balance/liability |
| Local short/excess/rejecting sender | 27 fully returned; failed sender isolated then same sender retried |
| Independent local readback | 27 successful receipts, block hashes, empty calldata and sender/value/events checked |
| Graceful process restart | Six distinct process IDs; state reloaded; no double refund; zero-job repeat |
| Crash during broadcast / stale lock | Not tested or resolved; no crash-resilient operation claim |
| Browser native wallet transaction | Not performed; no wallet import or unrelated account access |

Foundry/build needed an unsandboxed retry because Windows sandbox directory access prevented
compiler/config discovery. The read-only RPC probe needed network access. These failures were
environmental; the subsequent successful logs are preserved separately from initial attempts.
Existing installed dependencies were reused; no clean dependency installation claim is made.

## Public Arc read-only results and funding gate

At block `68833358`, the existing escrow `0x1E06FC86AFde4443F025b010e15b8Eec04b41eBB`
still has 30/14/16 ERC20-unit accounting, zero liability and zero native/ERC20 balance. All sixteen
historical receipts succeeded and matched canonical block hashes. These are **register/approve/pay**
transactions, not native single-send evidence.

At the same block the old organizer's ERC20 balance equaled its native balance divided by 10^12
with integer truncation. This is an observed shared-balance read, not a native callback test.
The new factory unsigned gas estimate was 2,364,921 at 25 gwei = 0.059123025 test USDC;
with 20% gas padding, 2,837,906 gas = 0.07094765 at that price. Re-estimate before broadcast.

The user explicitly approved **30 test-USDC principal plus total gas up to 5 test USDC** in this
chat. Mainnet, real funds, Studio allowance purchases and DoraHacks changes remain unauthorized.
Fresh dedicated Testnet keys were generated outside the repository and are excluded from deliverables.
The old test keys remain in Studio outside its project and were not extracted.

The official faucet request for the new organizer encountered unusual-traffic verification and
a reCAPTCHA connection failure. No faucet receipt or funding success was observed. The user elected
to try manual verification. Until funding is confirmed, no new deployment/send can be performed.
The runner requires organizer gas and 10.05 test USDC per participant (10 principal plus reserve).

Public native E2E, new native Tx hashes, native runtime review, wallet sends and live blocklist/
sub-micro dust behavior remain pending. Never substitute local chain-ID-matched transactions for them.

## Organizer and keeper readiness

The application UI is a local draft/JSON exchange. A shared intake service, access-controlled organizer
review queue, trusted-channel invitation confirmation, duplicate/impersonation resolution, approval
transaction preview, immutable paid-record linkage and a live native deposit/refund list are missing.
Names are not proven by a wallet address; shared exchange/router addresses cannot identify a human.
An approved shared router credits/refunds the router itself, as tested; exchanges must be rejected.

Keeper deployment needs a supervised host, one worker per state/lock, durable storage, secret storage,
gas-budget monitoring, pending/dropped-transaction recovery, stale-lock recovery after checking the
old process is absent, alerting, RPC outage drills and backup claim instructions. The current keeper
can leave its lock after a hard crash and has a broadcast-to-state-persistence gap. Fresh-process
success tests do not resolve those operational risks. Failed or blocklisted receivers retain liabilities;
there is no organizer redirection or arbitrary sweep. Mis-sent ERC20 remains unaccounted and can strand.

## Reproduction

Use the existing local instructions in `native-collection-mvp.md`; the updated E2E invokes the real
keeper CLI in separate processes. Run `native-testnet-readonly.mjs` with
`PREVIOUS_TESTNET_TRANSACTIONS` pointing to the prior 16-transaction manifest and
`NATIVE_READONLY_OUTPUT` pointing to an evidence path.

`native-testnet-accounts.mjs` creates a new directory (default `../testnet-keys`) and refuses to
overwrite it. `native-public-e2e.mjs` without a flag reads balances only. A separately reviewed,
funded run requires `--execute-approved-testnet`, `NATIVE_APPROVED_PRINCIPAL=30`,
`NATIVE_APPROVED_GAS=5` and an evidence output path. It waits for real block timestamps rather
than injecting balances or changing public time. This is an internal test harness, not a participant UI.

## Primary references

- https://docs.arc.io/arc/concepts/stablecoin-native-model
- https://docs.arc.io/integrate/infrastructure/indexing-events

Native 18-decimal and ERC20 6-decimal interfaces represent one balance. ERC20-interface transfers
emit a system mirror plus their own Transfer; never sum both. Contract NativePaid accounting remains
authoritative. Documentation is not a substitute for the still-pending live native E2E.
