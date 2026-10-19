# Arc Microgrants — submission preparation

Status: NOT READY TO SUBMIT. Target deadline supplied by the user: November 1, 2026. Exact cutoff timezone is unverified. Do not wait until the last day. One project submission only; verify no prior Arc/Circle funding disqualifies this work.

## Required evidence

| Field | Value / status |
|---|---|
| Project | ChangeBack |
| Arc Studio | https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710 |
| Public app | https://changeback-arc.crypto5555111.chatgpt.site — publicly deployed; existing Testnet contract reads verified; Mainnet contract deployment and transaction proof remain pending |
| Public repository | PENDING — proposed noboru59631/changeback, not verified as created |
| Builder profile | https://github.com/noboru59631 |
| Mainnet Factory | PENDING — https://explorer.arc.io/address/ACTUAL_FACTORY_ADDRESS |
| Mainnet Vault | PENDING — https://explorer.arc.io/address/ACTUAL_VAULT_ADDRESS |
| USDC deposit | PENDING — https://explorer.arc.io/tx/DEPOSIT_TX_HASH |
| USDC payment | PENDING — https://explorer.arc.io/tx/PAYMENT_TX_HASH |
| USDC refund | PENDING — https://explorer.arc.io/tx/REFUND_TX_HASH |
| Close | PENDING — https://explorer.arc.io/tx/CLOSE_TX_HASH |
| Video | PENDING — public walkthrough showing Studio build and actual Mainnet payment |

Predicted addresses in the execution plan are not deployed-address evidence. Testnet links are supporting evidence only and do not meet the Mainnet requirement.

## English description — accurate before Mainnet launch

ChangeBack is a time-bounded shared USDC budget for small teams and temporary projects. Participants contribute to a vault, approve payments by an onchain quorum, and reclaim their proportional share of unspent funds when the spending period ends. Anyone can trigger refunds to the original contributors and close the vault once all refund liabilities are settled.

We used Arc Studio to build the Solidity contracts, tests and React application. The existing Arc Testnet lifecycle completed with 0.10 test USDC contributed, 0.03 paid, 0.07 returned and zero outstanding liability. We reconciled nine reviewed frontend files with the existing Studio project and verified all 41 application, production-contract and build-configuration files against its downloaded source. In Studio, 134 targeted tests, frontend type checking, changed-file lint and the production build passed. The publicly hosted application reads the completed Testnet vault. Mainnet deployment and a real USDC demonstration remain pending final approval. Transactions require wallet signatures; the application does not promise automatic execution.

## English submission text — use only after all evidence is verified

ChangeBack gives temporary teams a shared USDC budget with a clear ending. Members contribute during a collection window and approve payments through an onchain quorum. After spending ends, unspent USDC is allocated back to contributors in proportion to their deposits. Anyone can trigger each refund to its fixed recipient and close the vault after all liabilities are paid.

We built the contracts, tests and application in Arc Studio and used the existing project throughout development. Before launch, we reviewed permissions, payment execution, deadline boundaries, emergency pause and refund accounting, and reconciled the reviewed frontend changes with Studio. Our Mainnet walkthrough demonstrates real USDC moving through the public app: 0.10 USDC contributed, 0.03 paid and 0.07 returned, followed by zero outstanding liability and vault closure. The linked Explorer receipts and video document these actions.

ChangeBack is a small-amount experiment. Its next step is making short-lived team budgets easier to use and inspect. A quorum can spend approved funds, refunds require submitted transactions, and direct transfers outside the deposit flow are not recoverable.

The paragraph above is a conditional draft, not a statement that Mainnet launch or Studio reconciliation has already happened. Replace the amounts if the final approved demonstration differs, verify all claims, then remove this instruction before submission.
