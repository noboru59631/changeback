import { useReadContracts } from 'wagmi'
import { VAULT_ABI } from '@/lib/abi'
import { PHASE_LABELS } from '@/lib/constants'
import { formatUsdc, shortenAddress, formatTs } from '@/lib/format'

interface Props {
  vaultAddress: `0x${string}`
  /** Chain to read from — use selectedChainId from App, never the wallet chain. */
  chainId: number
}

/** Read-only vault status card. No wallet required. */
export function VaultCard({ vaultAddress, chainId }: Props) {
  const { data } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'getPhase',          chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalContributions', chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'collectUntil',       chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'spendUntil',         chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'participantCount',   chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'threshold',          chainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'guardian',           chainId },
    ],
    query: { refetchInterval: 15_000 },
  })

  const [phaseR, totalCR, collectUntilR, spendUntilR, nParticipantsR, thresholdR, guardianR] =
    (data ?? []).map(d => d.result)

  const phase       = phaseR !== undefined ? Number(phaseR) : null
  const totalC      = totalCR as bigint | undefined
  const collectUntil = collectUntilR as bigint | undefined
  const spendUntil  = spendUntilR  as bigint | undefined
  const nParticipants = nParticipantsR !== undefined ? Number(nParticipantsR) : null
  const threshold   = thresholdR   !== undefined ? Number(thresholdR)  : null
  const guardian    = guardianR    as `0x${string}` | undefined

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
            ${formatUsdc(totalC ?? 0n)} USDC
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

      {guardian && (
        <div className="text-xs text-slate-400">
          Guardian: <span className="font-mono text-slate-600">{shortenAddress(guardian)}</span>
        </div>
      )}

      <div className="text-xs text-slate-300 font-mono break-all">{vaultAddress}</div>
    </div>
  )
}
