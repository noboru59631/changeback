import { useReadContracts } from 'wagmi'
import { VAULT_ABI } from '@/lib/abi'
import { PHASE_LABELS, CHAIN_CONFIG } from '@/lib/constants'
import { formatUsdc6dp, shortenAddress, formatTs } from '@/lib/format'

interface Props {
  vaultAddress: `0x${string}`
  /** Chain to read from — use selectedChainId from App, never the wallet chain. */
  chainId: number
}

/** Read-only vault status card. No wallet required. */
export function VaultCard({ vaultAddress, chainId }: Props) {
  const { data, isError, refetch } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'getPhase',          chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalContributions', chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'collectUntil',       chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'spendUntil',         chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'participantCount',   chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'threshold',          chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'guardian',           chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalSpent',         chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalRefunded',      chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'strandedSurplus',    chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'paused',             chainId },
    ],
    query: { refetchInterval: 15_000 },
  })

  const [phaseR, totalCR, collectUntilR, spendUntilR, nParticipantsR, thresholdR, guardianR, spentR, refundedR, surplusR, pausedR] =
    (data ?? []).map(d => d.result)

  const phase       = phaseR !== undefined ? Number(phaseR) : null
  const totalC      = totalCR as bigint | undefined
  const collectUntil = collectUntilR as bigint | undefined
  const spendUntil  = spendUntilR  as bigint | undefined
  const nParticipants = nParticipantsR !== undefined ? Number(nParticipantsR) : null
  const threshold   = thresholdR   !== undefined ? Number(thresholdR)  : null
  const guardian    = guardianR    as `0x${string}` | undefined

  if (isError || data?.some(result => result.status === 'failure')) {
    return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">Could not read all vault details. Amounts are unavailable. <button className="underline" onClick={() => void refetch()}>Retry vault reads</button></div>
  }

  if (phase === null) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm px-5 py-4 animate-pulse">
        <div className="h-3 bg-slate-200 rounded w-1/3 mb-2" />
        <div className="h-5 bg-slate-100 rounded w-1/2" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-widest">Vault status</div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          phase === 0 ? 'bg-blue-50 text-blue-600' :
          phase === 1 ? 'bg-amber-50 text-amber-700' :
          phase === 2 ? 'bg-emerald-50 text-emerald-700' :
          'bg-slate-100 text-slate-500'
        }`}>
          {PHASE_LABELS[phase] ?? `Phase ${phase}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          <div className="text-slate-400 mb-0.5">Total contributed</div>
          <div className="font-semibold tabular-nums text-slate-800">
            ${formatUsdc6dp(totalC ?? 0n)} USDC
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          <div className="text-slate-400 mb-0.5">Participants</div>
          <div className="font-semibold text-slate-800">
            {nParticipants ?? '—'}{threshold !== null ? ` (threshold ${threshold})` : ''}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          <div className="text-slate-400 mb-0.5">Collect until</div>
          <div className="font-semibold text-slate-800 tabular-nums">
            {collectUntil ? formatTs(collectUntil) : '—'}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          <div className="text-slate-400 mb-0.5">Spend until</div>
          <div className="font-semibold text-slate-800 tabular-nums">
            {spendUntil ? formatTs(spendUntil) : '—'}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
        <div className="flex justify-between"><span>Paid to recipients</span><strong>{typeof spentR === 'bigint' ? formatUsdc6dp(spentR) : '—'} USDC</strong></div>
        <div className="flex justify-between"><span>Returned to contributors</span><strong>{typeof refundedR === 'bigint' ? formatUsdc6dp(refundedR) : '—'} USDC</strong></div>
        <p className="pt-2 text-xs text-slate-600">{phase === 0 ? 'Next: participants approve exact USDC, then deposit before collection ends.' : phase === 1 ? 'Next: propose a payment, gather the required approvals, then execute it separately.' : phase === 2 ? 'Next: claim each outstanding refund to its original contributor, then Close.' : 'Closed: review paid and refunded amounts. Closure alone does not prove a recipient payment.'}</p>
        {pausedR === true && <p className="text-xs text-amber-800">Guardian pause is permanent. Refunds open after 24 hours or the spending deadline, whichever is earlier.</p>}
        {typeof surplusR === 'bigint' && surplusR > 0n && <p role="alert" className="text-xs text-red-700">{formatUsdc6dp(surplusR)} USDC stranded surplus. Direct transfers are excluded from refunds and have no recovery path.</p>}
      </div>

      {guardian && (
        <div className="text-xs text-slate-400">
          Guardian: <span className="font-mono text-slate-600">{shortenAddress(guardian)}</span>
        </div>
      )}

      <a className="block text-xs text-blue-700 underline font-mono break-all" href={`${CHAIN_CONFIG[chainId].explorerBase}/address/${vaultAddress}`} target="_blank" rel="noopener noreferrer">View vault on {CHAIN_CONFIG[chainId].label} Explorer: {vaultAddress}</a>
    </div>
  )
}
