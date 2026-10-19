# ChangeBack — Mainnet execution record

2026-10-19. The user explicitly approved the fourteen-operation plan, control of A/B, submission rights and no previous Arc/Circle funding for this work.

## Factory deployment completed

- Chain: Arc Mainnet, 5042.
- Factory: `0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb`.
- Transaction: https://explorer.arc.io/tx/0xb484da7b58284ebf3a0e9bc737e483729de304e8fb5c6fcc191a1a7409243136
- User signed and submitted through their wallet. Receipt succeeded.
- Deployer: `0x03607de69C487BcC460eaD7C4Bdfd25805658b75`, nonce 50, native value zero, contract creation.
- Runtime hash matches the reviewed artifact: `0x44285755364ee21aa1338601d8fdf2dd50eaa6663cb2fc930af3a89f20954ebd`.
- Actual network fee: **0.06523910 USDC**.
- Remaining aggregate network fee budget: **0.26423960 USDC** out of 0.32947870 USDC. Failed or replacement transactions also consume this budget.

The receipt-verified Factory is now the only reviewed Mainnet Factory in the source configuration. The mainnet payment-proposal gas cap is 195000, and the early-return proposal cap is 132422, as approved. Testnet caps are unchanged. The Mainnet early-return memo hash matches the approved demonstration memo.

Focused Studio verification: **45 pass, 0 fail**, covering the changed write gate and Mainnet preflight behavior. Frontend type checking and the production build passed locally. The previous complete 134-test result is historical; it was not rerun wholesale. No Solidity source changed.

## Still pending

Vault creation, the 0.10 USDC deposit, 0.03 payment, 0.07 refund, closure, and the actual walkthrough video remain pending. Factory deployment alone is not proof of a USDC transfer through the application. No application funding transaction has yet been sent in this execution record.

The approved plan reserves a one-hour collection period and a twenty-four-hour spending deadline. Actual transaction parameters and gas must be checked in the current state before each user wallet signature. Submit the grant application only after the required Mainnet app transaction and video are verified.
