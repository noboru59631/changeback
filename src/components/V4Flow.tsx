import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useWalletClient } from 'wagmi'
import { decodeEventLog, formatEther, getAddress, isAddress, keccak256, parseEther, toBytes } from 'viem'
import type { Address, Hex } from 'viem'
import { releaseChain, releaseClient } from '../lib/settlement-release'
import type { ReleaseNetwork } from '../lib/settlement-release'
import { v4Abi, v4FactoryAbi } from '../lib/v4-abi'

const configuredChainId = Number(import.meta.env.VITE_CHANGEBACK_V4_CHAIN_ID || '5042002') as 5042 | 5042002
if (![5042, 5042002].includes(configuredChainId)) throw new Error('VITE_CHANGEBACK_V4_CHAIN_ID must be 5042 or 5042002')
const v4Network: ReleaseNetwork = configuredChainId === 5042
  ? { chainId: 5042, rpcUrl: 'https://rpc.mainnet.arc.io', explorerUrl: 'https://explorer.arc.io', journalNamespace: 'changeback-v4-mainnet' }
  : { chainId: 5042002, rpcUrl: 'https://rpc.testnet.arc.io', explorerUrl: 'https://explorer.testnet.arc.io', journalNamespace: 'changeback-v4-testnet' }
// Legacy local name retained below to keep this release-only diff small; it now points
// to the selected v4 network and is not Testnet-specific.
const testnetPreview = v4Network
const V4_FACTORY_ADDRESS = (configuredChainId === 5042
  ? import.meta.env.VITE_CHANGEBACK_V4_MAINNET_FACTORY
  : import.meta.env.VITE_CHANGEBACK_V4_TESTNET_FACTORY) as Address | undefined
const chain = releaseChain(v4Network)
const explorer = v4Network.explorerUrl
const networkLabel = configuredChainId === 5042 ? 'Arc Mainnet' : 'Arc Testnet'

type Member = { address: Address; paid: bigint; refund: bigint; claimed: boolean }
type Expense = { recipient: Address; cap: bigint; approved: bigint; paid: bigint; receiptHash: Hex }
type EventState = {
  organizer: Address; metadataHash: Hex; fee: bigint; capacity: bigint; collectUntil: bigint; expenseUntil: bigint
  participantCount: bigint; members: Member[]; expenses: Expense[]; collected: bigint; approved: bigint
  spent: bigint; refunded: bigint; liability: bigint; finalized: boolean; balance: bigint
}

const publicClient = releaseClient(v4Network)

function asAddress(value: string): Address | undefined { return isAddress(value) ? getAddress(value) : undefined }
function usdc(value: bigint) { return `${formatEther(value)} USDC` }
function deadline(value: bigint) { return new Date(Number(value) * 1000).toLocaleString('ja-JP') }

