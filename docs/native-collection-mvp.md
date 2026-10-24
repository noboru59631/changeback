# Native USDC single-send candidate — 2026-10-24

Status: local development candidate, NOT a released collection service. Mainnet NO-GO.
The user explicitly accepted standard/native USDC sending as an additional MVP candidate.
It is a different transaction path from ERC20 `transfer`.

## Decision and alternatives

| Method | Participant flow | Trust and failure boundary | Decision |
| --- | --- | --- | --- |
| Watch ERC20 Transfer logs | Apply + one token transfer | A watcher cannot update contract accounting by observation; RPC fields alone are not onchain proof | Never credit from monitoring alone |
| Authorized relayer reports receipts | Apply + one token transfer | An authorized reporter can invent sender/amount; enough balance does not establish ownership. Threshold reporters can collude or censor | Not enabled |
| Canonical header + receipt trie proof | Apply + one token transfer + permissionless proof submission | Must authenticate header, successful receipt, emitter, topics, value, log position and completeness; historical proof availability and recovery remain unresolved | No production verifier implemented or deployed |
| EIP-3009 authorization | Apply + wallet authorization signature | Atomic transfer/accounting, but requires participant signing; relayer can censor without gaining arbitrary transfer authority | Existing alternative, does not meet registration/signature-free preference |
| Native USDC `receive()` | Offchain application, organizer approval, one standard native send | EVM atomically supplies actual sending account and exact native value. No receipt oracle or admission relayer controls balances | Implemented and tested locally; public collection disabled |

An immutable interface or a mock verifier is not proof verification. The new release candidate
does not include the incomplete proof prototype produced in Studio. The prototype was seen
with an incorrect overspend test and non-sender refund parameters; it is not approved for use.

Arc USDC has one underlying balance with native 18-decimal and ERC20 6-decimal interfaces.
All native-candidate fee, budget, liability and refund values stay in native 18-decimal units.
There is no truncation to 6 decimals. Native value is not added to ERC20 balance.
Ordinary ERC20 transfers still bypass `receive()` and do not create a contribution.
Do not send them to this candidate or the old Vault/MeetupEscrow.

## Source provenance and Studio limit

The work starts at PR #2 SHA `438d534aa88ccefb9a09504fa5076088b976881e`.
The prior Studio residual-spend UI/helper and three Solidity regression tests were recovered
from its previous reviewed four-file patch and carried forward separately from the new code.

In this run, the existing Studio conversation was actually used for exploration, design,
receipt-verifier interface/mock/escrow sketches and test authoring. Before the native
implementation could be requested there, Studio displayed **You've reached your daily limit**.
No allowance purchase was made. An export attempt did not produce a confirmed downloadable
file. The partial proof sketch was not imported into this branch.

The native escrow/factory, its new tests, native ABI/reconciliation, keeper adaptation,
native local E2E and `?mode=direct` view were authored locally outside Studio after that limit.
They must not be represented as Studio-authored or Studio-tested. The old Studio project and
prior public Testnet evidence are retained; native-source synchronization to Studio remains pending.
The cached ChatGPT conversation did not expose earlier assistant message contents, so local
artifacts and the current GitHub PR were used as evidence instead of reconstructing claims.

## Accounting and authority

- Organizer approves a payer and salted name commitment after reviewing an invitation/application.
  Participants do not connect or sign for this application. Approval itself is an organizer transaction.
- Only approved payers may send native USDC, before the collection deadline. An expired unpaid
  approval rejects payment. Unpaid approvals can be revoked by organizer; after expiry anyone
  can release the unpaid slot. No public application alone occupies an onchain slot.
- Native incoming `msg.sender` is the refund beneficiary. There is no refund-destination field
  or destination-changing function, including for the organizer.
- Every successful positive native send is accounted in its transaction. Unknown/expired/late
  native sends and sends with unsupported calldata revert; the value is not accepted, though
  the sender still pays transaction gas. After a partial payment its original approval remains
  valid for top-ups until the collection deadline.
- `paidCount` increments only when cumulative payments first reach the fee. Multiple sends are
  supported and displayed separately from status; a duplicated RPC log is not a second payment.
