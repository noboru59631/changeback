import { useEffect, useState } from 'react'
import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi, getAddress, isAddress, keccak256, stringToHex, decodeEventLog } from 'viem'
import type { Address, Hex } from 'viem'
import type { Abi } from 'viem'
import { meetupAbi, factoryAbi, ARC_TESTNET_ID, USDC } from '@/lib/meetup-abi'
import { formatUsdc, validateResidualSpend } from '@/lib/event-accounting'
import { parseUsdc } from '@/lib/format'

type Language = 'ja' | 'en'
type Member = { wallet: Address; refundTo: Address; nameHash: Hex; paid: bigint; entitlement: bigint; claimed: boolean }
type Budget = { recipient: Address; cap: bigint; category: number; payAfter: bigint; automatic: boolean; spent: bigint }
type EventState = {
  fee: bigint; capacity: bigint; collectUntil: bigint; spendUntil: bigint; showStaffAmounts: boolean
  organizer: Address; members: Member[]; budgets: Budget[]; collected: bigint; spent: bigint
  refunded: bigint; liability: bigint; unaccounted: bigint; finalized: boolean; block: bigint
}

const reviewedFactory = import.meta.env.VITE_MEETUP_FACTORY as Address | undefined
const reviewedCodeHash = import.meta.env.VITE_MEETUP_FACTORY_CODEHASH as Hex | undefined
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900'
const buttonClass = 'rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40'
const parseAmount = (value: string) => {
  const amount = parseUsdc(value)
  if (amount === null) throw new Error('USDC amount must be unsigned with at most 6 decimal places')
  return amount
}

