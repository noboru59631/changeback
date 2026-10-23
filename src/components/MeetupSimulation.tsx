import { useState } from 'react'

const stages = [
  { title: '1. Agree on the meetup budget', action: 'Create example budget', detail: 'Three friends choose two required approvals, a collection deadline and a spending deadline. These settings will be permanent in a real vault.' },
  { title: '2. Collect contributions', action: 'Record three example deposits', detail: 'Alice contributes 0.04, Bob 0.03 and Carol 0.03 USDC. Each person approves the exact token allowance, then deposits through the app.' },
  { title: '3. Review the venue payment', action: 'Record first example approval', detail: 'The venue payment is 0.03 USDC. A proposal does not move money. Check the full recipient address, amount and expiry before voting.' },
  { title: '4. Reach 2-of-3 approval', action: 'Record second example approval', detail: 'One approval cannot execute this payment. A second distinct participant must approve the same proposal.' },
  { title: '5. Pay the venue', action: 'Execute example payment', detail: 'Two approvals are present. A separate execute transaction transfers 0.03 USDC to the recipient; 0.07 USDC remains.' },
  { title: '6. Return the unused budget', action: 'Record example refunds', detail: 'After the spending deadline, or a separately approved early return, claim transactions send 0.028 to Alice and 0.021 each to Bob and Carol. Nothing happens automatically.' },
  { title: '7. Close the budget', action: 'Close example budget', detail: 'Only after all positive refund liabilities are paid can anyone submit Close. The original 0.10 equals 0.03 spent plus 0.07 refunded; network fees are separate.' },
  { title: 'Example complete', action: 'Restart simulation', detail: 'This illustrated the happy path only. It created no vault, signatures, transactions or Explorer receipts. Open Verified evidence above for actual network records.' },
]

export function MeetupSimulation() {
  const [stage, setStage] = useState(0)
  const [notice, setNotice] = useState('')
  const current = stages[stage]
  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-5 space-y-4" aria-label="Meetup simulation">
      <p className="text-xs font-semibold text-violet-700">FICTIONAL SCENARIO · NO WALLET · NO NETWORK TRANSACTIONS</p>
      <progress className="w-full accent-violet-600" max={7} value={stage} aria-label="Simulation progress" />
      <h2 className="text-lg font-semibold">{current.title}</h2>
      <p className="text-sm text-slate-600">{current.detail}</p>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <div><dt>Contributed</dt><dd>{stage >= 2 ? '0.10' : '0'} USDC</dd></div>
        <div><dt>Payment approvals</dt><dd>{stage >= 4 ? '2' : stage >= 3 ? '1' : '0'} / 2</dd></div>
        <div><dt>Venue received</dt><dd>{stage >= 5 ? '0.03' : '0'} USDC</dd></div>
        <div><dt>Refunded</dt><dd>{stage >= 6 ? '0.07' : '0'} USDC</dd></div>
      </dl>
      <button className="w-full rounded-xl bg-violet-700 p-3 text-sm font-semibold text-white" onClick={() => { setStage(stage === 7 ? 0 : stage + 1); setNotice('') }}>{current.action}</button>
      {stage === 3 && <button className="w-full rounded-xl border border-slate-300 p-3 text-sm" onClick={() => setNotice('Blocked in this example: 1 approval is below the required 2. No money moved.')}>Try executing with one approval</button>}
      {notice && <p role="status" className="text-sm text-amber-800">{notice}</p>}
      <p className="text-xs text-slate-500">Simulation fees are not calculated. Real transactions incur fees even when reverted. Contract behavior is checked separately by local tests.</p>
    </section>
  )
}
