import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { prepareCappedTransaction } from '@/lib/approval-preflight'
import { VAULT_ABI, ERC20_APPROVE_ABI } from '@/lib/abi'
import { CHAIN_CONFIG } from '@/lib/constants'
import { formatUsdc, parseUsdc, shortenAddress, formatTs } from '@/lib/format'
import { useWriteAllowed } from './WriteGate'
import { parseOnchainError } from '@/lib/errors'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { TxButton } from './TxButton'
import { ExternalLink, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  vaultAddress: `0x${string}`
  selectedChainId: number
  factoryAddress?: string
  isVaultRegistered?: boolean
  isVaultRegisteredLoading?: boolean
  isVaultRegisteredError?: boolean
}

/** Step 2 — Deposit USDC into the vault during Collecting phase. */
export function StepCollect({
  vaultAddress,
  selectedChainId,
  factoryAddress,
  isVaultRegistered,
  isVaultRegisteredLoading,
  isVaultRegisteredError,
}: Props) {
  const { address, chainId: walletChainId } = useAccount()
  const publicClient = usePublicClient({ chainId: selectedChainId })
  const [preparing, setPreparing] = useState(false)
  const chainConfig = CHAIN_CONFIG[selectedChainId]
  const usdcAddress = chainConfig?.usdcAddress
  const [amountStr, setAmountStr] = useState('')

  const writeAllowed = useWriteAllowed(
    selectedChainId, factoryAddress, vaultAddress,
    isVaultRegistered, isVaultRegisteredLoading, isVaultRegisteredError,
  )
  const collectScope = JSON.stringify([address, walletChainId, selectedChainId, factoryAddress, vaultAddress, amountStr, writeAllowed])
  const currentCollectScope = useRef(collectScope)
  currentCollectScope.current = collectScope

  const sentinel: `0x${string}` = '0x0000000000000000000000000000000000000001'
  const caller = address ?? sentinel

  const { data: vaultData, refetch: refetchVault } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'contributions',     args: [caller], chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'isParticipant',      args: [caller], chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'collectUntil',       chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalContributions', chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'participantCount',   chainId: selectedChainId },
    ],
  })

  const { data: allowanceData, refetch: refetchAllowance } = useReadContracts({
    contracts: usdcAddress ? [
      { address: usdcAddress, abi: ERC20_APPROVE_ABI, functionName: 'allowance' as const, args: [caller, vaultAddress], chainId: selectedChainId },
    ] : [],
    query: { enabled: !!usdcAddress },
  })

  const refetch = () => { void refetchVault(); void refetchAllowance() }

  const [myContrib, isParticipant, collectUntil, totalC, nParticipants] =
    (vaultData ?? []).map(d => d.result)
  const allowance = allowanceData?.[0]?.result

  const amount = parseUsdc(amountStr)
  const hasEnoughAllowance = amount !== null && (allowance as bigint ?? 0n) >= amount

  // Approve flow — capture submitted chain at write time.
  const [approveChainId, setApproveChainId] = useState<number | undefined>(undefined)
  const { writeContract: approve, data: approveHash, isPending: approvePending, error: approveError, reset: resetApprove } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess, data: approveReceipt } = useWaitForTransactionReceipt({
    hash: approveHash,
    chainId: approveChainId,
  })

  useEffect(() => {
    if (!approveSuccess || !approveReceipt) return
    if (approveReceipt.status !== 'success') { toast.error('Approval reverted on-chain.'); return }
    void refetchAllowance()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess, approveReceipt])

  useEffect(() => {
    if (!approveError) return
    toast.error(parseOnchainError(approveError))
  }, [approveError])

  // Deposit flow — capture submitted chain at write time.
  const [depositChainId, setDepositChainId] = useState<number | undefined>(undefined)
  const { writeContract: deposit, data: depositHash, isPending: depositPending, error: depositError, reset: resetDeposit } = useWriteContract()
  const { isLoading: depositConfirming, isSuccess: depositSuccess, data: depositReceipt } = useWaitForTransactionReceipt({
    hash: depositHash,
    chainId: depositChainId,
  })

  useEffect(() => {
    if (!depositSuccess || !depositReceipt) return
    if (depositReceipt.status !== 'success') { toast.error('Deposit reverted on-chain.'); return }
    toast.success('Deposit confirmed.')
    void refetch()
    resetDeposit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositSuccess, depositReceipt])

  useEffect(() => {
    if (!depositError) return
    toast.error(parseOnchainError(depositError))
  }, [depositError])

  const handleApprove = async () => {
    if (!writeAllowed) { toast.error('Writes are disabled.'); return }
    if (!amount || !usdcAddress) { toast.error('Enter a valid amount.'); return }
    if (!publicClient || !address || preparing || approvePending || approveConfirming || depositPending || depositConfirming) return
    setPreparing(true)
    try {
      const fees = await prepareCappedTransaction(publicClient, address, usdcAddress,
        encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [vaultAddress, amount] }),
        100_000n, selectedChainId, amount * 1_000_000_000_000n)
      if (currentCollectScope.current !== collectScope) { toast.error('Wallet, vault or amount changed. Check again.'); return }
      resetApprove()
      setApproveChainId(selectedChainId)
      approve({ address: usdcAddress, abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [vaultAddress, amount], chainId: selectedChainId, account: address, ...fees })
    } catch (error) {
      toast.error(parseOnchainError(error))
    } finally {
      setPreparing(false)
    }
  }

  const handleDeposit = async () => {
    if (!writeAllowed) { toast.error('Writes are disabled.'); return }
    if (!amount) { toast.error('Enter a valid amount.'); return }
    if (!publicClient || !address || preparing || approvePending || approveConfirming || depositPending || depositConfirming) return
    setPreparing(true)
    try {
      const fees = await prepareCappedTransaction(publicClient, address, vaultAddress,
        encodeFunctionData({ abi: VAULT_ABI, functionName: 'deposit', args: [amount] }),
        200_000n, selectedChainId, amount * 1_000_000_000_000n)
      if (currentCollectScope.current !== collectScope) { toast.error('Wallet, vault or amount changed. Check again.'); return }
      resetDeposit()
      setDepositChainId(selectedChainId)
      deposit({ address: vaultAddress, abi: VAULT_ABI, functionName: 'deposit', args: [amount], chainId: selectedChainId, account: address, ...fees })
    } catch (error) {
      toast.error(parseOnchainError(error))
    } finally {
      setPreparing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Contribute USDC
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Deposits close at {formatTs(collectUntil as bigint ?? 0n)}.
          Total so far: ${formatUsdc(totalC as bigint ?? 0n)} from {Number(nParticipants ?? 0)} participants.
        </p>
      </div>

      {!writeAllowed && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
          Deposits are disabled: factory not in reviewed allowlist for {chainConfig?.label}.
        </div>
      )}

      {isParticipant !== undefined && !(isParticipant as boolean) && address && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-700">
          Your connected wallet ({shortenAddress(address)}) is not a participant in this vault.
          Reads are still available.
        </div>
      )}

      <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
        <div className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Your contribution</div>
        <div className="text-2xl font-semibold tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          ${formatUsdc(myContrib as bigint ?? 0n)}
          <span className="text-base font-normal text-slate-400 ml-1">USDC</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
          Amount (USDC)
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="text" inputMode="decimal" placeholder="0.00"
            value={amountStr} onChange={e => setAmountStr(e.target.value)}
            disabled={!writeAllowed}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
          />
          <span className="text-sm text-slate-400">USDC</span>
        </div>
      </div>

      {!hasEnoughAllowance ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Step 1: approve the vault to spend your USDC.</p>
          <TxButton
            onClick={handleApprove}
            pending={approvePending}
            confirming={approveConfirming}
            label="Approve USDC"
            pendingLabel="Confirm approval in wallet…"
            disabled={!writeAllowed || !amount || amount <= 0n || preparing}
            className="w-full"
          />
          {approveSuccess && approveReceipt?.status === 'success' && approveHash && (
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 size={12} /> Approved.{' '}
              <a href={buildTxExplorerUrl(approveChainId ?? selectedChainId, approveHash)} target="_blank" rel="noopener noreferrer"
                className="underline flex items-center gap-0.5">Tx <ExternalLink size={9} /></a>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <TxButton
            onClick={handleDeposit}
            pending={depositPending}
            confirming={depositConfirming}
            label={`Deposit $${amountStr || '0'} USDC`}
            disabled={!writeAllowed || !amount || amount <= 0n || preparing}
            className="w-full"
          />
          {depositSuccess && depositReceipt?.status === 'success' && depositHash && (
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 size={12} /> Deposit confirmed.{' '}
              <a href={buildTxExplorerUrl(depositChainId ?? selectedChainId, depositHash)} target="_blank" rel="noopener noreferrer"
                className="underline flex items-center gap-0.5">Tx <ExternalLink size={9} /></a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
