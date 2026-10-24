# Event accounting MVP — 2026-10-24

Status: development / Testnet-only source, Mainnet **NO-GO**. The new flow is separate from the existing quorum Vault. No existing Mainnet contract, public site, Studio project or DoraHacks submission was changed.

## Reused work and branch scope

PR #1 (`improve/november-submission`, head `3aa30c3`) already contains the onboarding, simulated meetup, deposit preflight, honest lifecycle evidence and 88 Solidity / 208 frontend tests. This branch builds on that head and should be reviewed against `improve/november-submission`, not duplicate those changes against `main`.

The interrupted previous Work checkout contained uncommitted `MeetupEscrow.sol` and `MeetupEscrow.t.sol`. They were retained and extended; the reserved `partial` test variable was repaired. No previous asset was discarded.

## Collection decision

An ordinary ERC-20 `transfer` updates the token ledger; it does not call a recipient accounting function. The recipient contract cannot derive a verified payer, transfer timestamp or transaction receipt from its balance. An offchain indexer observing a Transfer log cannot itself make that log authenticated contract state. Native Arc USDC and its ERC-20 interface share balances, adding a second source of balance changes.

| Candidate | Decision |
|---|---|
| Direct transfer to the existing Vault | Forbidden. It creates no contribution or refund entitlement and can strand funds. |
| Shared new collection address + trusted indexer credits | Not enabled. A compromised attestor could fabricate allocations or change refund ownership. A balance check alone does not authenticate the sender. |
| Separate inbox per participant | Deferred. It attributes an inbox, not necessarily the actual sender; third-party/exchange transfers, late deposits and recovery still need an explicit trust model. |
| Receipt proof verification | Deferred beyond November 1 MVP: requires verified canonical receipts/state, finality and replay handling, rather than accepting a user-supplied transaction hash. |
| New escrow `approve` + `pay` | MVP path. Token transfer and payer accounting succeed or revert atomically. Registration is sent by the payer wallet. |
| `receiveWithAuthorization` + `payWithAuthorization` | Implemented and mock-tested contract path. One signed token movement without allowance is possible under ERC-3009, but live Arc token compatibility, wallet support and a payment relay endpoint are not yet verified or enabled in the UI. |

**The requested wallet-native single ordinary transfer flow is not delivered. Do not advertise it as implemented.** Neither the old Vault nor the new escrow is an ordinary-transfer collection address. The new escrow exposes `unaccountedBalance` but cannot safely recover arbitrary unsolicited transfers. No owner sweep is provided.

