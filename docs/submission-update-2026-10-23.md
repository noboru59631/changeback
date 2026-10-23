# DoraHacks update draft — not submitted

Use this only after reviewing which branch changes have actually been published and synchronized to the existing Studio project. Existing application deployment and DoraHacks text remain unchanged by this work. No new Mainnet payment is claimed. The older `microgrants-submission.md` is a historical conditional draft and must not be pasted as current fact.

## Suggested short description

Meetup budgets with shared approvals, proportional USDC refunds and a verifiable ending on Arc.

## Suggested update

ChangeBack helps a small group collect a meetup budget, approve a venue payment together, and return each contributor's share of the unused money. Payments need the configured quorum; execution and refunds require separate transactions.

The next interface introduces a guided wallet-free meetup simulation, first-use wallet guidance, exact payment review, explicit network/fee/refund rules, and links separating simulation, Testnet evidence and Mainnet evidence. These improvements are currently on a review branch; they are not yet deployed or re-synchronized to Studio. Local regression tests pass for three contributors depositing 0.04 / 0.03 / 0.03 USDC, a 2-of-3 payment of 0.03 to a recipient, quorum early return, proportional refunds of 0.028 / 0.021 / 0.021, and closure. These local tests use a mock token and are not Mainnet payment evidence.

Our verified Mainnet record remains the October 20 recovery demonstration: one contributor made three 0.09 USDC deposits, the group approved early return by 2-of-3, all 0.27 USDC principal was refunded, and the vault closed with zero liability and token balance. The original 0.10 USDC operational limit was exceeded, and no recipient payment was executed. Total network fees were 0.136070774 USDC, including Factory deployment. A separate historical Testnet run includes a 0.03 USDC recipient payment.

The review branch checks cumulative Mainnet deposits against 0.10 USDC in the interface. Existing contracts have no enforceable deposit cap; concurrent or external transactions can bypass the interface check. Direct transfers outside `deposit` are not refundable. Quorum collusion, token restrictions and transaction fees remain material limitations. This is a small-amount experiment without a professional security audit.

Evidence: [Mainnet release and receipts](https://github.com/noboru59631/changeback/releases/tag/mainnet-demo-2026-10-20), [Mainnet vault](https://explorer.arc.io/address/0x8073527729e7c9d1b4630C07f1E8ff48ad8640D0), [separate Testnet payment](https://explorer.testnet.arc.io/tx/0x6b9bfade75229751e9480c0ab3142217d3eee73821cb8c43c8267ac0f1ee440e).

## After future verification

Only after actual publication and new Mainnet receipts exist: replace review-branch wording, identify the exact deployed source commit and Studio source comparison, and add actual contributor identities/control status, payment receipt, refund receipts, Close receipt and total fees. Do not replace “no Mainnet payment” with the planned amount before execution. Keep the old recovery record labelled as a separate demonstration.

## 90-second judge path

0–15 seconds: name the meetup problem and show the group budget. 15–35: run the explicitly fictional simulation. 35–65: switch to actual evidence and open the chain-labelled receipts, showing paid/refunded figures. 65–80: show local rejection tests and explain that those are not mined failures. 80–90: identify limits and the exact next milestone. Until a new Mainnet payment is verified, say so directly instead of implying the simulation is evidence.
