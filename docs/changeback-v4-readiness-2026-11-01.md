# ChangeBack v4 release readiness — 2026-11-01 JST

Status: ARC MAINNET BOUNDED E2E COMPLETE.

## Deadline

The official DoraHacks page displays `EVENT TIMELINE (UTC+9)` and `Deadline 2026/11/02 13:59`.
The same page body says submissions close November 1, 2026. Because those two official strings
conflict, use November 1 as the operational deadline and do not rely on the extra portal time.

Official page: https://dorahacks.io/hackathon/arc-microgrants-2/detail

## Verified now

- v4 local E2E: previously recorded PASS; not rerun.
- v4 Solidity suite: previously recorded 5 PASS; not rerun.
- keeper suite: previously recorded 41 PASS; not rerun.
- UI typecheck and production build: PASS after the v4 network configuration change.
- Public v4 UI: `https://changeback-v3-mainnet-proof.crypto5555111.chatgpt.site` (legacy slug retained; page title and deployed app are v4).
- v4 Testnet Factory: `0xe8DF3Ac08B2564CE5e4a902E1C96524EdE5A209F`.
- Testnet deployment tx: `0x0e061240383d96dd57ca7df1d464dce0445591356559764a72e2b0f3ca87684c`.
- Testnet creation hash: `0x0b1b09d8423c2b37062009ef1efa3150649f3a530c5f1c59c5ce2ca7e55c493f`.
- Testnet runtime hash: `0x8f61834dcbcda45dd1dcea8e9d0be1de3c040122af39ed84d332a8fc223b90bd`.
- Testnet runtime size: 10,002 bytes.
- Fresh Testnet `createEvent` simulation/estimate: 1,509,290 gas; no broadcast.
- Dedicated Mainnet 5042 Factory deployed at `0x7aa96CC4BBd373425F6EdEB4a120C1d3642D34Db`. Its constructor rejects every other chain.
- Mainnet Factory is one-event-only, operator-only, capacity 1, principal at most 0.01 USDC.
- Mainnet creation hash: `0x2119b632bd82bf3530cd342c2679fa1b6a28dd647c7e836741ad606aa1fbf97b`.
- Expected Mainnet runtime hash for operator `0x03607d…58b75`:
  `0xcb865c92e856232ecc9092bfae520f9c6c20408943ce18043aa73d580da5f6e8`.
- Fresh Mainnet deployment estimate: 2,331,762 gas; proposed limit 2,798,115 gas.
- Current Mainnet gas price read: 25 gwei. Proposed hard gas-price ceiling: 25 gwei.
- Mainnet operator pending nonce: 84. Conditional predicted Factory:
  `0x7aa96CC4BBd373425F6EdEB4a120C1d3642D34Db`.
- First Event address: `0x97bcAc6c8eCF585c49D42217A6d47D01420798F6`.
- Mainnet lifecycle receipts: deploy `0x2ec44be784b23a8f0760480b3d64f4160374a11bf800f20377f36b3fdea75821`; create `0xd6237ede71cff063210ca0dc8f5b7e82a016f8bc7c147862856c31a89614a6ad`; contribute `0x6b1bcb76574838e5aa6faa2d847eedbb42a5e4089a3b32956ac0573a4ff5c068`; approve `0x0f37fa251ccd520b1320c0e35f323d51d0621e69568d623d01ecd808cb18ea90`; pay `0x2030dcf13c47311e3d89e13aa34739c74a45af56d8cab7b85152d43e6db27d45`; finalize `0xbf139837592f36ac33c542879a78591205b6f11ef3dc098c0333b7950625b0bb`; refund `0x68514d1d9bfcfc6cb4981ef3c15c6accf4dc4892fa46452140bf89f2e2a89c6b`.
- Final readback: `totalCollected=0.01`, `totalSpent=0.006`, `totalRefunded=0.004`, `remainingLiability=0`, event balance `0` USDC.

Canonical machine-readable transaction data and limits are in
`docs/changeback-v4-approval-bundle.json`.

## Proposed minimal differential proof

One participant contributes 0.01 native USDC. The organizer approves an actual fixed-recipient
expense of 0.006 USDC. After the collection deadline, anyone may execute that payment. After the
expense deadline, the event finalizes and returns 0.004 USDC to the original participant address.
The proof must finish with `totalCollected=0.01`, `totalSpent=0.006`,
`totalRefunded=0.004`, `remainingLiability=0`, and event balance 0.

This specifically demonstrates the v4 difference: the actual expense amount is fixed only after
collection, remains under the immutable cap/recipient, and the exact remainder returns to the payer.

## Signing and roles

- Organizer/deployer/participant/keeper for the minimal demo:
  `0x03607de69C487BcC460eaD7C4Bdfd25805658b75`.
- Fixed expense recipient: `0x89A4EF745831CFe8957391Ad2e3CF55Dc3a6e502`.
- Signing method: EIP-1193 browser wallet confirmation. No private key is read, copied, or stored.
- Every transaction must be simulated immediately before the wallet confirmation.
- Abort if chain ID, sender, nonce/predicted address, code hash, terms, gas estimate, or gas price differs.

## Approval ceilings

At the 25 gwei ceiling:

- Testnet six-transaction E2E: gas ceiling 0.0707787 USDC; value 0.01 USDC;
  maximum loss 0.0807787 USDC.
- Mainnet seven-transaction full proof including Factory deployment: gas ceiling
  0.140731575 USDC; value 0.01 USDC; maximum loss 0.150731575 USDC.
- Mainnet Factory-only phase: value 0; maximum loss 0.069952875 USDC.

The full Mainnet sequence is conditional on receipt-by-receipt verification. Predicted addresses
are valid only while nonce 84 remains current.

## Remaining submission actions

1. Ensure the public repository contains the v4 source and this evidence record.
2. Update existing DoraHacks build 50059; do not create a duplicate submission.
3. Do not claim the existing v3 walkthrough video as v4; use the live v4 app and Mainnet receipts as the v4 proof.

## Safety review

No independent audit is claimed. The Mainnet Factory restrictions limit this demonstration's
exposure but do not make v4 production-ready. The contract's `refundClaimDeadline` is recorded but
not enforced, so refunds remain claimable instead of expiring. Multi-participant rounding/dust and
arbitrary recipient contract behavior require further review; the approved one-seat demo avoids the
rounding branch. The compiler's event-after-external-call lint warning concerns Factory deployment
of the fixed v4 bytecode and is not treated as a release blocker for this bounded demo.


