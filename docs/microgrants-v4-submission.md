# ChangeBack v4 — Arc Microgrants 2 submission draft

Status: MAINNET E2E VERIFIED. Ready for portal entry.

## Short description

ChangeBack v4 helps small groups collect a fixed participation fee, settle only the actual shared
costs, and return every unused unit of native USDC to the original payer. At event creation, the
organizer fixes each permitted recipient and maximum expense. After participants pay, the organizer
records the actual amount and a receipt hash. Anyone can execute an approved payment during the
expense window. When the window closes, the contract fixes each payer's refund; anyone can trigger
the transfer, but the destination can never be changed.

We built and tested the contract, keeper flow, and bilingual app in the existing Arc Studio project.
The v4 UI supports a shared participant link, one-action join-and-pay, actual-cost approval, public
payment execution, finalization, and original-payer refunds. The dedicated Mainnet Factory is
restricted to its deployment operator, one event, one participant, and 0.01 USDC total principal
for this bounded demonstration.

## Verified v4 evidence

- Arc Studio project: https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710
- Testnet Factory: https://explorer.testnet.arc.io/address/0xe8DF3Ac08B2564CE5e4a902E1C96524EdE5A209F
- Testnet deployment: https://explorer.testnet.arc.io/tx/0x0e061240383d96dd57ca7df1d464dce0445591356559764a72e2b0f3ca87684c
- Public repository: https://github.com/noboru59631/changeback
- Live v4 app: https://changeback-v3-mainnet-proof.crypto5555111.chatgpt.site
- Mainnet v4 Factory: https://explorer.arc.io/address/0x7aa96CC4BBd373425F6EdEB4a120C1d3642D34Db
- Mainnet Factory deployment: https://explorer.arc.io/tx/0x2ec44be784b23a8f0760480b3d64f4160374a11bf800f20377f36b3fdea75821
- Mainnet v4 Event: https://explorer.arc.io/address/0x97bcAc6c8eCF585c49D42217A6d47D01420798F6
- Mainnet event creation: https://explorer.arc.io/tx/0xd6237ede71cff063210ca0dc8f5b7e82a016f8bc7c147862856c31a89614a6ad
- Mainnet contribution tx: https://explorer.arc.io/tx/0x6b1bcb76574838e5aa6faa2d847eedbb42a5e4089a3b32956ac0573a4ff5c068
- Mainnet expense approval tx: https://explorer.arc.io/tx/0x0f37fa251ccd520b1320c0e35f323d51d0621e69568d623d01ecd808cb18ea90
- Mainnet expense payment tx: https://explorer.arc.io/tx/0x2030dcf13c47311e3d89e13aa34739c74a45af56d8cab7b85152d43e6db27d45
- Mainnet finalization tx: https://explorer.arc.io/tx/0xbf139837592f36ac33c542879a78591205b6f11ef3dc098c0333b7950625b0bb
- Mainnet refund tx: https://explorer.arc.io/tx/0x68514d1d9bfcfc6cb4981ef3c15c6accf4dc4892fa46452140bf89f2e2a89c6b
- Mainnet final state: totalCollected 0.01 USDC; totalSpent 0.006 USDC; totalRefunded 0.004 USDC; remainingLiability 0; contract balance 0.
- v4 walkthrough: the live app and linked Mainnet receipts are the primary v4 demonstration; no v3 video is represented as v4.
- Builder profile: https://github.com/noboru59631

## Result paragraph — use only after verification

On Arc Mainnet, one participant contributed 0.01 USDC through the ChangeBack v4 app. The organizer
approved an actual fixed-recipient expense of 0.006 USDC under the immutable cap. The contract paid
0.006 USDC and returned the remaining 0.004 USDC to the original payer. The final event balance and
refund liability were both zero. The linked Explorer receipts and live app show the complete
app-driven lifecycle.

## Existing v3 evidence, accurately separated

The repository also preserves a completed v3 Mainnet proof. It is prior evidence of the project and
is not presented as the v4 Mainnet lifecycle. The v4 submission must stand on its own verified v4
Factory, Event, real-USDC transaction, public app, and walkthrough.


