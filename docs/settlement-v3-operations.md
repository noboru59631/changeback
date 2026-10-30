# Reserved staff settlement v3

This version repairs a concrete failure: the organizer's staff2 transaction executed 72 minutes
46 seconds after the original spending deadline and reverted `Not spending`. The historical
browser event recovered30 = venue12 + refunds18; it did not pay staff. The separate original
14-transaction public fixture completed30 = venue12 + staff2 + refunds16. Neither old event is
upgraded by this change.

## Payment agreement

New events have immutable collection, spending and settlement deadlines. Settlement ends24h
after spending. Staff recipients/caps are fixed in the event terms. An organizer must authorize
staff before the spending cutoff. Authorization reserves actual fully paid participant principal;
short payments, excess payments and unaccounted transfers cannot back it. The organizer can
cancel only before collection closes. After that, a backed commitment remains enforceable
through the grace period. Venue spending cannot consume staff reserves. No new authorization
or venue expense is allowed during grace. Anyone can execute an authorized staff payment.

Before authorizing staff, check that enough principal remains for BOTH venue and staff. There
is no guaranteed venue payment if full participant funding never arrives. Unapproved staff has
no contract payment commitment. The UI must describe that distinction before collection.

Before settlement expires, pending staff blocks finalization. A failed recipient send rolls back
payment accounting and keeps the reserve retryable. At expiry, unpaid commitments expire
explicitly during permissionless finalization and their funds join participant refunds. Refunding
always uses the original sender; incompatible receivers may retain unpaid refund liabilities.
No operator may redirect those refunds or sweep their backing.

## Keeper

`MEETUP_KIND=native-settlement` selects v3, verifies contractVersion3, the configured factory
runtime hash and membership. Legacy `native` retains its original scheduling behavior.
The keeper's Mainnet mode requires a separately approved, exact bounded-demo manifest and
explicit execution flag. No such approval is active; the app deployment config is disabled.
Mainnet support is prepared, not publicly executed. Run only on Linux; Windows directory
fsync durability is unsupported and execution fails closed. A funded dedicated signer belongs
to one event, one journal and one operator. Never share its key with participant wallets.

Signed bytes, nonce, expected hash and worst-case gas reservation are durably saved BEFORE
broadcast. A crash resumes the same signed bytes; unknown nonce consumption, unavailable
RPC, identity mismatch or noncanonical receipt stops reconciliation. A receipt-clear save
failure preserves the pending object and stops the entire pass. Shutdown prevents new jobs
and broadcasts, retaining any prepared transaction for reconciliation on restart.

### Hard-crash recovery

1. Stop the service supervisor. Confirm the exact old PID is dead on the lock's recorded host.
2. Confirm no other worker/host is using this signer. A local PID alone cannot prove this.
3. Preserve the lock, state, temporary journal and service logs in private storage. Do not publish
   journals: pending entries contain signed transactions that can be broadcast by anyone.
4. Read the pending hash on the configured chain. Check canonical receipt and confirmations,
   sender/nonce/destination and event accounting. A consumed nonce with no matching receipt
   requires manual investigation; do not clear pending or create a replacement transaction.
5. Only after the old worker is fenced, move its stale lock aside. Keep the same journal and
   signer, original identity and cumulative gas reservations. Restart one Linux worker.
6. Verify reconciliation completes, staff reserves obey grace and expiry, and refunds converge
   to zero liabilities. A rejecting sender remains a visible unpaid liability, never success.

An underpriced or persistently pending transaction requires operator intervention. Automatic
fee replacement is intentionally not implemented: it would need durable candidate hashes,
same-nonce checks and an independently authorized cumulative gas bound. Do not bypass this
by deleting a journal. Monitor service failures, pending age, remaining grace and liabilities.
The service currently has console diagnostics, not externally delivered alerts or production SLA.
No unattended hosting or fully automatic hard-crash recovery is claimed.

## Controlled Mainnet demonstration gate

No Mainnet deployment or real USDC movement has been authorized in this session. Prepare a
separate factory/event on chain5042 using https://rpc.mainnet.arc.io; never reuse old Vault or
Testnet addresses. Native USDC is18 decimals, ERC20 USDC at the system address is6 decimals;
these are interfaces to the same balance, not two spendable balances. Ordinary ERC20 transfer
is unsupported by collection accounting and must never be offered as a payment route.

Before requesting approval, record the exact source/artifact hashes, deployment bytecode size,
gas estimates and total gas ceiling; proposed organizer/participant/venue/staff addresses;
per-person principal; expense caps; deadlines and final refund expectation. Configure the app
and keeper with independently checked new runtime/membership and chain. Mainnet support is
a separate reviewed release step, not an RPC replacement. The demo must stay invite-only,
with bounded capacity and principal; no general or unlimited collection is allowed.

Show the concrete transaction plan to the owner immediately before deployment/real transfers.
Wallet signing and real asset transfers require the owner's participation. Approval must not
be inferred from a historical Testnet allowance. DoraHacks update/submission separately needs
approval of the completed text, links and video. Final video needs authentic Studio screens and
actual new Mainnet hashes. Pending work is never represented as a completed demonstration.