References: [ERC-3009](https://eips.ethereum.org/EIPS/eip-3009), [Arc USDC addresses and precision](https://docs.arc.io/arc/references/contract-addresses). ERC-20 USDC uses 6 decimals; native gas balances use 18. A readable `DOMAIN_SEPARATOR` is not evidence that a complete authorization payment has succeeded.

## Implemented behavior

- A Testnet-only factory deploys one immutable escrow per event and records `isEvent`. Chain ID must be 5042002. The application checks the configured factory code hash and registration immediately before writes. A pasted event address cannot enable writes by itself.
- Immutable fee, capacity (1–100), collection/spending deadlines (within 90 days), metadata commitment, budget recipients/caps (1–20 lines), categories and staff-display preference.
- Registration binds the caller to a salted name commitment and an authorized refund destination. The default refund destination is the same registered wallet. Only that payer can update the destination before claiming; the organizer cannot redirect refunds.
- Partial contract payments are supported. Overpayments, duplicate full payments and payments at/after the deadline are rejected. Only fully paid memberships can fund expenses; partial payments remain reserved for full refunds.
- Fixed scheduled merchant payments become executable after their configured time, within the spending window. In this MVP the scheduled amount is exactly the immutable cap; it is not a variable invoice payment. The UI explicitly describes this. It is safe to choose manual payment instead when the final invoice is unknown.
- Staff payments are fixed, one-time, organizer-only payments. The keeper never authorizes staff completion. A staff recipient may also be a participant; that reward and their surplus refund remain distinct.
- Equal surplus refunds for fully paid participants, full refunds for partial payers. Cumulative integer rounding allocates every 0.000001 USDC in registration order. No payer receives more than one refund. Unaccounted funds are excluded.
- Organizer finalization after collection; anyone may finalize after the spending deadline. Early organizer finalization cannot cancel pending scheduled payments. After the spending deadline, unpaid schedules expire and the actual unspent pool is refundable.
- Permissionless individual refund calls and batches of up to 20. Batch failures are isolated with bounded per-recipient gas. A failure does not mark the recipient paid; the payer can change their destination and retry. Gas shortage can revert an entire batch, so the production keeper uses separate transactions by default.
- Japanese/English screen at `?mode=events`: create event, self-register, exact approval/payment, wallet and payment table, operations total, staff visibility choice, budget conditions, organizer staff confirmation, finalization, refund and JSON report.
- Names are local browser data with export/import. Imported names must match the onchain name commitment. There is no shared name server; registration of a display name is not proof of a real-world identity. Losing the local name proof does not lose onchain funds.
- UI display privacy is not chain privacy. Budget data and token transfers remain publicly observable; raw accounting JSON includes public onchain data.

## Keeper and gas responsibility

`scripts/meetup-keeper.mjs` performs one bounded pass. The default is dry-run; real sends require `--execute-testnet`. It verifies RPC chain ID, configured factory runtime hash and factory membership; a dedicated Testnet signer pays gas from its own balance. Event principal does not reimburse gas.

`scripts/meetup-keeper-service.mjs --execute-testnet` runs successive passes with a 30-second default interval and exponential backoff (maximum 300 seconds). It is implemented but **not installed or running against public Testnet**. Deployment and service hosting, uptime alerts and funding remain release tasks.

- Maximum 20 transaction attempts per pass. A rotating persisted cursor prevents 20 failing recipients from starving later participants.
- Every attempt reads current chain state and simulates first. Confirmed completed jobs are skipped on later passes. Onchain guards prevent double spending/refunding.
- Per-job gas estimate, 20% buffer, gas-limit cap, gas-price cap and native gas-reserve checks.
- Persisted pending transaction hashes are resolved before a later sending pass. Timeouts block further sends during the current pass. State files are written through rename; a process lock prevents overlapping local services.
- A crash after broadcast but before persistence is a residual recovery window. Check signer nonce and chain state before replacing/dropping a pending transaction. Dropped hashes require operator reconciliation; they are not blindly resubmitted. A stale lock after a crash requires checking no worker is active before removing that exact lock file. State/lock paths must stay on durable local storage; distributed coordination is not implemented.
- Blocked/paused USDC, failing recipients, unfunded schedules or insufficient gas produce retries/backoff. A permanently blocked refund needs the payer's permitted destination change or issuer resolution. No administrative confiscation path exists.

## Running and deployment

Use Node 24+ for the standalone `.mjs` scripts importing TypeScript, or the repository's Bun runtime. Restore the existing lockfile with `bun install --frozen-lockfile`. Install forge-std under `lib/forge-std` using the repository's existing remapping; this dependency is not vendored in the PR.

```text
forge test --summary
bun test
node --test src/lib/event-accounting.test.ts scripts/meetup-keeper.test.mjs
anvil --host 127.0.0.1 --port 8547 --chain-id 5042002 --silent
node scripts/meetup-local-e2e.mjs
node scripts/meetup-testnet-probe.mjs
```

The local fixture deploys a mock authorization token and sets its runtime at the Arc USDC address in loopback Anvil. **A matching chain ID does not turn this fixture into Arc Testnet evidence.** Fixture token minting and `anvil_setCode` are local only; the script refuses non-loopback RPC URLs.

For public Testnet deployment, prepare a new dedicated test signer and fund it with faucet USDC. Never use an existing Mainnet signer. Build first; then set `MEETUP_DEPLOYER_KEY_FILE`, optional `MEETUP_DEPLOYMENT_MANIFEST`, and run:

```text
node scripts/meetup-deploy-testnet.mjs --broadcast-testnet
```

Review the deployed runtime, compiler artifact, source and receipt independently. Only after this review set `VITE_MEETUP_FACTORY` and `VITE_MEETUP_FACTORY_CODEHASH` at build time. Empty values keep application writes disabled. For a worker, set `MEETUP_FACTORY`, `MEETUP_FACTORY_CODEHASH`, `MEETUP_ESCROW`, `MEETUP_KEEPER_KEY_FILE` and durable state/lock file paths. Private key contents must never be placed in `VITE_*` variables, committed, or logged.

Run a dry pass first, then a Testnet-only pass or the service. Use one service per signer/event or an external nonce coordinator; shared-signer distributed operation is not implemented. There is no Mainnet deployment implementation for this new flow.

## Verification and limits

| Check | Result on 2026-10-24 |
|---|---|
| All Solidity suites | 107 pass, 0 fail: prior 88 + 19 event tests. Five fuzz tests use 256 runs each. |
| All Bun tests | 219 pass, 0 fail: prior 208 + 11 reconciliation/worker tests. |
| Standalone Node tests | 11 pass, 0 fail. |
| Local transaction E2E | Three full payers contribute 30 mock USDC; a fresh ephemeral signer runs the actual keeper entrypoint and pays merchant 12; organizer pays staff 2. A blocked refund does not stop the other two; the payer changes destination, the keeper retries and completes total refunds of 16. Zero liability/balance; another worker pass signs zero transactions. Local-only key and state files are removed. |
| 100 registrations | Finalization gas asserted below 8,000,000 in the local test. This is not an Arc gas/fee guarantee. |
| Public Arc Testnet | Read-only chain ID 5042002, USDC decimals 6, code and authorization-domain read verified. No signed Testnet payment E2E. |
| Frontend | Production build passes. Japanese/English creation page and disabled write gate inspected in the browser. Wallet dialogs, names import and live event transaction panels have not completed a browser E2E. |
| Type checks / dependency warnings | Frozen-lockfile installation and application-only typecheck pass. Full project typecheck retains the existing missing `@circlefin/compass-chains` deployment-tool dependency. Dependency audit / bundle-size warnings remain; no unrelated dependency upgrades or deployment-tool repair are included. |

## Threat cases and residual risks

| Case | Enforcement / evidence |
|---|---|
| Address spoofing / wrong factory | Build-time factory hash + registry check; factory tests reject unknown events. Imported name commitments must match the payer's onchain registration. Real-world impersonation remains a social risk. |
| Source mismatch / exchange transfers | Only caller-funded `pay` or a valid payer authorization creates credit. Raw exchange transfers stay unaccounted; they cannot be assigned using a claimed transaction hash. |
| Duplicate, excess, replay | Contract payment limit, one-time authorization nonces, exact event recipient binding; reconciliation deduplicates identical logs and flags conflicts. |
| Underpayment | Reserved in full, never available to fund venue/staff. Full membership still required for a share of surplus. |
| Late / unsolicited deposits | Contract payment rejected; token-level raw transfers remain unaccounted and may be stranded. No automatic recovery claim. |
| Unauthorized expense / fund diversion | Immutable recipients, per-line caps, organizer-only manual payments, fixed staff amount, no arbitrary withdrawal method. Tests cover outsider calls, cap breach and failed arbitrary organizer withdrawal. A disclosed organizer-owned recipient is possible and must be reviewed before payment. |
| Refund failure / reentrancy | Rollback preserves liability; isolated retries, destination recovery and non-reentrant state transitions. Tested with blocked recipients, malicious token callbacks and fee-on-transfer tokens. |
| Registration griefing | Self-registration proves wallet control, not uniqueness. Unpaid registrations can exhaust slots; invitation controls, admission deposits, anti-Sybil limits and registration expiry are not implemented. |
| Indexing / reorg | Browser reads a single block snapshot; worker relies on live state. The pure log reconciliation engine is tested, but a production canonical Transfer indexer, reorg replay pipeline and source-of-funds recovery are not deployed. |
| Service/security | No independent audit, operational monitoring, production wallet security review or complete dependency remediation. Package audit warnings and large bundle warnings remain. |

## Action reduction and November 1 priority

For a 2-of-3 legacy event, two merchant payments plus one staff payment require at least 6 participant votes and 3 execution actions (9 payment actions, excluding proposal creation). The new scheduled merchants require zero post-setup human actions, and staff requires one organizer completion/payment action: 9 → 1 human payment actions (8 fewer, about 89%). There are still 3 onchain expense transactions, and proposal/setup work is not included in this comparison.

For 20 refunds, the running keeper removes 20 organizer refund submissions; it still sends up to 20 refund transactions and pays their gas. Finalization is another transaction. Batch support does not make refunds free.

Participant onboarding currently takes registration + approval + payment (3 wallet transactions when allowance is absent), compared with approval + deposit (2) in the old Vault. The desired one ordinary transfer experience is not achieved. ERC-3009 payment signing/relay could reduce payment actions after compatibility and wallet verification, but is not counted as shipped savings.

Before November 1: prioritize a dedicated funded Testnet rehearsal, signed-wallet browser E2E, venue/staff/refund receipts and service restart/failure drill; then name-sharing UX and invitation/registration-abuse controls. Receipt-proof direct collection, Mainnet deployment and real funds are outside this MVP release. **Mainnet NO-GO** until explicit approval, independent review and the remaining gates are met. Final DoraHacks changes require separate approval.
