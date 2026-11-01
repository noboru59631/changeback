# ChangeBack v4 — collect first, settle later

`NativeMeetupExpenseSettlementV4.sol` is a separate, not-yet-deployed design for the
approved product policy:

1. The organizer approves a bounded participant list and immutable per-person fee.
2. Each approved participant deposits exactly once during the collection window.
3. After collection, the organizer records the actual expense amount against an immutable
   recipient and cap. The sum of approved, unpaid expenses can never exceed collected principal.
4. Anyone (including a keeper) may pay an approved expense. A failed recipient transfer reverts
   all accounting, so the approval remains retryable.
5. After the expense deadline, no new expense can be approved. Any pending approval must be
   explicitly reset or paid before finalization.
6. Finalization fixes the refund pool. Each original participant can claim only to their original
   address; the final participant receives the integer remainder so accounting is exact.

Safety properties:

- no arbitrary recipient at payment time;
- immutable expense caps and participant fee/capacity bounds;
- no organizer or keeper sweep function;
- no participant redirection or second deposit;
- `totalSpent + remainingLiability == totalCollected` after finalization;
- failed refunds remain unclaimed and backed;
- all calls are local/test-only until a separately approved deployment plan exists.

The v4 contract is intentionally separate from the already-published v3 proof and has not been
deployed to Arc Mainnet or Testnet. The v3 Mainnet event and its historical balances are not
used by v4.

