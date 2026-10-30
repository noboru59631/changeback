# ChangeBack v3

ChangeBack is a small-event settlement protocol for Arc. Participants pay native USDC once; the contract enforces predeclared expense limits and returns the remaining principal to the original payers after finalization.

This repository contains the v3 contracts, keeper tooling, and a read-only public proof UI. It is an Arc Microgrants 2 submission candidate.

## Mainnet proof

The v3 Mainnet demonstration completed with no funds or refund liabilities left in escrow.

| Item | Result |
| --- | ---: |
| Participant deposits | 0.020 USDC |
| Staff settlement | 0.002 USDC |
| Refund to participant A | 0.009 USDC |
| Refund to participant B | 0.009 USDC |
| Total refunds | 0.018 USDC |
| Final escrow balance | 0 USDC |
| Final refund liability | 0 USDC |

- v3 Factory: [`0xAEE87C6fcB12023BAEE096e2B01d8667626f8a36`](https://explorer.arc.io/address/0xAEE87C6fcB12023BAEE096e2B01d8667626f8a36)
- Demonstration Event: [`0xfaA58b67BF24Bc9AB92959339105F6e59901d323`](https://explorer.arc.io/address/0xfaA58b67BF24Bc9AB92959339105F6e59901d323)
- [Staff settlement](https://explorer.arc.io/tx/0xb8f6aa0445d70c3f02d9e866e6fba09b4be9ba522ba0edbb9d5851c50812995c)
- [Finalization](https://explorer.arc.io/tx/0xeb1ecd0bf3edbb37d3eeb8653b5c3f31a3a7c8ed3958d12cbd87fefab1584747)
- [Final refunds](https://explorer.arc.io/tx/0x42a04254eed02d6313b9b11f70eede4a3b34ab7892d1e39acbcb57dbb5f9bbe1)
- [Arc Studio project](https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710)
- [Read-only v3 Mainnet proof UI](https://changeback-v3-mainnet-proof.crypto5555111.chatgpt.site)
- [42-second v3 evidence video](https://changeback-v3-mainnet-proof.crypto5555111.chatgpt.site/ChangeBack-v3-Arc-Mainnet-proof-demo-2026-10-31.mp4)
- [DoraHacks submission](https://dorahacks.io/build/50059)

Both participant records report `claimed=true`. Independent read-only RPC verification also confirmed `contractVersion=3`, the Factory/Event code, totals, expense accounting, final balance, and liability.

The scheduled venue payment was **not executed** because its configured time window had already passed. This proof therefore establishes participant deposits, a preauthorized staff settlement, finalization, and exact pro-rata refunds. It does not claim that the venue leg or a fully unattended production service was demonstrated.

## Safety model

- Native USDC only; Arc native USDC uses 18 decimals.
- Factory creation is operator-restricted and bounded for this demonstration.
- Event principal and participant capacity are capped.
- Expenses cannot exceed their immutable budgets.
- Reserved staff compensation cannot be consumed by other expenses.
- Refund recipients are the original participant addresses and cannot be redirected.
- Failed refund delivery remains visible as a fully backed liability.
- The public Mainnet proof UI is read-only and does not request signatures or transfers.

Do not send funds to any address in this README. The demonstration Event is finalized.

## Local verification

```bash
npm install
npm run typecheck:app
npm run build
```

The complete repository also includes Foundry contract tests and keeper/accounting tests. The previously completed release suite recorded 39 passing checks; the final publication pass reran the public app typecheck and production build and performed fresh read-only Mainnet verification.

## Repository map

- `contracts/` — v3 Factory and Event contracts
- `src/` — public UI and event-accounting code
- `scripts/` — deployment, keeper, recovery, and verification utilities
- `docs/` — operating limits, validation evidence, and security notes
- `.openai/hosting.json` — isolated public proof-site configuration

## Historical separation

The earlier public ChangeBack UI and its original Vault remain unchanged. The v3 proof is published as a separate site and points to the new Factory and completed Event so that historical evidence is preserved.

## License and status

Hackathon prototype and public proof. Review the contracts and operating limits before any reuse with real funds. No audit or production-readiness claim is made.



---

# Historical v1 Mainnet proof (2026-10-20)

The material below is preserved unchanged as the earlier Vault demonstration. It is separate from the v3 settlement proof above.

A time-bounded shared USDC budget built in Arc Studio. Participants collect funds, approve payments by quorum, and return unspent funds to contributors before closing the vault.

**Release status (2026-10-20): Arc Mainnet deposit, quorum-approved early return, full refund and vault closure completed; walkthrough video published.** A total of **0.27 USDC (0.09 × 3)** was deposited, early return was executed after **2-of-3 approval**, and the full **0.27 USDC** was refunded to the contributor. The vault is **Closed**, with zero token balance, outstanding refund liability and remaining contributor-to-vault USDC allowance. Total gas across **14 actual transactions: 0.136070774 USDC**, including Factory deployment.

**No recipient payment was executed on Mainnet.** Deposits exceeded the originally approved **0.10 USDC principal limit**, so the payment demonstration was stopped and recovery prioritized. The **0.03 USDC recipient payment belongs to the separate Testnet demonstration**. This Mainnet result demonstrates the deposit/early-return/refund/close path, not the originally planned payment path.

Start with the [Mainnet release, video and primary evidence](https://github.com/noboru59631/changeback/releases/tag/mainnet-demo-2026-10-20) and the Explorer links below. The [2026-10-19 execution status](CURRENT_STATUS.md) and [execution record](docs/mainnet-execution.md) are historical preparation/deployment records; their pending items describe that earlier stage, not the completed result documented here.

## Links

- [Arc Studio project](https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710)
- [Public app — completed Arc Mainnet vault](https://changeback-arc.crypto5555111.chatgpt.site/?chainId=5042&factory=0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb&vault=0x8073527729e7c9d1b4630C07f1E8ff48ad8640D0)
- [88-second English walkthrough (MP4)](https://github.com/noboru59631/changeback/releases/download/mainnet-demo-2026-10-20/ChangeBack-Arc-Studio-demo-88s.mp4) · [English captions (SRT)](https://github.com/noboru59631/changeback/releases/download/mainnet-demo-2026-10-20/ChangeBack-English-captions.srt)
- [GitHub Release and evidence package](https://github.com/noboru59631/changeback/releases/tag/mainnet-demo-2026-10-20)
- [DoraHacks submission](https://dorahacks.io/build/50059) — submitted; **Under Review**, as reported by the submitter on 2026-10-20. This is a submission status, not an award or funding confirmation.
- [Builder](https://github.com/noboru59631) · [Public repository](https://github.com/noboru59631/changeback)
- [Mainnet Factory](https://explorer.arc.io/address/0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb) · [Mainnet Vault](https://explorer.arc.io/address/0x8073527729e7c9d1b4630C07f1E8ff48ad8640D0)

## Mainnet evidence

Network: **Arc Mainnet (chain ID 5042)**. The [release's primary evidence JSON](https://github.com/noboru59631/changeback/releases/download/mainnet-demo-2026-10-20/ChangeBack-primary-evidence.json) contains the 14 transaction receipts, token transfers and final state snapshot. The walkthrough uses captured Studio, application and Explorer screens plus recorded approval evidence; it does not record new transactions.

| Step | Verified result | Explorer evidence |
|---|---|---|
| Factory deployment | Successful deployment; gas 0.06523910 USDC, included in the total below | [Deployment](https://explorer.arc.io/tx/0xb484da7b58284ebf3a0e9bc737e483729de304e8fb5c6fcc191a1a7409243136) |
| Vault creation | Three participants; approval threshold of two | [Creation](https://explorer.arc.io/tx/0x8a1c681123aa84a601b3bbb86ec4a89a623ad2966e190bef444af35f50db95d3) |
| Deposits | Three deposits of 0.09 USDC from the same contributor; 0.27 USDC total | [Deposit 1](https://explorer.arc.io/tx/0xc35211cfa468d6b6b28c530dcfc66ec926c2b13c6c797ad1c4dcc67e25010156), [Deposit 2](https://explorer.arc.io/tx/0xea0d3d74f02f58ffe841a10570dc4d5aa16dc777cd5500e9699db09536f6e1f7), [Deposit 3](https://explorer.arc.io/tx/0x2ef37be63e406931d625fb43d0c9e0f3bf3d4707bc81055e53fbf127bcf98795) |
| Early return | Proposed, approved by two of three participants, then executed | [Proposal](https://explorer.arc.io/tx/0x0406a86913f2a371d921bff8a6e6e9cb4e548c1ecbc01dd70e31179caf22b072), [Approval A](https://explorer.arc.io/tx/0xb13a76d2a853f5b806d285769ea0e1721c6a0a6cc06e9e5fe806afec238b8a63), [Approval B](https://explorer.arc.io/tx/0x9283619afc4f8d91e20e7903e0d310095c1641fa3f7e83eb70b206512745ee91), [Execution](https://explorer.arc.io/tx/0x1c55f6099403b884ab1af939f9060de137ff0b39c400db6b9b587569b49c49a7) |
| Refund | Full 0.27 USDC returned to the contributor through `claimFor` | [Refund](https://explorer.arc.io/tx/0x3a7848008eeffa80f86d8b84dd561964c4a5081b4e03197489de06dd8ee91dc9) |
| Closure | Vault Closed | [Close](https://explorer.arc.io/tx/0x016ed8b6b4b17f57f1b1a87c7b244395ae84920445e8084f057cfcb6c5782be0) |

Final accounting: `totalContributions = 0.27 USDC`, `totalSpent = 0`, `totalRefunded = 0.27 USDC`, `closed = true`, `totalRemainingLiability = 0`, vault USDC token balance `= 0`, and the contributor's remaining USDC allowance to this vault `= 0`.

The **14 actual transactions** comprise Factory deployment, vault creation, three exact token approvals, three deposits, one early-return proposal, two proposal approvals, early-return execution, refund and closure. Their receipt fees sum to **0.136070774 USDC**. Gas is separate from the 0.27 USDC principal refund; returning all deposited principal does not reimburse network fees.

The 0.10 USDC principal limit was an operational approval limit. Actual deposits totaled 0.27 USDC and therefore exceeded it. The response was to stop the recipient-payment demonstration and recover all deposited principal via quorum-approved early return. **Mainnet recipient payments: none; Mainnet spending: 0 USDC.**

## How it works

1. Create a vault with 2–20 sorted participants, a quorum of at least two, immutable collection and spending deadlines, and a participant guardian.
2. Participants approve an exact ERC-20 allowance and call `deposit` during collection.
3. Participants propose payments; quorum members approve them onchain. A separate transaction executes each approved payment.
4. Spending ends at the deadline or after a quorum-approved early return. Each contributor receives their proportional share of the unspent budget through `claimFor`.
5. Anyone can close the vault after all positive refund liabilities are settled.

Finalization, refunds and closure require transactions. There is no automatic keeper. The quorum can approve any allowed destination, including one it controls. A guardian can pause new activity; after 24 hours, or the original spending deadline if sooner, anyone can begin refunds. There is no unpause.

## Networks

| Network | Chain ID | RPC | Explorer |
|---|---:|---|---|
| Arc Mainnet | 5042 | https://rpc.mainnet.arc.io | https://explorer.arc.io |
| Arc Testnet | 5042002 | https://rpc.testnet.arc.io | https://explorer.testnet.arc.io |

USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`, 6 decimals. Native USDC gas has 18 decimals; these are two interfaces to the same funds, not separate balances.

## Testnet evidence

This is a separate **Arc Testnet (chain ID 5042002)** demonstration, including a **0.03 USDC recipient payment**, refund and closure. These transactions are not Mainnet payment evidence.

- Factory: https://explorer.testnet.arc.io/address/0x0cf03f85278a7d1ce3057b77043e1b9af3da2ec0
- Vault: https://explorer.testnet.arc.io/address/0x6450E88EFeF6Bd1aA80529765834af153cfDf386
- Payment: https://explorer.testnet.arc.io/tx/0x6b9bfade75229751e9480c0ab3142217d3eee73821cb8c43c8267ac0f1ee440e
- Refund: https://explorer.testnet.arc.io/tx/0xd9ed22d8c22119cbd23355b6d4131aa7cc4e8c0183003900c43d42d77aac0d8a
- Close: https://explorer.testnet.arc.io/tx/0x9ea45393c2d55052a912348395ce628367cfc5f439b6a55437a47fbe1d5227d4

## Development

React 18, Vite, TypeScript, wagmi v2, viem v2, Solidity 0.8.28, OpenZeppelin 5.1.0 and Foundry. EVM target: Paris, optimizer: 200 runs.

```sh
bun install --frozen-lockfile
bun run dev
bun run contracts:build
bun run contracts:test
bun test src/lib/mainnet-preflight.test.ts src/lib/payment-preflight.test.ts src/components/WriteGate.test.ts src/components/StepCreate.test.ts
bunx vite build
```

The receipt-verified Mainnet Factory is now registered in the reviewed allowlist. Other addresses remain gated. Never add an unverified predicted address to the allowlist. Arc Studio's managed testnet deployment script is not a Mainnet deployment route.

## Review and limits

The historical Studio validation reports 83 passing Solidity tests. The testnet E2E above is real testnet evidence. The 2026-10-19 local review adds Mainnet preparation checks and bounded fees; its targeted frontend tests pass 134/134, frontend types and changed-file lint pass, and the production build succeeds. The full project typecheck currently fails in the existing deployment tooling because `@circlefin/compass-chains` is unavailable. No new Solidity changes were made.

**Use only small amounts.** This is an experiment and has not received a professional audit. Direct transfers that bypass `deposit` are stranded with no recovery path, including after closure. USDC freeze/blacklist restrictions can prevent refunds. Blocked claims retain their liability and can prevent closure. Other participants' claims can still proceed when their transfers are allowed. The contract has no administrator recovery or alternate refund address.

## Build provenance

The original contracts, tests and application were created in the Arc Studio project above. A local export was reused for review and targeted frontend fixes on 2026-10-19. Nine reviewed files were synced back to Studio, where 134 targeted tests, frontend types, changed-file lint and the production build passed. The subsequent Studio download matched all 41 application, production-contract and selected build-configuration files in the hosted release. Source hash records are in docs/release-verification.json. Hosting uses Sites; the application implementation remains the Studio-built code. The [2026-10-20 Mainnet release](https://github.com/noboru59631/changeback/releases/tag/mainnet-demo-2026-10-20) packages the completed demonstration evidence and walkthrough against source commit `c7bd6606b737fe08c06cca0b67c3a8782c82b197`; it introduces no application code changes.