- Spending cannot exceed `paidCount * fee`. Short payments and the amount above each full fee
  are reserved. Recipient, budget cap and schedule are immutable. Staff requires organizer
  approval of its exact fixed reward, once. Manual venue payments support residual amounts.
- At finalization, full-fee surplus is distributed equally with integer floor differences;
  overpayments are added back in full; short payments are refunded in full. Every native unit
  is conserved. Entitlements freeze before any refund. Crediting after settlement is impossible.
- Anyone may execute scheduled payments, finalize after the spending deadline and refund a payer.
  Keeper downtime does not revoke those rights. A failed refund rolls back only that claim;
  batching/keeper retry continues for other payers. Refunds never change beneficiary.
- Forced native transfers and ERC20-interface transfers are unaccounted, excluded from expenses
  and entitlements, and have no organizer sweep. Such funds may remain stranded. The ordinary
  ERC20 mock test establishes missing callback, not Arc's shared-balance implementation.

Invariants: `spent <= paidCount * fee`; after finalization `collected = spent + refunded +
remainingLiability`; native balance covers remaining accounted obligations. A balance surplus
is not evidence of a contribution or a license to withdraw it.

## Threat model and remaining risks

| Threat | Handling | Residual risk |
| --- | --- | --- |
| Claim someone else's wallet/name | Invitation + organizer checks through a trusted contact channel; unique approved wallet; immutable paid record | Sending proves a wallet movement, not a human identity. A copied address or public name is not sufficient approval evidence |
| Slot squatting | Organizer approval, unpaid expiry and permissionless expired-slot release; capacity <= 100 | Organizer may still approve malicious or mistaken applicants; expiry is not an automated invitation service |
| Registration edits | No paid-record replacement or refund redirect. Unpaid revocation/reapproval requires organizer | Correcting paid identity labels needs an explicit later process, not reassignment of funds |
| Shared exchange wallet | Unsupported; reject such applications and display warning | Refund goes to the shared sending address, possibly without exchange attribution. No manual redirect exists |
| Smart wallets/routers | Register actual sending contract, not `tx.from`; local sender-contract test | A router with a common sending address is ambiguous; a receiver may reject native funds or exceed 100k receive gas |
| Refund theft/reentry | Fixed sender, checks/effects, ReentrancyGuard; isolated retries | Blocklisted, destroyed, non-receiving or permanently incompatible sender may remain unrefundable |
| Forged/duplicate/mirror logs | Contract accounting is authoritative; only decoded NativePaid observation is a candidate in the helper; RPC duplicates deduplicated; conflicting/orphaned observations require review | Helper input flags/JSON are not cryptographic proof or a secure relayer input. Arbitrary unreviewed contracts may emit fake NativePaid logs |
| Reorg/provider inconsistency | Arc deterministic finality documented; reads pin block and recheck hash; generic orphan tests | An untrusted RPC can fabricate data. No browser read is authorization to transfer |
| Missing indexer/keeper | Native accounting does not depend on indexer, authority to claim survives service outage | Automatic service hosting/monitoring/restart drills still needed |
| Late or unregistered send | Native call reverts atomically; zero and unknown calldata rejected | Token/native confusion can bypass callback through ERC20; no recovery verifier is provided |
| Sub-micro-USDC dust | All accounting and payouts use native 18 decimals | Wallet display precision and Arc runtime blocklist behavior need live verification |

Do not confuse generic replay rejection with a proof of reorg safety. For the proof option,
`BLOCKHASH` serves 256 blocks; Arc documents EIP-2935 historical hashes, whose specified
window is 8191. A correct longer-history path still needs runtime checks, canonical header
encoding, receipt proof verification and a safe plan for windows missed during outages.
An authenticated receipt includes logs and a receipt position, not the transaction hash;
use block/transaction/receipt-local-log positions as proof identity and separately authenticate
a transaction hash if it is used for security. A finite proof window alone does not solve
late/unregistered transfer recovery or completeness before settlement.

## Verification and practical scope

- 127 Solidity tests pass, including 17 native tests and six fuzz tests at 256 runs each across
  the full suite. Includes capacity bound, manual venue residual cap, short/excess/dust,
  wrong-chain deployment, fixed sender, reentry and failed receiver retry.