export function EventAccounting() {
  const [language, setLanguage] = useState<Language>('ja')
  const say = (ja: string, en: string) => language === 'ja' ? ja : en
  const account = useAccount()
  const client = usePublicClient({ chainId: ARC_TESTNET_ID })
  const { data: wallet } = useWalletClient()
  const { switchChainAsync } = useSwitchChain()
  const [escrow, setEscrow] = useState(new URLSearchParams(window.location.search).get('event') || '')
  const [state, setState] = useState<EventState | null>(null)
  const [trusted, setTrusted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [refundTo, setRefundTo] = useState('')
  const [consent, setConsent] = useState(false)
  const [names, setNames] = useState<Record<string, { name: string; salt: string }>>({})
  const [eventName, setEventName] = useState('Web3 Meetup')
  const [fee, setFee] = useState('10')
  const [capacity, setCapacity] = useState('20')
  const [collectUntil, setCollectUntil] = useState('')
  const [spendUntil, setSpendUntil] = useState('')
  const [showStaff, setShowStaff] = useState(false)
  const [budgetForm, setBudgetForm] = useState([
    { recipient: '', cap: '80', category: 0, automatic: true },
    { recipient: '', cap: '80', category: 1, automatic: true },
    { recipient: '', cap: '20', category: 2, automatic: false },
  ])

  useEffect(() => {
    if (!client || !reviewedFactory || !isAddress(reviewedFactory) || !reviewedCodeHash) return
    let cancelled = false
    client.getCode({ address: reviewedFactory }).then(code => {
      if (!cancelled) setTrusted(!!code && keccak256(code).toLowerCase() === reviewedCodeHash.toLowerCase())
    }).catch(() => { if (!cancelled) setTrusted(false) })
    return () => { cancelled = true }
  }, [client])

  const load = async (address = escrow) => {
    if (!client || !isAddress(address)) throw new Error(say('イベントアドレスを確認してください', 'Check the event address'))
    const block = await client.getBlockNumber()
    const read = (functionName: string, args: readonly unknown[] = []) =>
      (client.readContract as unknown as (opts: Record<string, unknown>) => Promise<unknown>)({
        address: getAddress(address), abi: meetupAbi, functionName, args, blockNumber: block,
      })
    const terms = await read('terms') as readonly [Hex, bigint, bigint, bigint, bigint, boolean]
    const memberCount = Number(await read('participantCount'))
    const budgetCount = Number(await read('budgetCount'))
    if (memberCount > 100 || budgetCount > 20) throw new Error('Unsupported event size')
    const members: Member[] = []
    for (let index = 0; index < memberCount; index++) {
      const address = await read('participants', [BigInt(index)]) as Address
      const member = await read('members', [address]) as readonly [Address, Hex, bigint, bigint, boolean]
      members.push({ wallet: address, refundTo: member[0], nameHash: member[1], paid: member[2], entitlement: member[3], claimed: member[4] })
    }
    const budgets: Budget[] = []
    for (let index = 0; index < budgetCount; index++) {
      const budget = await read('budgets', [BigInt(index)]) as readonly [Address, bigint, number, bigint, boolean]
      budgets.push({ recipient: budget[0], cap: budget[1], category: budget[2], payAfter: budget[3],
        automatic: budget[4], spent: await read('budgetSpent', [BigInt(index)]) as bigint })
    }
    const next = { fee: terms[1], capacity: terms[2], collectUntil: terms[3], spendUntil: terms[4], showStaffAmounts: terms[5],
      organizer: await read('organizer') as Address, members, budgets, block,
      collected: await read('totalCollected') as bigint, spent: await read('totalSpent') as bigint,
      refunded: await read('totalRefunded') as bigint, liability: await read('remainingLiability') as bigint,
      unaccounted: await read('unaccountedBalance') as bigint, finalized: await read('finalized') as boolean }
    setState(next)
    try { setNames(JSON.parse(localStorage.getItem(`meetup-names:${address.toLowerCase()}`) || '{}')) }
    catch { setNames({}) }
    return next
  }

  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    setNotice('')
    try { await action() } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  const send = async (address: Address, functionName: string, args: readonly unknown[], factory = false) => {
    if (!client || !wallet || !account.address || !trusted || !reviewedFactory || !reviewedCodeHash) throw new Error('Reviewed Testnet deployment required')
    if (account.chainId !== ARC_TESTNET_ID) {
      await switchChainAsync({ chainId: ARC_TESTNET_ID })
      throw new Error(say('Arc Testnetへ切り替えました。内容を確認して再実行してください。', 'Switched to Arc Testnet. Review and try again.'))
    }
    if (await wallet.getChainId() !== ARC_TESTNET_ID) throw new Error('Wallet network changed')
    const code = await client.getCode({ address: reviewedFactory })
    if (!code || keccak256(code).toLowerCase() !== reviewedCodeHash.toLowerCase()) throw new Error('Factory code changed')
    if (!factory && !await client.readContract({ address: reviewedFactory, abi: factoryAbi, functionName: 'isEvent', args: [getAddress(escrow)] })) {
      throw new Error('Event is not from the reviewed factory')
    }
    const abi = (factory ? factoryAbi : address.toLowerCase() === USDC.toLowerCase() ? erc20Abi : meetupAbi) as Abi
    const { request } = await client.simulateContract({ address, abi, functionName, args: args, account: account.address })
    const hash = await wallet.writeContract(request)
    setNotice(say('送信済み・確認待ち: ', 'Submitted, awaiting confirmation: ') + hash)
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 })
    if (receipt.status !== 'success') throw new Error(`Reverted: ${hash}`)
    setNotice(say('確認済み: ', 'Confirmed: ') + hash)
    return receipt
  }

  const create = async () => {
    if (!reviewedFactory) throw new Error('No reviewed Testnet factory is configured')
    const collection = BigInt(Math.floor(Date.parse(collectUntil) / 1000))
    const spending = BigInt(Math.floor(Date.parse(spendUntil) / 1000))
    const feeAmount = parseAmount(fee)
    const count = BigInt(capacity)
    const budgets = budgetForm.map(item => ({ ...item, amount: parseAmount(item.cap) })).filter(item => item.amount > 0n).map(item => ({
      recipient: getAddress(item.recipient), cap: item.amount, category: item.category,
      payAfter: item.automatic ? collection : 0n, automatic: item.automatic,
    }))
    const metadata = { eventName, refundRule: 'equal-full-payers-partials-reserved-cumulative-rounding-v1',
      fee, capacity, collectUntil: collection.toString(), spendUntil: spending.toString(), showStaff,
      budgets: budgets.map(item => ({ ...item, cap: item.cap.toString(), payAfter: item.payAfter.toString() })) }
    const metadataHash = keccak256(stringToHex(JSON.stringify(metadata)))
    const receipt = await send(reviewedFactory, 'createEvent', [{ metadataHash, fee: feeAmount, capacity: count,
      collectUntil: collection, spendUntil: spending, showStaffAmounts: showStaff }, budgets], true)
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== reviewedFactory.toLowerCase()) continue
      try {
        const decoded = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics })
        if (decoded.eventName === 'EventCreated') {
          const address = decoded.args.escrow
          localStorage.setItem(`meetup-terms:${address.toLowerCase()}`, JSON.stringify(metadata))
          setEscrow(address)
          window.history.replaceState(null, '', `?mode=events&event=${address}`)
          await load(address)
        }
      } catch { continue }
    }
  }

  const own = state?.members.find(member => member.wallet.toLowerCase() === account.address?.toLowerCase())
  const organizer = state?.organizer.toLowerCase() === account.address?.toLowerCase()
  const enabled = trusted && !!account.address && !busy
  const staffTotal = state?.budgets.filter(budget => budget.category === 2).reduce((sum, budget) => sum + budget.cap, 0n) || 0n
  const categoryLabel = (category: number) => [say('会場費', 'Venue'), say('飲食費', 'Food'), say('運営費・固定報酬', 'Operations / fixed staff')][category]
  const download = (value: unknown, filename: string) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
  }
  const verifiedName = (member: Member) => {
    const proof = names[member.wallet.toLowerCase()]
    if (!proof || typeof proof.name !== 'string' || typeof proof.salt !== 'string') return ''
    return keccak256(stringToHex(`${proof.name}:${proof.salt}`)) === member.nameHash ? proof.name : ''
  }

  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8 text-slate-800">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">ChangeBack · {say('イベント会計', 'Event accounting')}</h1>
      <div className="flex flex-wrap items-center gap-3"><button onClick={() => setLanguage(language === 'ja' ? 'en' : 'ja')}>日本語 / English</button><ConnectKitButton /></div>
    </header>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">{say(
      '開発中・Arc Testnet専用。集金先への通常の直接送金はしないでください。「参加費を支払う」で入金と記帳を同時に行います。未記帳の資金は返金原資に含めません。',
      'Development preview · Arc Testnet only. Do not send ordinary transfers to the collection contract. Use Pay participation fee to transfer and account atomically. Unaccounted funds are excluded from refunds.')}</p>
    {!trusted && <p role="status" className="rounded-xl bg-slate-100 p-4">{say('検証済みの新契約が未設定のため送信機能は無効です。旧Vaultはこの方式に対応していません。', 'Writes are disabled until a reviewed new deployment is configured. Legacy Vaults do not support this flow.')}</p>}
    <a className="text-violet-700 underline" href="?">{say('既存Vault画面へ', 'Legacy Vault view')}</a>
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">{say('イベントを作成', 'Create an event')}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>{say('イベント名', 'Event name')}<input className={inputClass} value={eventName} onChange={event => setEventName(event.target.value)} /></label>
        <label>{say('参加費 USDC', 'Fee USDC')}<input className={inputClass} value={fee} onChange={event => setFee(event.target.value)} /></label>
        <label>{say('定員（最大100人）', 'Capacity (up to 100)')}<input className={inputClass} type="number" min="1" max="100" value={capacity} onChange={event => setCapacity(event.target.value)} /></label>
        <label>{say('集金期限', 'Collection deadline')}<input className={inputClass} type="datetime-local" value={collectUntil} onChange={event => setCollectUntil(event.target.value)} /></label>
        <label>{say('支出期限・自動返金開始', 'Spend deadline / refund start')}<input className={inputClass} type="datetime-local" value={spendUntil} onChange={event => setSpendUntil(event.target.value)} /></label>
      </div>
      {budgetForm.map((budget, index) => <div key={index} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
        <label>{categoryLabel(index)} USDC<input className={inputClass} value={budget.cap} onChange={event => setBudgetForm(budgetForm.map((item, itemIndex) => itemIndex === index ? { ...item, cap: event.target.value } : item))} /></label>
        <label>{say('送金先', 'Recipient')}<input className={inputClass} placeholder="0x…" value={budget.recipient} onChange={event => setBudgetForm(budgetForm.map((item, itemIndex) => itemIndex === index ? { ...item, recipient: event.target.value } : item))} /></label>
        {index < 2 && <label><input type="checkbox" checked={budget.automatic} onChange={event => setBudgetForm(budgetForm.map((item, itemIndex) => itemIndex === index ? { ...item, automatic: event.target.checked } : item))} /> {say('集金期限後に上限額を自動送金', 'Auto-pay exact cap after collection closes')}</label>}
      </div>)}
      <label className="block"><input type="checkbox" checked={showStaff} onChange={event => setShowStaff(event.target.checked)} /> {say('参加者画面で個別報酬を表示（送金履歴は常に公開）', 'Show individual staff amounts (onchain transfers are always public)')}</label>
      <p className="text-sm">{say('返金ルール：満額入金者に余剰を均等配分。不足入金は全額返金。最小単位の端数は登録順で調整。条件は作成後変更できません。ガス代は主催者・実行者が別途負担します。', 'Refund rule: equal surplus for fully paid members; partial payments are fully reserved and refunded. Rounding uses registration order. Terms are immutable. Organizer / keeper pays gas separately.')}</p>
      <button disabled={!enabled} className={buttonClass} onClick={() => act(create)}>{say('この条件で作成', 'Create with these terms')}</button>
    </section>
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">{say('イベントを開く', 'Open event')}</h2>
      <label>{say('イベント契約（送金先としてコピーしないでください）', 'Event contract (do not use for direct transfers)')}<input className={inputClass} value={escrow} onChange={event => { setEscrow(event.target.value); setState(null); setConsent(false) }} /></label>
      <button disabled={busy || !isAddress(escrow)} className={buttonClass} onClick={() => act(async () => { await load() })}>{say('最新状態を読み込む', 'Refresh from chain')}</button>
    </section>
    {state && <>
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{say('参加登録・支払い', 'Register and pay')}</h2>
        <p>{say('参加費', 'Fee')}: {formatUsdc(state.fee)} USDC · {state.members.length}/{state.capacity.toString()} · {say('集金期限', 'Collection closes')}: {new Date(Number(state.collectUntil) * 1000).toLocaleString()}</p>
        <p className="break-all text-sm">{say('主催者', 'Organizer')}: {state.organizer}</p>
        <p>{say('運営費総額（上限）', 'Total operations budget (cap)')}: {formatUsdc(staffTotal)} USDC</p>
        <p className="text-sm">{say('満額入金者に余剰を均等返金。不足入金は全額返金。店舗の自動支払いは集金締切後、設定額の全額を支払います。スタッフ報酬は主催者の業務完了承認後に支払います。', 'Equal surplus refunds for full payers; partial payments are refunded in full. Scheduled merchants receive their exact configured amount after collection. Staff are paid only after the organizer confirms completion.')}</p>
        <label className="block">{say('名前（オンチェーンにはランダム値付きハッシュのみ）', 'Name (only a salted hash goes onchain)')}<input className={inputClass} value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="block">{say('返金先ウォレット', 'Refund wallet')}<input className={inputClass} value={refundTo} placeholder={account.address || '0x…'} onChange={event => setRefundTo(event.target.value)} /></label>
        <label className="block"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> {say('下の送金先・予算・返金ルールを確認し同意しました', 'I reviewed the recipients, budgets and refund rule below')}</label>
        <div className="flex flex-wrap gap-3">
          {own && !own.claimed && <button className={buttonClass} disabled={!enabled || !isAddress(refundTo)} onClick={() => act(async () => {
            await send(getAddress(escrow), 'setRefundDestination', [getAddress(refundTo)])
            await load()
          })}>{say('自分の返金先を更新', 'Update my refund destination')}</button>}
          <button className={buttonClass} disabled={!enabled || !!own || !name.trim() || !consent || state.finalized} onClick={() => act(async () => {
            const destination = getAddress(refundTo || account.address!)
            const salt = crypto.getRandomValues(new Uint8Array(32))
            const proof = { name: name.trim(), salt: Array.from(salt).join(',') }
            const nameHash = keccak256(stringToHex(`${proof.name}:${proof.salt}`))
            await send(getAddress(escrow), 'register', [nameHash, destination])
            localStorage.setItem(`meetup-names:${escrow.toLowerCase()}`, JSON.stringify({ ...names, [account.address!.toLowerCase()]: proof }))
            await load()
          })}>{say('自分のウォレットで登録', 'Register my wallet')}</button>
          <button className={buttonClass} disabled={!enabled || !own || !consent || own.paid >= state.fee || state.finalized} onClick={() => act(async () => {
            const fresh = await load()
            const member = fresh.members.find(item => item.wallet.toLowerCase() === account.address?.toLowerCase())
            if (!member) throw new Error('Register first')
            const amount = fresh.fee - member.paid
            if (amount <= 0n) throw new Error('Already paid')
            const allowance = await client!.readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [account.address!, getAddress(escrow)] })
            if (allowance < amount) await send(USDC, 'approve', [getAddress(escrow), amount])
            await send(getAddress(escrow), 'pay', [amount])
            await load()
          })}>{say('参加費を支払う（初回は承認＋支払い）', 'Pay fee (first time: approval + payment)')}</button>
        </div>
      </section>
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{say('参加者・入金一覧', 'Attendance and payments')}</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>{say('名前・ウォレット', 'Name / wallet')}</th><th>{say('入金済み', 'Accounted')}</th><th>{say('状態', 'Status')}</th><th>{say('返金', 'Refund')}</th></tr></thead><tbody>
          {state.members.map(member => <tr key={member.wallet} className="border-t"><td className="break-all p-2">{verifiedName(member)}<br />{member.wallet}</td><td>{formatUsdc(member.paid)}</td><td>{member.paid === state.fee ? say('支払い済み', 'Paid') : member.paid > 0n ? say('不足', 'Insufficient') : say('未払い', 'Unpaid')}</td><td>{formatUsdc(member.entitlement)} · {member.claimed ? say('完了', 'Sent') : say('未実行', 'Pending')}</td></tr>)}
        </tbody></table></div>
        <p className="text-sm">{say('名前はこのブラウザーに保存します。主催者へ登録名JSONを共有し、主催者が取り込むと名前を表示できます。オンチェーンの登録ハッシュと照合します。名前共有サーバーは未実装です。', 'Names stay in this browser. Share your registry JSON with the organizer for import; names are checked against onchain commitments. A shared name server is not implemented.')}</p>
        <button className={buttonClass} onClick={() => download(names, 'changeback-registered-names.json')}>{say('登録名JSONを保存', 'Export registered names')}</button>
        <label className="block">{say('登録名JSONを取り込む', 'Import registered names')}<input type="file" accept="application/json" onChange={event => {
          const file = event.target.files?.[0]
          if (!file) return
          act(async () => {
            if (file.size > 1_000_000) throw new Error('Registry file exceeds 1 MB')
            const imported = JSON.parse(await file.text()) as Record<string, { name: string; salt: string }>
            const combined = { ...names }
            for (const [address, proof] of Object.entries(imported)) {
              const member = state.members.find(item => item.wallet.toLowerCase() === address.toLowerCase())
              if (!member || typeof proof?.name !== 'string' || typeof proof?.salt !== 'string'
                || keccak256(stringToHex(`${proof.name}:${proof.salt}`)) !== member.nameHash) throw new Error('Registry proof does not match onchain registration')
              combined[address.toLowerCase()] = proof
            }
            localStorage.setItem(`meetup-names:${escrow.toLowerCase()}`, JSON.stringify(combined))
            setNames(combined)
          })
        }} /></label>
        <p className="text-sm">{say('重複・過剰の契約支払いは拒否されます。通常送金・取引所送金・送金元不明の入金は支払い済みにしません。', 'Duplicate / excess contract payments are rejected. Ordinary, exchange and unmatched transfers never mark attendance as paid.')}</p>
        {state.unaccounted > 0n && <p role="alert" className="rounded-lg bg-amber-100 p-3">{say('要確認：未記帳残高', 'Needs review: unaccounted balance')}: {formatUsdc(state.unaccounted)} USDC · {say('支出・返金には使用しません。自動回収は未対応です。', 'Excluded from spending and refunds. Automatic recovery is not implemented.')}</p>}
      </section>
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{say('予算・支払い条件', 'Budget and payment conditions')}</h2>
        {state.budgets.map((budget, index) => <div key={index} className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="break-all">{categoryLabel(budget.category)} · {budget.recipient}</p>
          {(budget.category !== 2 || state.showStaffAmounts || organizer) && <p>{say('上限 / 支出済み', 'Cap / paid')}: {formatUsdc(budget.cap)} / {formatUsdc(budget.spent)} USDC</p>}
          <p>{budget.automatic ? say('集金期限後に設定上限額を支払う・実行者が必要', 'Exact configured cap after collection · keeper required') : budget.category === 2 ? say('主催者の業務完了承認で固定額を支払う', 'Fixed amount after organizer confirms work completed') : say('主催者が上限内で支払う', 'Organizer payment within cap')}</p>
          {budget.automatic && <button disabled={!enabled || state.finalized || budget.spent > 0n} className={buttonClass} onClick={() => act(async () => { await send(getAddress(escrow), 'executeScheduled', [BigInt(index)]); await load() })}>{say('条件を確認して実行', 'Execute if due')}</button>}
          {organizer && !budget.automatic && budget.category === 2 && <button disabled={!enabled || state.finalized || budget.spent > 0n} className={buttonClass} onClick={() => act(async () => { await send(getAddress(escrow), 'spend', [BigInt(index), budget.cap, keccak256(stringToHex('Organizer confirmed completion'))]); await load() })}>{say('業務完了を確認・固定報酬を送金', 'Confirm completed work and pay fixed reward')}</button>}
          {organizer && !budget.automatic && budget.category !== 2 && <button disabled={!enabled || state.finalized || budget.spent >= budget.cap} className={buttonClass} onClick={() => act(async () => {
            const fresh = await load()
            const fb = fresh.budgets[index]
            const residual = validateResidualSpend(
              fb.cap, fb.spent, fresh.finalized,
              fresh.organizer, account.address ?? '',
              fresh.collectUntil, fresh.spendUntil,
              BigInt(Math.floor(Date.now() / 1000)),
            )
            await send(getAddress(escrow), 'spend', [BigInt(index), residual, keccak256(stringToHex('Organizer payment'))])
            await load()
          })}>{say('残予算を送金', 'Pay remaining budget')}</button>}
        </div>)}
        <p className="text-sm">{say('個別報酬を非表示にしても、コントラクト設定と送金履歴は公開されます。', 'Hiding individual rewards in this screen does not hide contract configuration or onchain transfers.')}</p>
      </section>
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{say('収支・返金レポート', 'Accounting and refund report')}</h2>
        <p>{say('集金 / 支出 / 返金済み', 'Collected / spent / refunded')}: {formatUsdc(state.collected)} / {formatUsdc(state.spent)} / {formatUsdc(state.refunded)} USDC</p>
        <p>{say('未返金債務', 'Unpaid refund liability')}: {state.finalized ? formatUsdc(state.liability) : say('精算前', 'Not finalized')} · Block {state.block.toString()}</p>
        <p>{say('差額（集金−支出−返金−残債務）', 'Difference (collected − spent − refunded − liability)')}: {state.finalized ? formatUsdc(state.collected - state.spent - state.refunded - state.liability) : '—'} USDC</p>
        <p className="text-sm">{say('自動実行には常時稼働するkeeperとガス代が必要です。この画面を閉じただけでは自動返金は始まりません。取引所からの送金は利用できません。', 'Automation requires a running keeper and gas funding. Closing this page does not start refunds. Exchange-origin transfers are unsupported.')}</p>
        <div className="flex flex-wrap gap-3">
          <button disabled={!enabled || state.finalized} className={buttonClass} onClick={() => act(async () => { await send(getAddress(escrow), 'finalize', []); await load() })}>{say('条件を確認して精算確定', 'Finalize when eligible')}</button>
          <button disabled={!enabled || !own || !state.finalized || own.claimed} className={buttonClass} onClick={() => act(async () => { await send(getAddress(escrow), 'refundFor', [account.address!]); await load() })}>{say('自分の返金を実行', 'Send my refund')}</button>
          <button className={buttonClass} onClick={() => download({ chainId: ARC_TESTNET_ID, escrow, state }, 'changeback-event-report.json')}>{say('収支JSONを保存（公開チェーンデータ）', 'Download accounting JSON (public chain data)')}</button>
        </div>
      </section>
    </>}
    {notice && <p role="status" className="break-all rounded-xl bg-violet-50 p-4 text-sm">{notice}</p>}
  </main>
}
