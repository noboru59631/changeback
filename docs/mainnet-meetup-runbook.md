# Proposed meetup demonstration — approval required

This document does not authorize transactions, contract changes, or deployment. No transactions in this plan have been executed. The builder's target date is November 1; the exact organizer cutoff is unverified.

## Rehearse on Testnet first

Use three controlled contributor wallets A/B/C and a distinct, verified recipient R. Identify whether R is controlled by the builder or an independent venue/vendor. Do not describe a controlled recipient as an independent customer. Use exact allowances and execute every step through the candidate app. Save chain ID, contract addresses, transaction receipts, logs, before/after balances and zero remaining allowances. Rejected local/read-only simulations are not mined failure transactions.

Reproduce: create 2-of-3 vault → A 0.04, B 0.03, C 0.03 → wait for collection deadline → propose payment 0.03 to R → approve A and B → execute → propose early return → approve two distinct wallets → execute early return → claim A/B/C → Close.

Separately simulate one approval, duplicate approval/execute/claim, late deposit, expired proposal, overspend, blocked recipient and direct transfer using local tests or read-only calls. Do not deliberately strand real USDC or broadcast failures just to generate evidence. Mock blocked-recipient tests do not reproduce the entire live token blacklist implementation.

## Mainnet approval sheet — fill before signing

| Field | Required decision |
|---|---|
| Chain | Arc Mainnet, 5042; verify RPC chain ID |
| Factory | Existing reviewed `0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb`; independently verify runtime and provenance against the accepted source |
| Contributors A/B/C | Explicit full addresses and wallet owner/control status |
| Recipient R | Explicit full address, intended purpose, owner/control status and readiness to receive USDC |
| Guardian | Confirm actual creation output: current UI uses the lowest sorted participant address |
| Principal | Proposed maximum 0.10 USDC TOTAL: A 0.04, B 0.03, C 0.03; no further deposits |
| Payment | Proposed exactly 0.03 USDC once |
| Refunds | Expected A 0.028, B 0.021, C 0.021 |
| Deadlines | Current create UI sets collection at block time +1 hour and spend at +24 hours; review exact timestamps and local timezone before signing |
| Fees | Explicit per-action AND whole-run USDC gas ceilings, funding by account, plus a recovery reserve; obtain fresh estimates before approval |
| Network writes | List every approved action, including new vault creation, token approvals, early return, refunds and Close |
| Publication | Separate approval for frontend deployment and final DoraHacks update |

Use the existing Factory only; no Factory deployment is planned. Creating a new vault is itself a contract deployment and needs explicit approval. The previous Closed vault cannot be reused. Never fund a predicted/unverified address.

There are 19 happy-path transactions if each step is separate: one vault creation, 3 token approvals, 3 deposits, 1 payment proposal, 2 payment approvals, 1 payment execution, 1 early-return proposal, 2 early-return approvals, 1 early-return execution, 3 claims (first can lazily finalize), 1 Close. Any allowance cleanup, retries or alternate recovery adds transactions and must remain inside the approved budget. Network fees may exceed the 0.10 principal at this demonstration scale.

## Execute sequentially, reconcile every receipt

1. Confirm accepted source, fresh Testnet rehearsal and explicit Mainnet approval. Snapshot all four accounts and allowances. Keep operational gas reserves; native USDC fees and ERC-20 USDC spending share funds on Arc.
2. Create through the reviewed Factory. Validate receipt, emitted vault address, `isVault`, runtime, participants, threshold, guardian and exact deadlines before any deposit.
3. A approves exactly 0.04, deposits, waits for success and checks total=0.04 and allowance=0. B similarly checks total=0.07; C checks total=0.10. Never sign concurrently. No external participant/client should deposit during this controlled demonstration. The UI cap is not atomic or contract-enforced.
4. Read back full recipient and exact amount before payment proposal, each vote and execute. Wait for collection to end. Choose a whole-hour proposal validity that is within `spendUntil`; default 24 hours may exceed the remaining window, so use 1 hour when valid.
5. After execution verify successful receipt, `Executed` event, token transfer to R, `totalSpent=0.03`, vault accounting remainder=0.07 and recipient token delta. Reconcile R's gas separately if R also submits transactions.
6. Run the quorum early-return procedure. Deadline-based return is an alternative; it still needs claim/finalize transactions. Stop approving other spending proposals once return is intended.
7. Claim to A/B/C only, verify 0.028 / 0.021 / 0.021 token transfers. Verify `totalSpent + totalRefunded = totalContributions`, liability=0, balance=0, surplus=0, allowances=0. Then Close and verify final state.
8. Save chain-labelled receipt JSON, paid/refunded totals, all receipt gas fees and a short video. Publish only verified amounts and identify controlled wallets clearly.

## Stop conditions

Stop before signing if network/address/source/fee/amount differs, total would exceed 0.10, balances or allowances are unexpected, simulations fail, or evidence disagrees. Read chain state before any retry; do not sign a second transaction merely because the page is slow. Do not raise caps or extend scope without approval.

If deposits unexpectedly exceed the limit, stop new deposits and spending. Read-only assessment comes first. An already approved and still valid refund procedure may be used within its explicit scope; otherwise request approval for the concrete recovery actions and fees. If return votes are unavailable, spending expiry allows permissionless refund calls. A paused vault can return after 24 hours or the original spending deadline, whichever is earlier. Token freezes may still block claims and Close. Direct transfers have no recovery path in the existing contract.
