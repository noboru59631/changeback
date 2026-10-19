/**
 * DemoView — read-only design preview of all six lifecycle panels.
 *
 * IMPORTANT: This is static design-only content. No wallet, no transactions,
 * no real chain data, no signing methods. All values shown are illustrative
 * placeholders. This is not evidence of a deployed contract or mainnet activity.
 */

import { CheckCircle2, Clock, Lock, Users, Receipt } from 'lucide-react'

// ─── Illustrative data (clearly labelled as demo) ────────────────────────────

const DEMO_PARTICIPANTS = [
  { addr: '0xAlice…', share: '40%', amount: '40.00', claimed: true },
  { addr: '0xBob…',   share: '35%', amount: '35.00', claimed: true },
  { addr: '0xCarol…', share: '25%', amount: '25.00', claimed: false },
]

const DEMO_PROPOSALS = [
  { id: 0, destination: '0xVendor…', amount: '30.00', votes: 2, threshold: 2, executed: true },
  { id: 1, destination: '0xSupply…', amount: '15.00', votes: 1, threshold: 2, executed: false },
]

// ─── Mini card ────────────────────────────────────────────────────────────────

function DemoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm px-5 py-4 space-y-3">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-widest">{title}</div>
      {children}
    </div>
  )
}

// ─── Step panels ──────────────────────────────────────────────────────────────

function DemoCreate() {
  return (
    <DemoCard title="Step 1 — Create">
      <div className="text-sm text-slate-600">
        One participant deploys a new ChangeBack vault through the factory, specifying:
      </div>
      <ul className="text-sm text-slate-500 space-y-1 list-disc list-inside">
        <li>Participant addresses (2–20, must be sorted)</li>
        <li>Approval threshold — how many participants must sign each payment (minimum 2)</li>
        <li>Collection deadline — when deposits close</li>
        <li>Spend deadline — when the spending window ends (up to 90 days after collection)</li>
        <li>Guardian address — must be one of the participants; can pause the vault</li>
      </ul>
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
        All settings are permanent after the vault is created. The creator does not receive
        any special privileges. Payments require the configured approval threshold;
        other actions (finalize, claimFor, close) follow their specific permissions.
      </div>
    </DemoCard>
  )
}

function DemoCollect() {
  return (
    <DemoCard title="Step 2 — Collect">
      <div className="flex items-center gap-2 rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3">
        <Clock size={16} className="text-blue-400 shrink-0" />
        <div>
          <div className="text-xs text-blue-500 uppercase tracking-widest">Collection phase</div>
          <div className="text-lg font-semibold tabular-nums text-blue-800">$100.00 USDC</div>
          <div className="text-xs text-blue-400">contributed of $100.00 target</div>
        </div>
      </div>
      <div className="space-y-1.5">
        {DEMO_PARTICIPANTS.map(p => (
          <div key={p.addr} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-slate-500">{p.addr}</span>
            <span className="tabular-nums text-slate-700">${p.amount}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-400">Deposit disabled once collection deadline passes.</div>
    </DemoCard>
  )
}

function DemoApprove() {
  return (
    <DemoCard title="Step 3 — Approve">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-slate-400" />
        <span className="text-sm text-slate-600">Threshold: 2 of 3 approvals required</span>
      </div>
      <div className="space-y-2">
        {DEMO_PROPOSALS.map(proposal => (
          <div key={proposal.id} className={`rounded-xl border px-4 py-3 text-sm ${
            proposal.executed ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-xs text-slate-500">Proposal #{proposal.id}</div>
                <div className="text-xs text-slate-400">To: {proposal.destination}</div>
              </div>
              <div className="text-right">
                <div className="tabular-nums font-medium text-slate-800">${proposal.amount}</div>
                <div className="text-xs text-slate-400">{proposal.votes}/{proposal.threshold} votes</div>
              </div>
            </div>
            {proposal.executed && (
              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 size={10} /> Executed
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-400">
        Propose, approve, revoke, or execute — all require on-chain transactions.
        Early return requires a quorum vote to skip remaining spend time.
      </div>
    </DemoCard>
  )
}

function DemoSpend() {
  return (
    <DemoCard title="Step 4 — Spend">
      <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Total contributed</span>
          <span className="tabular-nums font-medium">$100.00</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Spent</span>
          <span className="tabular-nums">$30.00</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Available to spend</span>
          <span className="tabular-nums font-medium text-slate-800">$70.00</span>
        </div>
      </div>
      <div className="text-xs text-slate-400">
        Payments require threshold approvals. The spend deadline is immutable.
        The "available" figure is an accounting balance, not a token lock.
      </div>
    </DemoCard>
  )
}

function DemoReturn() {
  return (
    <DemoCard title="Step 5 — Return">
      <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3">
        <div className="text-xs text-emerald-600 uppercase tracking-widest mb-0.5">Return pool</div>
        <div className="text-2xl font-semibold tabular-nums text-emerald-800">$70.00 USDC</div>
        <div className="text-xs text-emerald-500">Pro-rata to contributors by contribution share</div>
      </div>
      <div className="space-y-1.5">
        {DEMO_PARTICIPANTS.map(p => (
          <div key={p.addr} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            p.claimed ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'
          }`}>
            <div>
              <span className="font-mono text-xs text-slate-700">{p.addr}</span>
              <div className="text-xs text-slate-400">
                Entitlement: <span className="font-semibold tabular-nums">${(parseFloat(p.amount) * 0.7).toFixed(6)} USDC</span>
              </div>
            </div>
            {p.claimed ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 size={12} /> Claimed
              </span>
            ) : (
              <span className="text-xs text-slate-400 px-3 py-1.5 rounded-lg border border-slate-200">Claim</span>
            )}
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-400">
        Anyone can call claimFor for any participant. Each claim is a separate on-chain transaction.
      </div>
    </DemoCard>
  )
}

function DemoClose() {
  return (
    <DemoCard title="Step 6 — Close">
      <div className="rounded-2xl bg-slate-100 border border-slate-200 px-4 py-4 flex items-center gap-3">
        <Lock size={18} className="text-slate-400 shrink-0" />
        <div>
          <div className="font-medium text-slate-700 text-sm">Vault closed</div>
          <div className="text-xs text-slate-400 mt-0.5">No further state changes are possible.</div>
        </div>
      </div>
      <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Total contributed</span><span>$100.00</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Spent</span><span>$30.00</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Refunded</span><span className="text-emerald-600">$70.00</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Outstanding</span>
          <span className="text-emerald-600">$0.00</span>
        </div>
      </div>
      <div className="text-xs text-slate-400">
        Close requires Returning phase, all positive entitlements claimed, and zero remaining liability.
      </div>
    </DemoCard>
  )
}

// ─── Main DemoView ────────────────────────────────────────────────────────────

export function DemoView() {
  return (
    <div className="space-y-4">
      {/* Clear demo label */}
      <div className="rounded-2xl bg-violet-50 border border-violet-100 px-4 py-3 flex items-center gap-2">
        <Receipt size={14} className="text-violet-400 shrink-0" />
        <div className="text-xs text-violet-600">
          <strong className="font-semibold">Design preview only.</strong> All values are illustrative.
          No wallet required. No transactions. Not evidence of any deployment.
        </div>
      </div>

      <DemoCreate />
      <DemoCollect />
      <DemoApprove />
      <DemoSpend />
      <DemoReturn />
      <DemoClose />
    </div>
  )
}
