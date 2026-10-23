import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits } from 'viem'
import { preparePayment } from '@/lib/payment-preflight'
import { prepareApproval, prepareExecution, prepareEarlyReturn, prepareEarlyReturnExecution } from '@/lib/approval-preflight'
import type { PaymentPreflight } from '@/lib/payment-preflight'
import { VAULT_ABI } from '@/lib/abi'
import { CHAIN_CONFIG } from '@/lib/constants'
import { formatUsdc, formatUsdc6dp, formatTs } from '@/lib/format'
import { useWriteAllowed } from './WriteGate'
import { parseOnchainError } from '@/lib/errors'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { TxButton } from './TxButton'
import { ExternalLink, CheckCircle2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  vaultAddress: `0x${string}`
  selectedChainId: number
  factoryAddress?: string
  isVaultRegistered?: boolean
  isVaultRegisteredLoading?: boolean
  isVaultRegisteredError?: boolean
}

/**
 * Steps 3 and 4 — Propose, approve, revoke, and execute payment proposals.
 * Also supports proposing and executing early return.
 *
 * Reads are available to anyone (no wallet). Writes require the shared gate.
 * execute and executeEarlyReturn are permissionless (any wallet can call) but
 * still require the chain and factory conditions.
 */
export function StepApproveSpend({
  vaultAddress,
  selectedChainId,
  factoryAddress,
  isVaultRegistered,
  isVaultRegisteredLoading,
  isVaultRegisteredError,
}: Props) {
  const { address, chainId: walletChainId } = useAccount()
  const publicClient = usePublicClient({ chainId: selectedChainId })
  const [simulationSender, setSimulationSender] = useState('')
  const [preflight, setPreflight] = useState<(PaymentPreflight & { scope: string }) | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [preparingApproval, setPreparingApproval] = useState(false)
  const [earlyPreflight, setEarlyPreflight] = useState<(Awaited<ReturnType<typeof prepareEarlyReturn>> & { scope: string }) | null>(null)
  const [preflightError, setPreflightError] = useState('')
  const chainConfig = CHAIN_CONFIG[selectedChainId]
  const [tab, setTab] = useState<'proposals' | 'propose' | 'early'>('proposals')
  const [reviewedProposal, setReviewedProposal] = useState('')
  const currentProposalReview = useRef(reviewedProposal)
  currentProposalReview.current = reviewedProposal

  const [destAddr,    setDestAddr]    = useState('')
  const [amountStr,   setAmountStr]   = useState('')
  const [memo,        setMemo]        = useState('')
  const [expiryHours, setExpiryHours] = useState('24')

  const writeAllowed = useWriteAllowed(
    selectedChainId, factoryAddress, vaultAddress,
    isVaultRegistered, isVaultRegisteredLoading, isVaultRegisteredError,
  )

  const { data: vaultData, refetch: refetchVault } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'proposalCount',      chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'threshold',           chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalContributions',  chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalSpent',          chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'spendUntil',          chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'isParticipant', args: [address ?? '0x0000000000000000000000000000000000000001'], chainId: selectedChainId },
    ],
  })

  const [proposalCountR, thresholdR, totalCR, totalSR, spendUntilR, isParticipantR] =
    (vaultData ?? []).map(d => d.result)

  const proposalCount = Number(proposalCountR ?? 0n)
  const threshold     = Number(thresholdR ?? 0n)
  const totalC        = totalCR  as bigint ?? 0n
  const totalS        = totalSR  as bigint ?? 0n
  const spendUntil    = spendUntilR as bigint ?? 0n
  const isParticipant = (isParticipantR as boolean) ?? false
  const scope = JSON.stringify([address, walletChainId, selectedChainId, factoryAddress, vaultAddress,
    destAddr, amountStr, memo, expiryHours, simulationSender, writeAllowed,
    totalC.toString(), totalS.toString(), spendUntil.toString(), isVaultRegistered,
    isVaultRegisteredLoading, isVaultRegisteredError])
  const currentScope = useRef(scope)
  currentScope.current = scope
  const preparation = useRef(0)
  useEffect(() => {
    preparation.current += 1
    setPreflight(null)
    setEarlyPreflight(null)
    setPreflightError('')
    setPreparing(false)
  }, [scope])

  const proposalIds = Array.from({ length: proposalCount }, (_, i) => i)
  const { data: proposalsData, refetch: refetchProposals } = useReadContracts({
    contracts: proposalIds.flatMap(id => [
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'getProposal', args: [BigInt(id)],                                                       chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'hasVoted',    args: [BigInt(id), address ?? '0x0000000000000000000000000000000000000001'], chainId: selectedChainId },
    ]),
    query: { enabled: proposalCount > 0 },
  })

  const refetch = () => { void refetchVault(); void refetchProposals() }

  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5000)
    return () => clearInterval(id)
  }, [])

  // Capture the chain the transaction was submitted on.
  const [submittedChainId, setSubmittedChainId] = useState<number | undefined>(undefined)

  const { writeContract, data: txHash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: submittedChainId,
  })

  useEffect(() => {
    if (!isSuccess || !receipt) return
    if (receipt.status !== 'success') { toast.error('Transaction reverted on-chain.'); return }
    refetch()
    reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, receipt])

  useEffect(() => {
    if (!isError || !error) return
    toast.error(parseOnchainError(error))
  }, [isError, error])

  const sendTx = async (functionName: string, args: unknown[]) => {
    if (!writeAllowed) { toast.error('Writes are disabled.'); return }
    if (preparingApproval || isPending || isConfirming) return
    let approvalFees: Awaited<ReturnType<typeof prepareApproval>> | undefined
    if (['approve', 'execute', 'executeEarlyReturn'].includes(functionName)) {
      const reviewAtStart = currentProposalReview.current
      if (!reviewAtStart.startsWith(`${scope}:${args[0]}:`)) { toast.error('Review this proposal first.'); return }
      if (!publicClient || !address) { toast.error('Connect the participant wallet first.'); return }
      setPreparingApproval(true)
      try {
        const prepareAction = functionName === 'approve' ? prepareApproval :
          functionName === 'execute' ? prepareExecution : prepareEarlyReturnExecution
        approvalFees = await prepareAction(publicClient, address, vaultAddress, args[0] as bigint, selectedChainId)
        if (currentScope.current !== scope || currentProposalReview.current !== reviewAtStart) { toast.error('Wallet, vault or review changed. Check again.'); return }
      } catch (error) {
        toast.error(parseOnchainError(error))
        return
      } finally {
        setPreparingApproval(false)
      }
    }
    reset()
    setSubmittedChainId(selectedChainId)
    writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: functionName as 'approve',
      args: args as [bigint],
      chainId: selectedChainId,
      ...approvalFees,
    })
  }

  const activePreflight = preflight?.scope === scope && preflight.validUntil > nowSec * 1000 ? preflight : null

  const handlePreflight = async () => {
    const attempt = ++preparation.current
    setPreflight(null)
    setPreflightError('')
    setPreparing(true)
    try {
      if (!publicClient || vaultData?.some(result => result.status !== 'success') || !vaultData) throw new Error('Vault reads are not ready.')
      if (!isVaultRegistered || isVaultRegisteredLoading || isVaultRegisteredError) throw new Error('Vault registry is not verified.')
      const result = await preparePayment(publicClient, {
        chainId: selectedChainId, account: address ?? simulationSender, vault: vaultAddress,
        recipient: destAddr, amount: amountStr, memo, hours: expiryHours,
        available: totalC - totalS, spendUntil,
      })
      if (currentScope.current === scope && preparation.current === attempt) setPreflight({ ...result, scope })
    } catch (error) {
      if (currentScope.current === scope && preparation.current === attempt) setPreflightError(error instanceof Error ? error.message : 'Preflight failed.')
    } finally {
      if (preparation.current === attempt) setPreparing(false)
    }
  }

  const handlePropose = () => {
    if (!writeAllowed || !isParticipant || !activePreflight || activePreflight.validUntil <= Date.now() ||
        address?.toLowerCase() !== activePreflight.account.toLowerCase()) {
      toast.error('Run a fresh preflight with the connected participant wallet.'); return
    }
    reset()
    setSubmittedChainId(selectedChainId)
    writeContract({ address: vaultAddress, abi: VAULT_ABI, functionName: 'proposePayment',
      args: activePreflight.args, chainId: selectedChainId, gas: activePreflight.gas,
      maxFeePerGas: activePreflight.maxFeePerGas, maxPriorityFeePerGas: activePreflight.maxPriorityFeePerGas })
    setPreflight(null)
  }

  const activeEarlyPreflight = earlyPreflight?.scope === scope && earlyPreflight.validUntil > nowSec * 1000 ? earlyPreflight : null

  const handleEarlyPreflight = async () => {
    if (!publicClient || !address || !writeAllowed || !isParticipant) return
    const attempt = ++preparation.current
    setEarlyPreflight(null)
    setPreflightError('')
    setPreparing(true)
    try {
      const result = await prepareEarlyReturn(publicClient, address, vaultAddress, expiryHours, selectedChainId)
      if (currentScope.current === scope && preparation.current === attempt) setEarlyPreflight({ ...result, scope })
    } catch (error) {
      if (preparation.current === attempt) setPreflightError(parseOnchainError(error))
    } finally {
      if (preparation.current === attempt) setPreparing(false)
    }
  }

  const handleProposeEarlyReturn = () => {
    if (!writeAllowed || !isParticipant || !activeEarlyPreflight || activeEarlyPreflight.validUntil <= Date.now() ||
        address?.toLowerCase() !== activeEarlyPreflight.account.toLowerCase()) {
      toast.error('Run a fresh early return check first.'); return
    }
    reset()
    setSubmittedChainId(selectedChainId)
    writeContract({ address: vaultAddress, abi: VAULT_ABI, functionName: 'proposeEarlyReturn',
      args: activeEarlyPreflight.args, chainId: selectedChainId, gas: activeEarlyPreflight.gas,
      maxFeePerGas: activeEarlyPreflight.maxFeePerGas, maxPriorityFeePerGas: activeEarlyPreflight.maxPriorityFeePerGas })
    setEarlyPreflight(null)
  }

  const remaining = totalC - totalS
  // Explorer link always uses the chain the tx was submitted on.
  const explorerChainId = submittedChainId ?? selectedChainId

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Proposals &amp; Spending
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Available: ${formatUsdc(remaining)} USDC · threshold {threshold} · spend deadline {formatTs(spendUntil)}
        </p>
      </div>

      {!writeAllowed && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
          Transaction submission is disabled. Connect an eligible wallet on {chainConfig?.label}
          {' '}and verify the reviewed factory registry. Read-only checks remain available.
        </div>
      )}

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {(['proposals', 'propose', 'early'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t === 'proposals' ? 'Proposals' : t === 'propose' ? 'New Payment' : 'Early Return'}
          </button>
        ))}
      </div>

      {tab === 'proposals' && (
        <div className="space-y-3">
          {selectedChainId === 5042002 && (
            <p className="text-xs text-slate-500">
              Approval fee limit: 0.00492595 test USDC. Verify the wallet keeps this limit.
              {' '}Payment execution fee limit: 0.00758295 test USDC.
              {' '}Early return execution fee limit: 0.0051926 test USDC.
              Complete approval before the proposal expires.
            </p>
          )}
          {proposalCount === 0 && (
            <div className="text-sm text-slate-400 text-center py-6">No proposals yet.</div>
          )}
          {proposalIds.map(id => {
            const propResult = proposalsData?.[id * 2]?.result as
              readonly [number, string, bigint, `0x${string}`, bigint, bigint, boolean, boolean] | undefined
            const votedResult = proposalsData?.[id * 2 + 1]?.result as boolean | undefined
            if (!propResult) return null
            const [pType, dest, amt, , expiresAt, approvalCount, executed, cancelled] = propResult
            const hasVoted   = votedResult ?? false
            const isPayment  = pType === 0
            const expired    = Number(expiresAt) <= nowSec
            const canExecute = !executed && !cancelled && !expired && Number(approvalCount) >= threshold
            const isInvalid  = executed || cancelled || expired
            const reviewKey = `${scope}:${id}:${dest}:${amt}:${expiresAt}:${approvalCount}:${threshold}`
            const reviewed = reviewedProposal === reviewKey

            return (
              <div key={id} className={`rounded-xl border px-4 py-3 text-sm space-y-2 ${
                isInvalid ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium text-slate-800">
                      #{id} — {isPayment ? 'Payment' : 'Early Return'}
                    </span>
                    {executed  && <span className="ml-2 text-xs text-emerald-600 font-medium">Executed</span>}
                    {cancelled && <span className="ml-2 text-xs text-slate-400 font-medium">Cancelled</span>}
                    {expired && !executed && !cancelled && <span className="ml-2 text-xs text-amber-500 font-medium">Expired</span>}
                  </div>
                  <span className="text-xs text-slate-400 tabular-nums shrink-0">
                    {Number(approvalCount)}/{threshold} approvals
                  </span>
                </div>

                {isPayment && (
                  <div className="text-xs text-slate-500 space-y-0.5">
                    <div>To: <span className="font-mono text-slate-700 break-all">{dest}</span></div>
                    <div>Amount: <span className="font-semibold text-slate-800">${formatUsdc6dp(amt)} USDC</span></div>
                  </div>
                )}

                <div className="text-xs text-slate-500">Expires: {formatTs(expiresAt)}</div>

                {!isInvalid && writeAllowed && <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={reviewed} onChange={event => setReviewedProposal(event.target.checked ? reviewKey : '')} />I checked {chainConfig?.label}, proposal #{id}, {isPayment ? 'the full recipient and exact amount' : 'ending all spending and starting refunds'}, and expiry. Approval does not execute it. Each action has a separate network fee; review the maximum in the wallet.</label>}

                {!isInvalid && writeAllowed && isParticipant && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    {!hasVoted && (
                      <TxButton
                        onClick={() => sendTx('approve', [BigInt(id)])}
                        pending={isPending || preparingApproval} confirming={isConfirming}
                        label="Approve" variant="ghost" className="text-xs py-1.5 px-3"
                        disabled={!reviewed}
                      />
                    )}
                    {hasVoted && (
                      <TxButton
                        onClick={() => sendTx('revoke', [BigInt(id)])}
                        pending={isPending} confirming={isConfirming}
                        label="Revoke" variant="ghost" className="text-xs py-1.5 px-3"
                      />
                    )}
                    {canExecute && (
                      <TxButton
                        onClick={() => sendTx(isPayment ? 'execute' : 'executeEarlyReturn', [BigInt(id)])}
                        pending={isPending} confirming={isConfirming}
                        label={isPayment ? 'Execute Payment' : 'Execute Early Return'}
                        disabled={!reviewed}
                        className="text-xs py-1.5 px-3"
                      />
                    )}
                  </div>
                )}

                {!isInvalid && writeAllowed && !isParticipant && canExecute && (
                  <div className="flex gap-2 pt-1">
                    <TxButton
                      onClick={() => sendTx(isPayment ? 'execute' : 'executeEarlyReturn', [BigInt(id)])}
                      pending={isPending} confirming={isConfirming}
                      label={isPayment ? 'Execute Payment' : 'Execute Early Return'}
                      disabled={!reviewed}
                      className="text-xs py-1.5 px-3"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'propose' && (
        <div className="space-y-4">
          {!isParticipant && address && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700">
              Your wallet is not a participant in this vault.
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
              Recipient address
            </label>
            <input
              type="text" placeholder="0x…"
              value={destAddr} onChange={e => setDestAddr(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
              Amount (USDC)
            </label>
            <input
              type="text" inputMode="decimal" placeholder="0.00"
              value={amountStr} onChange={e => setAmountStr(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            />
            <p className="text-xs text-slate-400 mt-1">Available: ${formatUsdc(remaining)} USDC</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
              Memo (optional)
            </label>
            <input
              type="text" placeholder="e.g. venue deposit"
              value={memo} onChange={e => setMemo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
              Proposal valid for (hours)
            </label>
            <input
              type="number" min={1} value={expiryHours} onChange={e => setExpiryHours(e.target.value)}
              className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          {destAddr && amountStr && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1">
              <div className="font-medium text-slate-800 mb-1">Review before proposing</div>
              <div>Network: <strong>{chainConfig?.label}</strong></div>
              <div>Recipient: <span className="font-mono">{destAddr}</span></div>
              <div>Amount: <strong>${amountStr} USDC</strong></div>
              <div>Requested duration: {expiryHours} hours. Exact expiry is fixed by the preflight below.</div>
              <div>Required approvals: {threshold}</div>
              <div className="text-amber-600 mt-1">
                Verify the recipient address carefully before submitting.
                Any {threshold} signers can approve payment to this address.
              </div>
            </div>
          )}

          {!address && (
            <label className="block text-xs text-slate-600">Simulation sender (read-only; does not connect a wallet)
              <input aria-label="Simulation sender" value={simulationSender} onChange={event => setSimulationSender(event.target.value)}
                className="w-full rounded-xl border px-3 py-2 font-mono" placeholder="0x…" />
            </label>
          )}
          <button onClick={() => void handlePreflight()} disabled={preparing}
            className="w-full rounded-xl border px-3 py-2 text-sm">
            {preparing ? 'Checking…' : 'Check payment (no signature or submission)'}
          </button>
          {preflightError && <p role="alert" className="text-xs text-red-700">{preflightError}</p>}
          {activePreflight && (
            <div className="rounded-xl border bg-emerald-50 p-3 text-xs space-y-1 break-all" aria-label="Payment preflight">
              <strong>Read-only preflight PASS — no transaction sent</strong>
              <div>Chain ID: {activePreflight.chainId}</div>
              <div>Sender: {activePreflight.account}</div>
              <div>Vault: {activePreflight.to}</div>
              <div>Recipient: {activePreflight.args[0]}</div>
              <div>Amount (6 decimals): {activePreflight.args[1].toString()}</div>
              <div>Memo hash: {activePreflight.args[2]}</div>
              <div>Exact expiry: {new Date(Number(activePreflight.args[3]) * 1000).toISOString()}</div>
              <div>Native value: 0</div>
              <div>Block: {activePreflight.blockNumber.toString()}</div>
              <div>Estimated gas: {activePreflight.estimatedGas.toString()}</div>
              <div>Gas limit (20% buffer): {activePreflight.gas.toString()}</div>
              <div>maxFeePerGas: {activePreflight.maxFeePerGas.toString()} wei</div>
              <div>maxPriorityFeePerGas: {activePreflight.maxPriorityFeePerGas.toString()} wei</div>
              <div>Maximum network fee: {formatUnits(activePreflight.maxFee, 18)} test USDC</div>
              <div>Pending nonce observed: {activePreflight.nonce}</div>
              <div>Calldata: {activePreflight.data}</div>
              <div>Valid until: {new Date(activePreflight.validUntil).toISOString()}</div>
              <div>RPC estimates and explicit request caps. Wallet confirmation may override them; review it before signing.</div>
            </div>
          )}
          <TxButton
            onClick={handlePropose}
            pending={isPending} confirming={isConfirming}
            label="Submit Proposal"
            disabled={!writeAllowed || !isParticipant || !activePreflight || preparing}
            className="w-full"
          />
          {isSuccess && receipt?.status === 'success' && txHash && (
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 size={12} /> Proposed.{' '}
              <a href={buildTxExplorerUrl(explorerChainId, txHash)} target="_blank" rel="noopener noreferrer"
                className="underline flex items-center gap-0.5">Tx <ExternalLink size={9} /></a>
            </div>
          )}
        </div>
      )}

      {tab === 'early' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-purple-50 border border-purple-100 px-4 py-3 text-sm text-purple-700">
            <strong>Early Return</strong> — propose to end the spend window immediately and return
            all remaining USDC pro-rata to contributors. Requires {threshold} approvals.
            The spend deadline is not changed; only a flag is set.
          </div>
          <div className="flex items-center gap-2">
            <RotateCcw size={14} className="text-slate-400" />
            <span className="text-xs text-slate-500">Proposal valid for (hours):</span>
            <input
              type="number" min={1} value={expiryHours} onChange={e => setExpiryHours(e.target.value)}
              className="w-20 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <TxButton
            onClick={handleEarlyPreflight}
            pending={preparing} confirming={false}
            label="Check early return (no signature or submission)"
            disabled={!writeAllowed || !isParticipant || isPending || isConfirming}
            className="w-full"
          />
          {preflightError && <p className="text-xs text-red-600">{preflightError}</p>}
          {activeEarlyPreflight && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-slate-700 break-all">
              <div>Read-only early return preflight PASS — no transaction sent</div>
              <div>Sender: {activeEarlyPreflight.account}</div>
              <div>Vault: {vaultAddress}</div>
              <div>Exact expiry: {new Date(Number(activeEarlyPreflight.expiresAt) * 1000).toISOString()}</div>
              <div>Gas limit: {activeEarlyPreflight.gas.toString()}</div>
              <div>maxFeePerGas: {activeEarlyPreflight.maxFeePerGas.toString()} wei</div>
              <div>maxPriorityFeePerGas: {activeEarlyPreflight.maxPriorityFeePerGas.toString()} wei</div>
              <div>Maximum network fee: {formatUnits(activeEarlyPreflight.gas * activeEarlyPreflight.maxFeePerGas, 18)} test USDC</div>
              <div>Calldata: {activeEarlyPreflight.data}</div>
            </div>
          )}
          <TxButton
            onClick={handleProposeEarlyReturn}
            pending={isPending} confirming={isConfirming}
            label="Propose Early Return"
            disabled={!writeAllowed || !isParticipant || !activeEarlyPreflight || preparing}
            className="w-full"
          />
          {isSuccess && receipt?.status === 'success' && txHash && (
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 size={12} /> Early return proposed.{' '}
              <a href={buildTxExplorerUrl(explorerChainId, txHash)} target="_blank" rel="noopener noreferrer"
                className="underline flex items-center gap-0.5">Tx <ExternalLink size={9} /></a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
