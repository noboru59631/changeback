# ChangeBack v3 — judge quick path

App: https://changeback-v3-judge-mainnet.crypto5555111.chatgpt.site

## Inspect the completed proof

Open **Verified proof**. No wallet is required. Confirm the live Arc Mainnet totals:

- 0.020 native USDC collected
- 0.002 USDC paid to the fixed staff recipient
- 0.018 USDC refunded to the two original senders
- 0 USDC remaining liability

The receipt list links each important action to Arc Explorer.

## Run your own bounded Mainnet event

Arc Mainnet uses native USDC for both transaction value and gas. The demonstration is contract-capped at 0.03 USDC total principal. Every write is simulated and shown for confirmation before the wallet opens.

1. Open **Launch a demo**, connect a wallet, and switch to Arc Mainnet (chain ID 5042).
2. Select **Review Factory deployment**. Confirm the network and zero transfer value, then sign in your wallet. The new Factory permits this wallet to create exactly one event.
3. Set capacity, per-person fee, collection/settlement minutes, staff recipient, and staff cap. Select **Review event creation** and sign.
4. As organizer, enter a participant wallet and select **Review approval** before collection closes.
5. Connect the approved participant wallet and deposit the exact displayed fee as native USDC. Do not use an ERC-20 approve/transfer route.
6. Reconnect the organizer and authorize the fixed staff budget after enough full participant deposits exist.
7. After collection closes, any wallet may execute the authorized staff payment.
8. The organizer may finalize after collection closes; after the spending deadline, anyone may finalize. Reserved staff must be settled first.
9. Connect each participant wallet and claim its calculated refund. Refund destinations cannot be redirected.

Use **Refresh onchain state** after changing wallets. Never sign if the wallet shows a different chain, destination, or value than the app confirmation.

## Preserved deployment limitation

The original Factory `0xAEE87C6fcB12023BAEE096e2B01d8667626f8a36` is intentionally one-event-only and already reports `hasCreatedEvent = true`. The completed Event `0xfaA58b67BF24Bc9AB92959339105F6e59901d323` is therefore preserved as read-only proof. The Launch flow deploys the same bounded v3 Factory bytecode from the judge's wallet so the full lifecycle remains operable without changing the original evidence.
