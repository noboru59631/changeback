# ChangeBack — current execution status

2026-10-19: The user approved the bounded fourteen-operation Mainnet demonstration. **Factory deployment has succeeded; Vault creation, application USDC transfers, refunds, closure and the walkthrough video remain pending.**

- Studio: https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710
- Public app: https://changeback-arc.crypto5555111.chatgpt.site/
- Verified Arc Mainnet Factory: `0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb`.
- Deployment receipt: https://explorer.arc.io/tx/0xb484da7b58284ebf3a0e9bc737e483729de304e8fb5c6fcc191a1a7409243136
- Runtime matches the reviewed artifact. Actual Factory network fee: **0.06523910 USDC**.
- Remaining aggregate network fee budget: **0.26423960 USDC**. Approved principal: 0.10 USDC. Total approved aggregate gas: 0.32947870 USDC.

The only Mainnet Factory enabled in source is this receipt-verified address. Mainnet proposal fee allocation and the demonstration memo match the approved plan. Studio focused verification: 45 pass / 0 fail; frontend types and production build passed locally. The historical 134 tests were not rerun wholesale. Production Solidity was not modified.

See [execution record](docs/mainnet-execution.md), [Factory receipt](docs/mainnet-factory-receipt.json), and [the prior gas estimate review](docs/current-mainnet-estimates.md). Older NO-GO and pending-Factory notes describe previous stages. This Factory receipt alone is not evidence of USDC moving through the app and does not complete grant eligibility.
