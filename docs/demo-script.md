# Demo Script (60–90 seconds)

**Context:** ChangeBack is a shared USDC budget app on Arc. A group of participants contribute USDC to a vault, approve payments by on-chain quorum, and receive proportional refunds of any unspent amount.

**Note:** No live deployment exists yet. This script demonstrates the UI flow and the design preview. All steps marked [LIVE] require a deployed factory address.

---

## Script

### 0 — Open the app (5 s)

Open the preview URL. You see:
- The ChangeBack header
- An amber banner: "No factory address configured" — truthful, no deployment yet
- A "Demo" button in the header

### 1 — Demo view, no wallet needed (15 s)

Click **Demo** in the header. The demo view slides in:

> "This is a read-only design preview. No wallet required. No transactions."

Scroll down and show all six lifecycle panels:
- **Create** — participants, threshold, deadlines
- **Collect** — deposit progress, per-participant rows
- **Approve** — proposal list, vote counts, threshold indicator
- **Spend** — accounting breakdown: contributed / spent / available
- **Return** — return pool, per-participant entitlements with exact 6dp amounts
- **Close** — final accounting receipt, vault locked

Point out: entitlement amounts shown as "0.000001 USDC" (not "0.00") — micro-USDC precision matters here.

### 2 — Connect wallet, switch to Arc Testnet (10 s)

Click Demo again to hide the demo. Click **Connect Wallet**. Connect MetaMask (or any injected wallet). If prompted, switch to Arc Testnet. The chain gate disappears and the live app area appears.

### 3 — Configure factory address [LIVE only] (10 s)

Click the **Settings** (gear) icon. Paste the deployed factory address. The amber "no factory" banner disappears. The app now shows the **Create** step.

### 4 — Create a vault [LIVE only] (20 s)

Fill in:
- Participants: your address + one other (must be sorted ascending)
- Threshold: 2
- Collection deadline: now + 1 hour
- Spend deadline: now + 2 hours
- Guardian: your address

Click **Create Vault**. Confirm the transaction in your wallet. After confirmation the vault address appears and the step rail advances to **Collect**.

### 5 — Show vault card + share link (10 s)

The vault card at the top shows:
- Phase: Collecting
- Total contributed: $0.00
- Collection deadline countdown

Click Settings → copy the share URL. "Anyone with this link can read the vault state without connecting a wallet."

### 6 — Summarize (10 s)

> "Participants deposit during the collection window. Once it closes, the group approves payments by on-chain quorum — any combination of threshold signers. When the spend window ends, anyone can finalize and trigger claimFor for each participant. Close completes the lifecycle. All steps are external transactions — no automatic execution, no keeper required."

---

## Key points to emphasize

- **No automatic execution:** every step (finalize, claimFor, close) requires a submitted transaction and gas.
- **Quorum trust model:** any M-of-N quorum can authorize payments. The contract does not protect participants from the quorum itself.
- **Immutable deadlines:** spendUntil is set at creation and never changes. Early return sets a flag; it does not reassign deadlines.
- **Arc Testnet only (in Studio):** per Arc Studio docs, testnet deployment only. Mainnet requires reviewed export.
- **No mainnet evidence:** no contract addresses, no transaction hashes, no real funds in any demo.

---

## Timing

| Segment | Duration |
|---------|----------|
| 0 — Open app | 5 s |
| 1 — Demo view | 15 s |
| 2 — Connect wallet | 10 s |
| 3 — Configure factory | 10 s |
| 4 — Create vault | 20 s |
| 5 — Vault card + share | 10 s |
| 6 — Summary | 10 s |
| **Total** | **80 s** |
