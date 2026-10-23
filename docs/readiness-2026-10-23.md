# ChangeBack readiness review — 2026-10-23

Target supplied by the builder: November 1, 2026. Exact organizer cutoff and timezone have not been independently verified. This is a review branch, not a deployed release or permission to transact.

## Inspected baseline

- GitHub main at `5e18e3f`, production Solidity, Factory, harness and both existing contract suites, React steps, preflight checks, README, prior execution/submission documents.
- Public app loaded the completed Mainnet vault: 0.27 USDC contributed, 0 spent, 0.27 refunded, zero liability, Closed.
- DoraHacks build 50059 explicitly distinguishes the Mainnet recovery from the separate Testnet payment. The current submission is already more accurate than older local submission drafts.
- Existing Studio project was opened read-only. Its code tree and historical source comparison are visible; current source equality with this branch has not been claimed or established. No prompts or edits were sent to Studio.
- The referenced conversation supplies a comparison of 20 winning projects. That comparison is historical input, not a fresh independent audit of those 20 repositories or transactions.

## Findings and implemented responses

| Finding | Change / limit |
|---|---|
| No contract-level deposit cap | Added a 0.10 USDC cumulative Mainnet interface check using one fresh block snapshot, before approval and deposit, and again after fee preparation. Existing production contract remains unchanged. |
| Repeated 0.09 deposits could exceed the operational limit | Regression checks reject 0.09 + 0.09 and deposits after 0.10 or 0.27 total. Checks use all contributors' total, not the connected wallet's balance. |
| Direct token transfers bypass contribution accounting | Added visible instructions before deposit and a live stranded-surplus warning; local tests demonstrate stranded funds before and after Close. No recovery function exists. |
| Closed vault displayed a completed Spend checkmark despite no payment | Replaced inferred completion ticks with lifecycle position markers, an explanation, and explicit live paid/refunded totals. |
| First-time users face configuration without context | Added meetup scenario, first-use instructions, wallet guidance, exact approval/deposit explanation, review rules, and an explicit reviewed-factory selector. |
| Demo could be confused with network evidence | Added an interactive fictional scenario with persistent simulation labels; wallet button hidden in simulation. Actual Mainnet and Testnet records have separate links and descriptions. |
| Small amounts / similar recipient addresses can be misread | Payment proposals show full recipient addresses and exact 6-decimal amounts; approving/executing requires a proposal-specific review checkbox. |
| Accidental repeated deposit | Require review of amount, network, vault, fees and refund rules; clear amount after a confirmed deposit; preserve its receipt link. |
| Unavailable RPC could resemble a missing or zero balance | Vault details fail visibly when reads fail, phase loading has Retry, deposit checks propagate read failures. |
| Windows source-wiring test failed before assertions | Read source through its file URL instead of URL.pathname. |

Factory allowlists, vault-registration gate, wallet/selected-chain matching, exact token approvals, preflight simulations, transaction fee caps, fixed refund recipients, quorum, pause and deadline rules are preserved. No production Solidity or ABI changes.

## Local verification

| Check | Result |
|---|---|
| Solidity suites | 88 passing tests: 85 existing + 3 new; 4 fuzz tests use 256 cases each |
| Meetup lifecycle | Three wallets deposit 0.04 / 0.03 / 0.03, venue receives 0.03 after 2 approvals, early return gets 2 approvals, refunds 0.028 / 0.021 / 0.021, zero liability/balance, Closed |
| Insufficient approvals | Both payment and early return rejected with one approval |
| Other lifecycle errors | Duplicate execute, execution after early return and premature Close rejected in the new scenario; existing suites also cover duplicate votes/claims, overspend, outsiders, deadline boundaries, pause, reentrancy and blocked recipients |
| Cap limitation | Current contract accepts 3 × 0.09 from one contributor. This passing test documents the missing onchain cap; it is not a safe-cap test |
| Direct-transfer limitation | Mock ERC-20 transfers do not create entitlements; 0.01 remains after Close, another 0.005 is still accepted by the token and stranded |
| Frontend tests | 208 pass across 7 files, including 5 new cumulative deposit/preflight tests |
| Application types | Pass using `bun run typecheck:app` |
| Changed application files lint | Pass using existing oxlint, without auto-fix |
| Production build | Pass; dependency pure-annotation warnings and a large bundle warning remain |
| Full project types | Existing failure: missing `@circlefin/compass-chains` in deployment tooling. App-only type check does not conceal or repair this failure |
| Browser interaction | Fresh localhost preview: wallet-free simulation traversed all stages to completion; one-approval rejection message checked. Live Mainnet reads show paid=0, refunded=0.27, Closed; lifecycle markers no longer imply a payment. No wallet connected or transactions submitted |
| Visual screenshots / mobile | Chrome screenshot capture timed out; in-app browser capture succeeded. Inspected desktop landing view and simulation at 390 × 844; labels and cards wrap without horizontal clipping. Saved screenshots. Wallet dialogs and live transaction panels on mobile remain untested |

Tests execute in a local EVM with MockERC20; they do not demonstrate current Arc USDC restrictions, Arc native/ERC-20 shared-balance behavior, wallet signing, or network receipt fees. A fresh browser-based Testnet rehearsal remains a release gate. Previously published Testnet receipts are historical evidence only.

## Remaining release gates

1. Complete fresh Testnet UI rehearsal using three controlled wallets and a distinct recipient; collect receipt hashes, account deltas and final balances. Do not assume the local mock replaces this rehearsal.
2. Decide whether the existing contract's lack of an enforceable cap and direct-transfer recovery is acceptable for a small, sequential demonstration. Any contract redesign requires separate explicit approval, tests, bytecode review and a new deployment.
3. Review and merge the PR only when ready. Synchronize accepted application changes to the existing Studio project; compare source hashes and repeat Studio checks. Do not claim current Studio provenance for changes made only locally.
4. Approve frontend publication separately. The existing public app remains unchanged by this work.
5. Approve a specific Mainnet run with named wallets, recipient, principal and fee limits. Follow the separate runbook. Do not reuse the Closed vault or fund a predicted address.
6. Update receipts, video and concise submission wording after verification. Final DoraHacks publication requires explicit approval.

## How the winning-project lessons are applied

- Shwup / MergePay: one understandable meetup payment rather than a general treasury pitch.
- Setoff: successful settlement and rejected/failed paths are shown separately; refunds are transaction-triggered, not called automatic.
- AgentPay / vet402: evidence links, recipient deltas and failure limitations take priority over unverified claims.
- D20DAO / Pigeonhole: a judge can first try a short wallet-free path, then inspect actual network evidence. This does not imply equivalence to their architecture.

The value proposition is: “Collect a meetup budget, approve the venue payment together, and return everyone's unused share with a verifiable ending.” A Mainnet recipient payment and genuinely independent use are still unproven.
