# ChangeBack — current execution status

2026-10-24 latest: the separately approved public native Testnet E2E completed with three
empty-calldata 10-USDC sends, venue 12, organizer-approved staff 2 and sender-fixed refunds 16.
Fourteen successful receipts, runtimes, sender/events, 18-decimal refunds and final zero balances/
liability were independently re-read. Actual aggregate gas: 0.14082205 test USDC, below the
approved 5; principal 30. Native-source Studio development is still blocked by its daily limit.
Collection remains disabled; no payment QR/destination is published. Mainnet NO-GO; PR #2,
existing Mainnet and DoraHacks unchanged. See `docs/native-public-testnet-validation.md`.
Earlier entries below are historical snapshots, including pre-funding/public-E2E blockers.

2026-10-24 later update: native-USDC single-send candidate added on a separate review branch.
127 Solidity tests and 22 targeted Node tests pass. Local signed-keeper E2E conserves 30/14/16;
an additional 27-unit refund/retry case completes. All 27 local receipts re-read independently.
Studio daily usage limit interrupted its proof prototype; native implementation is externally
authored and not synchronized into Studio. No new public Testnet/native transaction, Mainnet
operation or DoraHacks update. Public collection stays disabled. **Mainnet NO-GO.**
See `docs/native-collection-mvp.md`; earlier public Testnet evidence uses approve+pay.

2026-10-24: A separate Testnet-only event accounting MVP has been implemented on `feature/event-accounting-mvp`, based on PR #1. Local mock-USDC transaction E2E completes 30 collected → 14 spent + 16 refunded, with zero remaining liability and zero repeated keeper jobs. Public Testnet has only been probed read-only; no new public deployment, real-fund transfer, Mainnet operation or DoraHacks update is claimed. **Mainnet NO-GO. Ordinary direct-transfer collection is not implemented and must not be advertised.** See [the new design and release gates](docs/event-accounting-mvp.md).

The 2026-10-19 notes below are historical and do not authorize further Mainnet activity. The current user's separate-approval restriction controls all new Mainnet activity.

2026-10-19: The user approved the bounded fourteen-operation Mainnet demonstration. **Factory deployment has succeeded; Vault creation, application USDC transfers, refunds, closure and the walkthrough video remain pending.**

- Studio: https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710
- Public app: https://changeback-arc.crypto5555111.chatgpt.site/
- Verified Arc Mainnet Factory: `0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb`.
- Deployment receipt: https://explorer.arc.io/tx/0xb484da7b58284ebf3a0e9bc737e483729de304e8fb5c6fcc191a1a7409243136
- Runtime matches the reviewed artifact. Actual Factory network fee: **0.06523910 USDC**.
- Remaining aggregate network fee budget: **0.26423960 USDC**. Approved principal: 0.10 USDC. Total approved aggregate gas: 0.32947870 USDC.

The only Mainnet Factory enabled in source is this receipt-verified address. Mainnet proposal fee allocation and the demonstration memo match the approved plan. Studio focused verification: 45 pass / 0 fail; frontend types and production build passed locally. The historical 134 tests were not rerun wholesale. Production Solidity was not modified.

See [execution record](docs/mainnet-execution.md), [Factory receipt](docs/mainnet-factory-receipt.json), and [the prior gas estimate review](docs/current-mainnet-estimates.md). Older NO-GO and pending-Factory notes describe previous stages. This Factory receipt alone is not evidence of USDC moving through the app and does not complete grant eligibility.
