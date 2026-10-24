# Public native Arc Testnet verification — 2026-10-24 JST

**Success on public Testnet; Mainnet NO-GO; general collection remains disabled.**
This completes the native public transaction gate, not Studio-native development, browser-wallet
payment rehearsal, independent security audit, or production keeper/application service readiness.

## Authorization and provenance

The user explicitly approved 30 test-USDC participant principal and aggregate gas up to 5 test USDC.
The user then completed the organizer's faucet request and separately approved receiving the faucet's
fixed 20 test USDC into each of three dedicated participant accounts. Four accounts received 20 each;
each participant contributed only 10. Unused test balances stay in their dedicated accounts.
No real funds, Mainnet transaction, Studio allowance purchase, or DoraHacks update occurred.
The prior automated-review rejection of 20-token faucet requests was resolved by that explicit approval.

Code was authored locally. Studio's daily limit and preview synchronization issue remain unresolved;
native code must not be described as Studio-developed or Studio-tested. No new Studio edit is claimed.
The runner uses actual block timestamps, local Testnet-only keys, explicit approval flags, chain-ID
checks, factory runtime equality, registry/terms/budget checks and cumulative committed gas/principal
bounds. It signs the transaction, records its hash, then broadcasts. No mock balances or time travel
are used on the public RPC. Keys remain outside the repository and evidence archives.

## Deployment and settlement

- Network: public Arc Testnet, chain ID 5042002; official RPC `https://rpc.testnet.arc.io`.
- Factory: `0x9b910c9c6715ef715dc591bb2927e7e79a96641f`.
- Event: `0x6FBab91686f4726fcFC9D4FFBA8210c2FaDE2A9B`.
- Factory runtime hash: `0xd93cb7825dc0f10d73b1b905b1f657f588f7c05fe66514107cc911bf00c6f0f9`.
- Event runtime hash: `0x61c8143581a74174b8340924e749a2380504f8dcc1416fcf426ac849d1a7fbfc`.
- Fee 10, capacity 3, collection window 180 seconds, spending deadline 600 seconds after setup.
- Three organizer approvals precede three participant transactions. Each participant signs just one
  native value send with empty calldata; no participant registration/approval/pay transaction.
- 30 collected = venue 12 + fixed organizer-approved staff 2 + sender-fixed refunds 16.
- Refunds: 5.333333333333333333, 5.333333333333333333, 5.333333333333333334 USDC.
- Remaining liability 0, native balance 0, ERC20 balance 0, unaccounted balance 0.
- Actual sum of all fourteen transaction fees: **0.14082205 test USDC**.
- Sum of conservative gas-limit commitments: 0.171835375 test USDC; approved ceiling 5.
- The keeper engine `runKeeper` executed the scheduled venue payment and refund jobs through the
  bounded runner. A second refund pass planned/sent zero jobs and organizer nonce stayed unchanged.
  This is not a continuously hosted service or a public keeper-process crash drill.

## Transactions

All hashes below are actual public successful receipts, independently re-fetched with transaction and
canonical block hashes. They are separate from the older approve/pay event and local Anvil hashes.

| Action | Public transaction hash |
| --- | --- |
| Deploy factory | `0x8919cf693778905c273ed1a26452e053365deb2e6764b965015872e6bf7606cf` |
| Create native event | `0xa23557ae88ccf899d33388130d708710dec0a8390e83c7494f8249add7d0c6c3` |
| Approve A | `0x4b5af7b89a033421eb5e3bd13577479d2c1eb6015b2a36e877687397e90d2f17` |
| A native send 10 | `0xa06c06092cef38ea814991d0f61cb8cdcaee059f628e6ffeb8c13d682ff0b795` |
| Approve B | `0xec088821c5a3cbd1a8c09051fa99c407024fe3aa2dc3528f3d115b8e11e0661f` |
| B native send 10 | `0x7705acaaf2bebff065c67aa07432b7b708db03057b4f9028d60183c0733b394c` |
| Approve C | `0x721dacc859ea5c7f3b38f7133eba3f42ce1d407cbdf160bedd89a030b9ee11c2` |
| C native send 10 | `0xe802f2ee17e3fc8542a4001b9113f9251706505f5c3efb84162de637b21bd11d` |
| Keeper venue 12 | `0x1c9abbf6e4039e3727ed147b1cee5895aa84859a561f74bfe1f6294791596fa3` |
| Organizer staff 2 | `0x8b5da9aa09429ef0ad1f7e86794de05c5cc3e945087a3404fdf6eee6a2e11adf` |
| Finalize | `0xe7f4d0f0f7440e69d70f55382f955e9235f04ccd2a31c3ed2af01b983d34b301` |
| Refund A | `0xc26d421c5e9bc4f2d59c8a2a74aa5ce6bad247f24074502913a6564ad74bfeaf` |
| Refund B | `0x014795cd99c16d0a9716384310408298b89b6b3ac277c53702d9895ab0e64d55` |
| Refund C | `0x12103274841aeb4f7f214924d0bcdaf69c3783a38cc8e678425d2f9e1719f691` |

Explorer base: `https://explorer.testnet.arc.io/tx/` plus a verified hash.

## Independent verification and screens

`verify-native-public-e2e.mjs` re-fetches all fourteen receipts/transactions and canonical blocks,
checks actual gas against approved commitments, factory code equality, event runtime equality after
masking compiler-declared immutable slots, then checks organizer and creation-block immutables.
Factory membership, terms, expenses, participants and final accounting are read at one pinned block.

Each native deposit has input `0x`, value 10, actual sender matching exactly one NativePaid event
and one system-emitter Transfer. No ERC20 mirror log exists for these native deposits. Each refund's
system Transfer returns precisely the frozen 18-decimal entitlement to the original sender.
The three final payer native balances equal faucet20 minus fee10 minus actual send gas plus refund;
ERC20 balances equal native balances divided by 10^12 with truncation. The final readback block was
68838535. These checks establish live fractional-native refund behavior as well as conservation.

The unchanged local app at `http://127.0.0.1:5191/?mode=direct` read the actual public native
contract at block 68838388. Both Japanese/English show each paid 10, completed refunds, 30/14/16,
zero liability and venue cap/spent 12/12. The read-only inspector is explicitly not a payment
destination; collection remains disabled. These are local app screens reading public data, not Studio
preview success or a browser-wallet payment. Screenshots and text snapshots are in the evidence pack.
An initial CDP screenshot path timed out; the supported browser screenshot API succeeded afterward.

## Still unresolved

- Actual native edits/review/tests within Studio, honest export provenance and stable preview sync.
- Independent security review and browser-wallet native-send/receiving rehearsal.
- Live blocked/refusing receiver recovery, mistaken ERC20 deposits and router/exchange exceptions.
  Existing local tests cover these modeled boundaries; no extra public exception deposits were made.
- Shared offchain registration/organizer review, trusted-channel anti-impersonation checks and an
  integrated authorized organizer approval/deposit interface. Wallet address entry does not prove identity.
- Keeper hosting, monitoring, durable state/keys and hard-crash/pending/stale-lock recovery. The six
  earlier local fresh-process passes establish graceful restart behavior only.
- Permanently incompatible/blocklisted senders can retain unpaid refund liabilities; no redirect/sweep.

Public success is necessary but insufficient to enable collection or Mainnet. Keep PR #3 Draft and
leave PR #2, existing Mainnet and DoraHacks unchanged.