export function V4Flow() {
  const { address, chainId, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: v4Network.chainId })
  const [eventAddress, setEventAddress] = useState(() => new URLSearchParams(window.location.search).get('event') ?? '')
  const [state, setState] = useState<EventState>()
  const [status, setStatus] = useState('')
  const [txHash, setTxHash] = useState<Hex>()
  const [loading, setLoading] = useState(false)
  const [eventName, setEventName] = useState('ChangeBack v4 event')
  const [fee, setFee] = useState('0.01')
  const [capacity, setCapacity] = useState(configuredChainId === 5042 ? '1' : '3')
  const [collectMinutes, setCollectMinutes] = useState(configuredChainId === 5042 ? '10' : '60')
  const [expenseMinutes, setExpenseMinutes] = useState(configuredChainId === 5042 ? '20' : '1440')
  const [expenseRecipient, setExpenseRecipient] = useState(configuredChainId === 5042 ? '0x89A4EF745831CFe8957391Ad2e3CF55Dc3a6e502' : '')
  const [expenseCap, setExpenseCap] = useState(configuredChainId === 5042 ? '0.006' : '0.02')
  const [participant, setParticipant] = useState('')
  const [participantName, setParticipantName] = useState('Participant')
  const [expenseId, setExpenseId] = useState('0')
  const [expenseAmount, setExpenseAmount] = useState('0')
  const [expensePurpose, setExpensePurpose] = useState('')

  const target = asAddress(eventAddress)
  const isOrganizer = !!state && !!address && state.organizer.toLowerCase() === address.toLowerCase()
  const ownMember = state?.members.find(member => member.address.toLowerCase() === address?.toLowerCase())
  const now = BigInt(Math.floor(Date.now() / 1000))
  const collectionOpen = !!state && now < state.collectUntil
  const expenseOpen = !!state && now >= state.collectUntil && now < state.expenseUntil
  const shareLink = target ? `${window.location.origin}${window.location.pathname}?mode=v4&event=${target}` : ''

  const readEvent = useCallback(async (quiet = false) => {
    if (!target) { setState(undefined); if (!quiet) setStatus('Enter a valid v4 event address / v4イベントアドレスを入力してください'); return }
    setLoading(true)
    try {
      const version = await publicClient.readContract({ address: target, abi: v4Abi, functionName: 'contractVersion' })
      if (version !== 4n) throw new Error('This is not a ChangeBack v4 event / v4イベントではありません')
      const [organizer, metadataHash, eventFee, eventCapacity, collectUntil, expenseUntil, participantCount, expenseCount, collected, approved, spent, refunded, liability, finalized, balance] = await Promise.all([
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'organizer' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'metadataHash' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'fee' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'capacity' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'collectUntil' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'expenseUntil' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'participantCount' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'expenseCount' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'totalCollected' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'totalApprovedExpenses' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'totalSpent' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'totalRefunded' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'remainingLiability' }),
        publicClient.readContract({ address: target, abi: v4Abi, functionName: 'finalized' }),
        publicClient.getBalance({ address: target }),
      ])
      const members: Member[] = []
      for (let i = 0n; i < participantCount; i++) {
        const memberAddress = await publicClient.readContract({ address: target, abi: v4Abi, functionName: 'participants', args: [i] })
        const member = await publicClient.readContract({ address: target, abi: v4Abi, functionName: 'members', args: [memberAddress] })
        members.push({ address: memberAddress, paid: member[1], refund: member[2], claimed: member[3] })
      }
      const expenses: Expense[] = []
      for (let i = 0n; i < expenseCount; i++) {
        const expense = await publicClient.readContract({ address: target, abi: v4Abi, functionName: 'expenses', args: [i] })
        expenses.push({ recipient: expense[0], cap: expense[1], approved: expense[2], paid: expense[3], receiptHash: expense[4] })
      }
      setState({ organizer, metadataHash, fee: eventFee, capacity: eventCapacity, collectUntil, expenseUntil, participantCount, members, expenses, collected, approved, spent, refunded, liability, finalized, balance })
      if (!quiet) setStatus('v4 event loaded / v4イベントを読み込みました')
    } catch (error) { setState(undefined); setStatus(error instanceof Error ? error.message : String(error)) }
    finally { setLoading(false) }
  }, [target])

  useEffect(() => { void readEvent(true) }, [readEvent])

  async function sendContract(functionName: 'approveParticipant' | 'approveExpense' | 'cancelExpenseApproval' | 'payApprovedExpense' | 'finalize' | 'claimRefund', args: readonly unknown[] = []) {
    if (!walletClient?.account || !target) throw new Error(`Connect a wallet on ${networkLabel} and load an event`)
    if (chainId !== v4Network.chainId) throw new Error(`Switch wallet to ${networkLabel}`)
    setLoading(true); setStatus('Simulating transaction / 送信前シミュレーション中')
    try {
      const simulation = await publicClient.simulateContract({ address: target, abi: v4Abi, functionName, args, account: walletClient.account, chain } as Parameters<typeof publicClient.simulateContract>[0])
      const hash = await walletClient.writeContract(simulation.request)
      setTxHash(hash); setStatus('Waiting for confirmation / 確認待ち')
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
      setStatus('Confirmed / 確定しました'); await readEvent(true)
    } finally { setLoading(false) }
  }

  async function payFee() {
    if (!walletClient?.account || !target || !state) throw new Error(`Connect a wallet on ${networkLabel} and load an event`)
    if (chainId !== v4Network.chainId) throw new Error(`Switch wallet to ${networkLabel}`)
    setLoading(true); setStatus('Preparing participant payment / 参加費送金を準備中')
    try {
      const hash = ownMember
        ? await walletClient.sendTransaction({ account: walletClient.account, to: target, value: state.fee, chain })
        : await walletClient.writeContract((await publicClient.simulateContract({
          address: target, abi: v4Abi, functionName: 'join', args: [keccak256(toBytes(participantName))],
          value: state.fee, account: walletClient.account, chain,
        })).request)
      setTxHash(hash); await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 }); setStatus('Payment confirmed / 支払いが確定しました'); await readEvent(true)
    } finally { setLoading(false) }
  }

  async function createEvent() {
    if (!V4_FACTORY_ADDRESS) throw new Error(`v4 ${networkLabel} Factory is not configured or approved yet`)
    if (!walletClient?.account || chainId !== v4Network.chainId) throw new Error(`Connect a wallet on ${networkLabel}`)
    const metadataHash = keccak256(toBytes(eventName))
    const recipient = asAddress(expenseRecipient)
    if (!recipient) throw new Error('Enter a fixed expense recipient / 固定支払先を入力してください')
    const eventFee = parseEther(fee); const seats = BigInt(capacity)
    setLoading(true); setStatus('Preparing v4 event creation / v4イベント作成を準備中')
    try {
      const simulation = await publicClient.simulateContract({ address: V4_FACTORY_ADDRESS, abi: v4FactoryAbi, functionName: 'createEvent', args: [metadataHash, eventFee, seats, BigInt(collectMinutes) * 60n, BigInt(expenseMinutes) * 60n, 30n * 24n * 60n, [{ recipient, cap: parseEther(expenseCap), approvedAmount: 0n, paidAmount: 0n, receiptHash: `0x${'0'.repeat(64)}` }]], account: walletClient.account, chain })
      const hash = await walletClient.writeContract(simulation.request); setTxHash(hash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
      const created = receipt.logs.flatMap(log => { try { const decoded = decodeEventLog({ abi: v4FactoryAbi, data: log.data, topics: log.topics }); return decoded.eventName === 'EventCreated' ? [decoded.args.eventAddress] : [] } catch { return [] } })[0]
      if (created) { setEventAddress(created); window.history.replaceState(null, '', `?mode=v4&event=${created}`) }
      setStatus(created ? 'v4 event created and loaded / v4イベントを作成しました' : 'Created; paste the emitted event address to load it / 作成済み。Eventアドレスを入力してください')
    } finally { setLoading(false) }
  }

  const action = (run: () => Promise<void>) => { void run().catch(error => setStatus(error instanceof Error ? error.message : String(error))) }

  return <div className="min-h-dvh bg-slate-50 px-4 py-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
    <main className="max-w-3xl mx-auto space-y-5">
      <header className="rounded-2xl bg-slate-900 text-white p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-slate-300">ChangeBack v4</p><h1 className="text-2xl font-semibold">Collect first. Settle actual costs. Return the remainder.</h1></div><ConnectKitButton /></div><p className="mt-3 text-sm text-slate-300">{networkLabel} · v3 controls are not used on this screen.</p></header>
      <section className="rounded-2xl border bg-white p-5 space-y-3"><h2 className="font-semibold">Open a v4 event / v4イベントを開く</h2><div className="flex gap-2"><input className="min-w-0 flex-1 rounded-lg border p-2 font-mono text-sm" value={eventAddress} onChange={event => setEventAddress(event.target.value)} placeholder="0x… v4 event address" /><button className="rounded-lg border px-4 py-2" disabled={loading} onClick={() => action(() => readEvent())}>Load</button></div>{shareLink && <div className="flex gap-2"><input readOnly className="min-w-0 flex-1 rounded-lg border bg-slate-50 p-2 text-xs" value={shareLink} /><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => action(async () => { await navigator.clipboard.writeText(shareLink); setStatus('Participant link copied / 参加リンクをコピーしました') })}>Copy link</button></div>}</section>
      <section className="rounded-2xl border bg-white p-5 space-y-3"><h2 className="font-semibold">Organizer: create a v4 event / 主催者：v4イベント作成</h2><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Event name<input className="mt-1 w-full rounded-lg border p-2" value={eventName} onChange={event => setEventName(event.target.value)} /></label><label className="text-sm">Fee per participant (USDC)<input className="mt-1 w-full rounded-lg border p-2" value={fee} onChange={event => setFee(event.target.value)} /></label><label className="text-sm">Capacity<input className="mt-1 w-full rounded-lg border p-2" value={capacity} onChange={event => setCapacity(event.target.value)} /></label><label className="text-sm">Collection minutes<input className="mt-1 w-full rounded-lg border p-2" value={collectMinutes} onChange={event => setCollectMinutes(event.target.value)} /></label><label className="text-sm">Expense deadline minutes after creation<input className="mt-1 w-full rounded-lg border p-2" value={expenseMinutes} onChange={event => setExpenseMinutes(event.target.value)} /></label><label className="text-sm">Fixed expense recipient<input className="mt-1 w-full rounded-lg border p-2 font-mono" value={expenseRecipient} onChange={event => setExpenseRecipient(event.target.value)} placeholder="0x…" /></label><label className="text-sm">Expense cap (USDC)<input className="mt-1 w-full rounded-lg border p-2" value={expenseCap} onChange={event => setExpenseCap(event.target.value)} /></label></div><button className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-40" disabled={!V4_FACTORY_ADDRESS || loading || !isConnected || !asAddress(expenseRecipient)} onClick={() => action(createEvent)}>{V4_FACTORY_ADDRESS ? 'Create v4 event' : 'Create disabled until reviewed Testnet Factory is configured'}</button>{!V4_FACTORY_ADDRESS && <p className="text-xs text-amber-700">This form is intentionally preparation-only. No unreviewed Factory address is used.</p>}</section>
      {state && <>
        <section className="rounded-2xl border bg-white p-5 space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-slate-500">{isOrganizer ? 'Organizer view' : 'Participant view'}</p><h2 className="text-xl font-semibold">{formatEther(state.fee)} USDC · {state.capacity.toString()} seats</h2><p className="text-sm text-slate-500">Collect until {deadline(state.collectUntil)} · Expenses until {deadline(state.expenseUntil)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{state.finalized ? 'Finalized' : collectionOpen ? 'Collecting' : expenseOpen ? 'Expense settlement' : 'Ready to finalize'}</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-sm"><div><span className="text-slate-500">Collected</span><b className="block">{usdc(state.collected)}</b></div><div><span className="text-slate-500">Approved</span><b className="block">{usdc(state.approved)}</b></div><div><span className="text-slate-500">Spent</span><b className="block">{usdc(state.spent)}</b></div><div><span className="text-slate-500">Refunded</span><b className="block">{usdc(state.refunded)}</b></div><div><span className="text-slate-500">Liability</span><b className="block">{usdc(state.liability)}</b></div></div></section>
        <section className="rounded-2xl border bg-white p-5 space-y-3"><h2 className="font-semibold">Participants / 参加者</h2>{isOrganizer && <details><summary className="cursor-pointer text-sm text-slate-500">Optional: reserve a seat for a wallet / 任意：参加枠を事前確保</summary><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className="rounded-lg border p-2 font-mono text-sm" value={participant} onChange={event => setParticipant(event.target.value)} placeholder="Participant wallet" /><input className="rounded-lg border p-2" value={participantName} onChange={event => setParticipantName(event.target.value)} placeholder="Private name" /><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={loading || !asAddress(participant) || !collectionOpen} onClick={() => action(() => sendContract('approveParticipant', [asAddress(participant)!, keccak256(toBytes(participantName))]))}>Reserve seat</button></div></details>}{isConnected && <div className="rounded-lg bg-slate-50 p-3 text-sm"><p>Connected wallet: <code>{address}</code></p>{ownMember ? <><p>{ownMember.paid ? `Paid ${usdc(ownMember.paid)}` : `Participation fee due: ${usdc(state.fee)}`}{state.finalized ? ` · Refund ${usdc(ownMember.refund)} · ${ownMember.claimed ? 'claimed' : 'available'}` : ''}</p>{!ownMember.paid && collectionOpen && <button className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-40" disabled={loading || !isConnected || chainId !== testnetPreview.chainId} onClick={() => action(payFee)}>Pay participation fee</button>}</> : collectionOpen ? <div className="mt-2 flex flex-wrap gap-2"><input className="min-w-40 flex-1 rounded-lg border bg-white p-2" value={participantName} onChange={event => setParticipantName(event.target.value)} placeholder="Name" /><button className="rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-40" disabled={loading || !participantName.trim() || chainId !== testnetPreview.chainId} onClick={() => action(payFee)}>Join & pay {usdc(state.fee)}</button></div> : <p className="text-amber-700">Collection is closed.</p>}</div>}{state.members.map(member => <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm" key={member.address}><code>{member.address}</code><span>{member.paid ? `Paid ${usdc(member.paid)}` : 'Unpaid'}</span><span>{state.finalized ? `Refund ${usdc(member.refund)} · ${member.claimed ? 'Claimed' : 'Automatic refund queued'}` : 'Refund pending'}</span></div>)}{!state.members.length && <p className="text-sm text-slate-500">Open the shared link, connect a wallet, and pay in one action.</p>}</section>
        <section className="rounded-2xl border bg-white p-5 space-y-3"><h2 className="font-semibold">Expenses / 実費精算</h2>{state.expenses.map((expense, index) => <div className="rounded-lg border p-3 space-y-2" key={index}><div className="flex flex-wrap justify-between gap-2 text-sm"><span>#{index} · recipient <code>{expense.recipient}</code></span><span>Cap {usdc(expense.cap)} · {expense.paid ? `Paid ${usdc(expense.paid)}` : expense.approved ? `Approved ${usdc(expense.approved)}` : 'Unapproved'}</span></div>{isOrganizer && !state.finalized && <div className="flex flex-wrap gap-2"><input className="w-32 rounded-lg border p-2" placeholder="Actual USDC" value={expenseId === String(index) ? expenseAmount : ''} onChange={event => { setExpenseId(String(index)); setExpenseAmount(event.target.value) }} /><input className="min-w-48 flex-1 rounded-lg border p-2" placeholder="Purpose / receipt reference" value={expenseId === String(index) ? expensePurpose : ''} onChange={event => { setExpenseId(String(index)); setExpensePurpose(event.target.value) }} /><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={loading || !expenseOpen || expense.paid > 0n || expenseId !== String(index)} onClick={() => action(() => sendContract('approveExpense', [BigInt(index), parseEther(expenseAmount || '0'), keccak256(toBytes(expensePurpose))]))}>Approve actual expense</button>{expense.approved > 0n && <button className="rounded-lg border px-3 py-2" disabled={loading} onClick={() => action(() => sendContract('cancelExpenseApproval', [BigInt(index)]))}>Cancel approval</button>}</div>}{expense.approved > 0n && !expense.paid && <button className="rounded-lg border px-3 py-2" disabled={loading || !expenseOpen} onClick={() => action(() => sendContract('payApprovedExpense', [BigInt(index)]))}>Pay approved expense</button>}</div>)}</section>
        <section className="rounded-2xl border bg-white p-5 space-y-3"><h2 className="font-semibold">Settlement / 精算と返金</h2>{isOrganizer && !state.finalized && <button className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-40" disabled={loading || now < state.expenseUntil || state.approved > 0n} onClick={() => action(() => sendContract('finalize'))}>Finalize after expense deadline</button>}<p className="text-sm text-slate-600">After finalization, the contract fixes the refund pool and preserves each participant's original refund destination. The UI never offers a refund destination override.</p></section>
      </>}
      {txHash && <a className="block break-all text-sm underline" href={`${explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">{txHash}</a>}
      {status && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{status}</p>}
    </main>
  </div>
}

