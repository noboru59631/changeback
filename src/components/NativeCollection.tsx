import { useState } from 'react'
import { createPublicClient, formatUnits, getAddress, http, isAddress } from 'viem'
import { nativeMeetupAbi } from '../lib/native-meetup-abi'
import { nativePaymentStatus } from '../lib/native-accounting'
import type { NativePaymentStatus } from '../lib/native-accounting'

interface Application { name: string; wallet: string }
interface MemberView { wallet: string; paid: bigint; transfers: bigint; entitlement: bigint; claimed: boolean }
interface BudgetView { recipient: string; cap: bigint; category: number; automatic: boolean; spent: bigint }
interface EventView {
  fee: bigint; collected: bigint; spent: bigint; refunded: bigint; liability: bigint
  unaccounted: bigint; finalized: boolean; block: bigint; members: MemberView[]
  budgets: BudgetView[]; showStaffAmounts: boolean
}

export function NativeCollection() {
  const [language, setLanguage] = useState<'ja' | 'en'>('ja')
  const say = (ja: string, en: string) => language === 'ja' ? ja : en
  const [name, setName] = useState('')
  const [wallet, setWallet] = useState('')
  const [applications, setApplications] = useState<Application[]>([])
  const [address, setAddress] = useState('')
  const [state, setState] = useState<EventView>()
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const statusLabel = (status: NativePaymentStatus) => ({
    unpaid: say('未払い', 'Unpaid'), short: say('不足', 'Short'),
    paid: say('支払済', 'Paid'), excess: say('過払い', 'Excess'),
  })[status]
  const button = 'rounded-lg border px-4 py-2 disabled:opacity-50'
  const input = 'w-full rounded-lg border p-2'

  async function load() {
    setLoading(true)
    setState(undefined)
    try {
      if (!isAddress(address)) throw new Error(say('読み取り対象アドレスを確認してください', 'Check the read-only address'))
      const client = createPublicClient({ transport: http('https://rpc.testnet.arc.io') })
      if (await client.getChainId() !== 5042002) throw new Error('Wrong network')
      const target = getAddress(address)
      const block = await client.getBlock()
      const read = (functionName: string, args: readonly unknown[] = []) => client.readContract({
        address: target, abi: nativeMeetupAbi, functionName, args, blockNumber: block.number,
      } as Parameters<typeof client.readContract>[0]) as Promise<unknown>
      const terms = await read('terms') as readonly [string, bigint, bigint, bigint, bigint, boolean]
      if (terms[1] <= 0n) throw new Error('Invalid fee')
      const count = Number(await read('participantCount'))
      if (!Number.isSafeInteger(count) || count < 0 || count > 100) throw new Error('Invalid participant count')
      const members: MemberView[] = []
      for (let index = 0; index < count; index++) {
        const payer = await read('participants', [BigInt(index)]) as string
        const member = await read('members', [payer]) as readonly [string, bigint, bigint, bigint, bigint, boolean]
        members.push({ wallet: payer, paid: member[1], entitlement: member[2], transfers: member[3], claimed: member[5] })
      }
      const [collected, spent, refunded, liability, unaccounted, finalized] = await Promise.all([
        read('totalCollected'), read('totalSpent'), read('totalRefunded'), read('remainingLiability'),
        read('unaccountedBalance'), read('finalized'),
      ]) as [bigint, bigint, bigint, bigint, bigint, boolean]
      const budgetCount = Number(await read('budgetCount'))
      if (!Number.isSafeInteger(budgetCount) || budgetCount < 1 || budgetCount > 20) throw new Error('Invalid budgets')
      const budgets: BudgetView[] = []
      for (let index = 0; index < budgetCount; index++) {
        const budget = await read('budgets', [BigInt(index)]) as readonly [string, bigint, number, bigint, boolean]
        budgets.push({ recipient: budget[0], cap: budget[1], category: budget[2], automatic: budget[4],
          spent: await read('budgetSpent', [BigInt(index)]) as bigint })
      }
      if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('Block changed; retry')
      setState({ fee: terms[1], collected, spent, refunded, liability, unaccounted, finalized,
        block: block.number, members, budgets, showStaffAmounts: terms[5] })
      setNotice(say('指定契約の読み取り結果です。審査済み配備や本人確認の証明ではありません。', 'Read-only contract results. This does not establish a reviewed deployment or identity.'))
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
    finally { setLoading(false) }
  }

  function exportApplications() {
    const blob = new Blob([JSON.stringify({ version: 1, kind: 'unverified-applications', applications }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'changeback-applications.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <main className="mx-auto max-w-4xl space-y-6 p-5 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">ChangeBack · {say('USDC送金1回の参加受付', 'Join with one USDC send')}</h1>
      <button className={button} onClick={() => { setLanguage(language === 'ja' ? 'en' : 'ja'); setNotice('') }}>{language === 'ja' ? 'English' : '日本語'}</button>
    </header>
    <nav className="flex gap-4 text-violet-700 underline"><a href="?">{say('Vault', 'Vault')}</a><a href="?mode=events">{say('従来のイベント会計', 'Existing event accounting')}</a></nav>
    <section role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h2 className="font-semibold">{say('検証中・送金受付は停止しています', 'Under review · collection is disabled')}</h2>
      <p>{say('名前と送金元ウォレットの申請後、主催者の確認を経て、Arcの標準USDC送金を1回行う方式を検証しています。', 'We are testing organizer-reviewed applications followed by one standard native USDC send on Arc.')}</p>
      <p>{say('公開Testnetの新版検証と審査済み配備が完了するまで、送金先は表示しません。既存Vault・イベント契約への通常送金は行わないでください。', 'No payment destination is shown until the new public Testnet verification and deployment review are complete. Do not send ordinary transfers to existing Vault or event contracts.')}</p>
      <p>{say('標準USDC送金とERC20トークン送金は別経路です。ERC20 transferはこの方式でも入金会計を更新しません。', 'Native USDC sends and ERC20 token transfers use different paths. ERC20 transfer still does not update this accounting.')}</p>
    </section>
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">{say('参加申請の下書き', 'Application draft')}</h2>
      <p>{say('接続・署名は不要です。実際に送金する、自分で管理するウォレットを入力します。取引所の出金アドレスは利用できません。', 'No connection or signature. Enter the wallet you control and will actually send from. Exchange withdrawal wallets are unsupported.')}</p>
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault()
        if (!name.trim() || name.trim().length > 100 || !isAddress(wallet) || /^0x0{40}$/i.test(wallet)) return
        if (applications.some(item => item.wallet.toLowerCase() === wallet.toLowerCase())) {
          setNotice(say('同じウォレットの申請があります。主催者の確認が必要です。', 'Duplicate wallet application; organizer review required.'))
          return
        }
        setApplications([...applications, { name: name.trim(), wallet: getAddress(wallet) }])
        setName('')
        setWallet('')
        setNotice(say('下書きをこの画面に追加しました。主催者への送信・承認はまだ行っていません。', 'Draft added to this page. It has not been sent to or approved by the organizer.'))
      }}>
        <label className="block">{say('名前', 'Name')}<input className={input} value={name} maxLength={100} required onChange={event => setName(event.target.value)} /></label>
        <label className="block">{say('実際にUSDCを送るウォレット', 'Wallet that will actually send USDC')}<input className={input} value={wallet} required onChange={event => setWallet(event.target.value)} /></label>
        <button className={button} type="submit">{say('下書きに追加', 'Add draft')}</button>
      </form>
      <p>{say('申請だけでは本人確認・枠確保は完了しません。招待と主催者確認を経て承認し、入金後は登録を固定します。返金先は実際の送金元に固定され、名前の入力で変更できません。', 'An application alone establishes neither identity nor a reserved seat. Invitations and organizer review precede approval; paid registrations are frozen. Refunds stay fixed to the actual sender.')}</p>
      <p>{say('下書きはこのタブの一時データです。保存したJSONは手動で主催者に共有します。共有受付サーバーと自動送信は未実装です。', 'Drafts are temporary in this tab. Export for manual sharing; a shared registration service is not implemented.')}</p>
      {applications.map(item => <p className="break-all text-sm" key={item.wallet}>{item.name} · {item.wallet} · {say('未確認 / 未登録', 'Unverified / Unregistered')}</p>)}
      <button className={button} disabled={applications.length === 0} onClick={exportApplications}>{say('申請下書きを保存', 'Export application drafts')}</button>
    </section>
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">{say('契約の読み取り（送金先ではありません）', 'Read-only contract inspection (not a payment destination)')}</h2>
      <label className="block">{say('新版native契約の読み取り対象', 'Native contract to inspect')}<input className={input} value={address} onChange={event => { setAddress(event.target.value); setState(undefined) }} /></label>
      <button className={button} disabled={loading || !isAddress(address)} onClick={load}>{loading ? say('確認中', 'Loading') : say('読み取り', 'Read')}</button>
      {state && <div className="space-y-3">
        <p>Block {state.block.toString()} · {say('参加費', 'Fee')} {formatUnits(state.fee, 18)} USDC</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>{say('送金元', 'Sender')}</th><th>{say('会計済み', 'Accounted')}</th><th>{say('状態', 'Status')}</th><th>{say('返金', 'Refund')}</th></tr></thead><tbody>
          {state.members.map(member => <tr className="border-t" key={member.wallet}><td className="break-all p-2">{member.wallet}</td><td>{formatUnits(member.paid, 18)}</td><td>{statusLabel(nativePaymentStatus(member.paid, state.fee))}{member.transfers > 1n && ` · ${say('複数送金', 'Multiple sends')}`}</td><td>{formatUnits(member.entitlement, 18)} · {member.claimed ? say('完了', 'Sent') : say('未実行', 'Pending')}</td></tr>)}
        </tbody></table></div>
        <p>{say('集金 / 支出 / 返金済み', 'Collected / spent / refunded')}: {formatUnits(state.collected, 18)} / {formatUnits(state.spent, 18)} / {formatUnits(state.refunded, 18)} USDC</p>
        <p>{say('未計上残高（支出しません）', 'Unaccounted balance (excluded from spending)')}: {formatUnits(state.unaccounted, 18)} USDC</p>
        <p>{say('残債務', 'Remaining liability')}: {state.finalized ? formatUnits(state.liability, 18) : say('精算前', 'Not finalized')}</p>
        <h3 className="font-semibold">{say('予算と支払い条件', 'Budgets and payment conditions')}</h3>
        {state.budgets.map((budget, index) => <div className="rounded-lg bg-slate-50 p-3 text-sm" key={index}>
          <p className="break-all">{budget.category === 2 ? say('スタッフ報酬', 'Staff reward') : say('会場・店舗費', 'Venue / merchant')} · {budget.recipient}</p>
          {(budget.category !== 2 || state.showStaffAmounts) && <p>{say('上限 / 支出済み', 'Cap / spent')}: {formatUnits(budget.cap, 18)} / {formatUnits(budget.spent, 18)} USDC</p>}
          <p>{budget.automatic ? say('集金期限後に設定上限額を支払う・keeperが必要', 'Configured cap after collection · keeper required') : budget.category === 2 ? say('主催者の完了承認で固定報酬を支払う', 'Fixed reward after organizer confirms work') : say('主催者が上限内で支払う', 'Organizer pays within the cap')}</p>
        </div>)}
        <p className="text-sm">{say('個別報酬を画面で隠しても、契約設定と取引履歴は公開されます。', 'Hiding individual rewards here does not hide onchain configuration or transfers.')}</p>
      </div>}
    </section>
    <p className="text-sm">{say('会場費は設定上限、スタッフ報酬は主催者承認の固定額です。自動返金には稼働中のkeeperとガス代が必要です。期限後は誰でも精算・送金元への返金を実行できます。受け取りを拒否するスマートウォレットやブロックされた送金元は、返金を受け取れない場合があります。', 'Venue payments stay capped; fixed staff rewards require organizer approval. Automated refunds need a funded keeper. After the deadline anyone can finalize and refund senders. Smart wallets rejecting payment and blocked senders may be unable to receive refunds.')}</p>
    {notice && <p role="status" className="rounded-xl bg-violet-50 p-4">{notice}</p>}
  </main>
}
