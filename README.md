# ChangeBack

A time-bounded shared USDC budget built in Arc Studio. Participants collect funds, approve payments by quorum, and return unspent funds to contributors before closing the vault.

**Release status: pre-mainnet.** The existing Arc Testnet lifecycle completed with 0.10 test USDC deposited, 0.03 paid, 0.07 refunded, zero outstanding liability and a Closed vault. The public app is deployed and reads that vault. Reviewed frontend fixes are now reconciled with the existing Studio project. Mainnet deployment, transaction proof, video and grant submission remain pending. This package is ready for repository publication; it does not prove that a public GitHub repository exists.

## Links

- Arc Studio: https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710
- Builder: https://github.com/noboru59631
- Public app: https://changeback-arc.crypto5555111.chatgpt.site
- Public repository: PENDING (proposed: noboru59631/changeback)
- Mainnet Factory / Vault / payment transaction / video: PENDING

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

Mainnet writes remain disabled until an actual reviewed Factory deployment is registered. Do not paste a predicted address into the allowlist. Arc Studio's managed testnet deployment script is not a Mainnet deployment route.

## Review and limits

The historical Studio validation reports 83 passing Solidity tests. The testnet E2E above is real testnet evidence. The 2026-10-19 local review adds Mainnet preparation checks and bounded fees; its targeted frontend tests pass 134/134, frontend types and changed-file lint pass, and the production build succeeds. The full project typecheck currently fails in the existing deployment tooling because `@circlefin/compass-chains` is unavailable. No new Solidity changes were made.

**Use only small amounts.** This is an experiment and has not received a professional audit. Direct transfers that bypass `deposit` are stranded with no recovery path, including after closure. USDC freeze/blacklist restrictions can prevent refunds. Blocked claims retain their liability and can prevent closure. Other participants' claims can still proceed when their transfers are allowed. The contract has no administrator recovery or alternate refund address.

## Build provenance

The original contracts, tests and application were created in the Arc Studio project above. A local export was reused for review and targeted frontend fixes on 2026-10-19. Nine reviewed files were synced back to Studio, where 134 targeted tests, frontend types, changed-file lint and the production build passed. The subsequent Studio download matched all 41 application, production-contract and selected build-configuration files in the hosted release. Source hash records are in docs/release-verification.json. Hosting uses Sites; the application implementation remains the Studio-built code. Mainnet evidence must still be generated after explicit final approval.
