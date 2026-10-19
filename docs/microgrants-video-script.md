# ChangeBack — 90-second walkthrough

Record only actual verified states. No simulated Mainnet screen or fabricated receipt. Hide notifications and unrelated browser tabs. Never show seed phrases, private keys or authentication data. The video is not yet recorded.

Public app: https://changeback-arc.crypto5555111.chatgpt.site . Studio source reconciliation and 134 targeted tests are verified. Mainnet transactions, contract addresses, public GitHub repository and actual video remain pending. The narration below is conditional on those future verified receipts.

| Time | Screen | English narration |
|---|---|---|
| 0–10s | Arc Studio project URL and project name | “This is ChangeBack, a shared USDC budget with a clear ending, built in Arc Studio.” |
| 10–25s | Studio contracts, test results and application source | “We used Studio for the Solidity contracts, tests and application. We reviewed permissions, duplicate payments, deadlines, emergency pause and refund accounting before launch.” |
| 25–35s | Public app URL, Arc Mainnet, verified Factory/Vault and 2-of-3 settings | “The public application is connected to Arc Mainnet. This vault uses a two-of-three approval quorum.” |
| 35–50s | Actual deposit receipt and payment proposal approvals | “One participant contributes 0.10 USDC. Two participants approve a 0.03 USDC payment.” |
| 50–65s | Execute payment and confirmed Mainnet Explorer receipt with token transfer | “This confirmed Mainnet transaction sends 0.03 USDC through the vault to the recipient.” |
| 65–80s | Early Return or expired spend window; claim receipt | “The spending period ends, and a claim returns the remaining 0.07 USDC to the contributor. Refunds need a transaction; they are not automatic.” |
| 80–90s | Closed, balance 0, liability 0; repo link | “The vault is now closed with zero outstanding liability. The public repository and Explorer links make the flow verifiable.” |

Collection lasts one hour in the current UI. Record short clips before and after collection; do not hide a failed transaction as a success. Show the full public Studio URL at least once and keep Mainnet chain and payment hash readable. If actual amounts or signer setup change, update narration to match receipts.

Capture checklist: Studio build/test history → public app domain → Mainnet chain → contract address → receipt success → exact ERC-20 Transfer amounts → Closed accounting → public GitHub. Publish the completed video at an accessible URL and put it in the submission record.