- 22 targeted Node tests pass for old/new accounting and keeper behavior. This is not a claim
  that all historical Bun frontend suites were run. App typecheck and production build pass.
- Signed keeper local E2E: each of three participants sends one native value transaction
  with empty calldata. 30 collected = 12 venue + 2 staff + 16 refunded, zero balance/liability.
- Separate local edge event: 13 overpayment + 4 partial + 10 smart-wallet payment = 27;
  all 27 refunded. Rejecting smart wallet leaves a 10 liability, other payers complete;
  restoring that same wallet's receive function allows retry. Subsequent keeper passes send no transactions.
- A separate readback script fetched all 27 successful receipts/transactions, checked canonical
  local block hashes, the three empty-calldata 10-unit main sends, actual sender/event amounts
  and final accounting for both escrows. Evidence contains no signer secret.
- The local Anvil reports chain ID 5042002 but is NOT public Arc. Its native currency simulates
  USDC. No mock injection or clock manipulation is claimed as public Testnet evidence.
- The Japanese/English local browser application draft works without wallet connection or
  signing, rejects a repeated wallet, labels drafts unverified and keeps send addresses/QRs absent.
  Names are ephemeral until manually exported. Shared registration backend, organizer onboarding,
  live native contract UI reads and wallet payment rehearsal are not complete.
- Mainnet deployment and real funds are prohibited. No new public transaction was sent in this run.
  Previous public 30/14/16 results use approve+pay and do not verify the native path.

## Reproduce locally

Run `forge test`, `npm run events:test`, `npm run typecheck:app` and
`node node_modules/vite/bin/vite.js build`.

Start loopback Anvil on port 8548 with chain ID 5042002, compile with Forge, then run
`npm run events:native-local-e2e` and `npm run events:native-verify`. Both scripts refuse
non-loopback hosts. The E2E requires the Anvil client marker and uses mock time/native units.
The default JSON files are local artifacts; keep them outside version control or set
`NATIVE_E2E_OUTPUT` / `NATIVE_RECEIPTS_OUTPUT` to your artifact directory.

Keeper compatibility uses `MEETUP_KIND=native` with the existing explicit Testnet execution
flag, reviewed factory runtime hash, registry check, gas reserve, persistent nonce receipt
handling, lock and rotating refund cursor. The mode defaults to the original ERC20 flow.
Local E2E uses an ephemeral funded Anvil signer and removes its key/state/lock afterward.
No production native keeper service has been started.

## Release gates

1. Synchronize reviewed native code into Studio after usage access is restored; run tests/build
   there and save provenance. Discard or clearly isolate the unsafe partial proof prototype.
2. Review native source independently and deploy only a new Testnet factory/escrow with
   pinned code hashes. Verify factory membership and all immutable terms.
3. Public Arc E2E: native/6-decimal balance correspondence, actual native sender/receive callback,
   system and ERC20 mirror logs, empty-calldata wallet send with gas estimation, receive rejection,
   fee/blocklist behavior, refunds, exact 18-decimal dust. Never sum the two balance interfaces.
4. Test receipt persistence/restarts and deploy monitored keeper + invitation/application service.
5. Browser wallet rehearsal including smart-wallet receiving capability and clear native-versus-token
   instructions. Keep UI collection disabled until evidence and review are complete.
6. Mainnet remains a separate explicit user decision after these gates. No DoraHacks update here.

## Primary references checked

- [Arc stablecoin native model](https://docs.arc.io/arc/concepts/stablecoin-native-model)
- [Arc EVM differences, finality, native rules and EIP-2935](https://docs.arc.io/arc/references/evm-differences)
- [Arc event indexing and dual emitters](https://docs.arc.io/integrate/infrastructure/indexing-events)
- [Arc wallet integration](https://www.arc.io/blog/supporting-arc-in-wallets-one-balance-usdc-fees-and-complete-history)
- [Receipt and transaction trie separation](https://ethereum.org/developers/docs/data-structures-and-encoding/patricia-merkle-trie/)
- [EIP-2935 historical hashes](https://eips.ethereum.org/EIPS/eip-2935)
