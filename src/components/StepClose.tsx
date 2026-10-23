import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { prepareClose } from '@/lib/approval-preflight'
import { VAULT_ABI } from '@/lib/abi'
import { formatUsdc6dp } from '@/lib/format'
import { useWriteAllowed, WriteGate } from './WriteGate'
import { parseOnchainError } from '@/lib/errors'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { TxButton } from './TxButton'
import { ExternalLink, CheckCircle2, Lock } from 'lucide-react'
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
 * Step 6 — Close the vault once all liabilities are settled.
 *
 * close() is permissionless (anyone can call on-chain) but still requires:
 *   1. A connected wallet on the correct chain
 *   2. A reviewed factory address in the allowlist
 *   3. The vault confirmed registered in that factory
 *
 * These conditions are the same as every other write step. Reaching the
 * Returning or Closed phase does NOT verify that the factory itself is a
 * reviewed deployment — phase is determined by the vault's internal clock,
 * not by factory provenance. The allowlist is the only provenance guard.
 *
 * Reads (accounting summary) are available without a wallet.
 */
export function StepClose({
  vaultAddress,
  selectedChainId,
  factoryAddress,
  isVaultRegistered,
  isVaultRegisteredLoading,
  isVaultRegisteredError,
}: Props) {
  const { address, chainId: walletChainId } = useAccount()
  const publicClient = usePublicClient({ chainId: selectedChainId })
  const [preparingClose, setPreparingClose] = useState(false)
  // Apply the full shared gate — same conditions as every other write step.
  const writeAllowed = useWriteAllowed(
    selectedChainId,
    factoryAddress,
    vaultAddress,
    isVaultRegistered,
    isVaultRegisteredLoading,
    isVaultRegisteredError,
  )

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'closed',                  chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalRemainingLiability',  chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalContributions',       chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalSpent',               chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalRefunded',            chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'strandedSurplus',          chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'finalized',               chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'getPhase',                chainId: selectedChainId },
    ],
  })

  const [closedR, liabilityR, totalCR, totalSR, totalRR, surplusR, finalizedR, phaseR] = (data ?? []).map(d => d.result)
  const isClosed  = (closedR   as boolean) ?? false
  const liability = (liabilityR as bigint) ?? 0n
  const totalC    = (totalCR   as bigint)  ?? 0n
  const totalS    = (totalSR   as bigint)  ?? 0n
  const totalR    = (totalRR   as bigint)  ?? 0n
  const surplus   = (surplusR  as bigint)  ?? 0n

  const canClose = !!data?.every(result => result.status === 'success') && finalizedR === true && phaseR === 2 && liability === 0n && !isClosed
  const closeScope = JSON.stringify([address, walletChainId, selectedChainId, factoryAddress, vaultAddress, writeAllowed, canClose])
  const currentCloseScope = useRef(closeScope)
  useEffect(() => { currentCloseScope.current = closeScope }, [closeScope])

  // Capture the chain at submission time so receipt polling and explorer links
  // remain correct even if the user switches networks mid-confirmation.
  const [submittedChainId, setSubmittedChainId] = useState<number | undefined>(undefined)

  const { writeContract, data: txHash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: submittedChainId,
  })

  useEffect(() => {
    if (isSuccess && receipt?.status === 'success') {
      void refetch()
      toast.success('Vault closed.')
      reset()
    }
  }, [isSuccess, receipt, refetch, reset])

  useEffect(() => {
    if (isError && error) toast.error(parseOnchainError(error))
  }, [isError, error])

  const handleClose = async () => {
    if (!writeAllowed) { toast.error('Connect your wallet on the correct network.'); return }
    if (!canClose || preparingClose || isPending || isConfirming) return
    let fees: Awaited<ReturnType<typeof prepareClose>> | undefined
    {
      if (!publicClient || !address) return
      setPreparingClose(true)
      try {
        fees = await prepareClose(publicClient, address, vaultAddress, selectedChainId)
        if (currentCloseScope.current !== closeScope) { toast.error('Wallet or vault changed. Check again.'); return }
      } catch (error) {
        toast.error(parseOnchainError(error))
        return
      } finally {
        setPreparingClose(false)
      }
    }
    reset()
    setSubmittedChainId(selectedChainId)
    writeContract({ address: vaultAddress, abi: VAULT_ABI, functionName: 'close', chainId: selectedChainId, account: address, ...fees })
  }

  const explorerChainId = submittedChainId ?? selectedChainId

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Close Vault
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Anyone can close the vault once all positive-entitlement claims have been processed.
          This is an accounting closure only — no funds are moved.
        </p>
      </div>

      {selectedChainId === 5042002 && (
        <p className="text-xs text-slate-500">Close network fee limit: 0.001931 test USDC. Verify the wallet keeps this limit.</p>
      )}

      {!writeAllowed && !isClosed && (
        <WriteGate selectedChainId={selectedChainId} factoryAddress={factoryAddress} vaultAddress={vaultAddress} isVaultRegistered={isVaultRegistered} isVaultRegisteredLoading={isVaultRegisteredLoading} isVaultRegisteredError={isVaultRegisteredError}>{null}</WriteGate>
      )}

      {/* Final accounting — always visible without a wallet */}
      <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-4 space-y-2 text-sm">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">Final accounting</div>
        <div className="flex justify-between">
          <span className="text-slate-500">Total contributed</span>
          <span className="tabular-nums font-medium">${formatUsdc6dp(totalC)} USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Spent</span>
          <span className="tabular-nums">${formatUsdc6dp(totalS)} USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Refunded</span>
          <span className="tabular-nums">${formatUsdc6dp(totalR)} USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Outstanding liability</span>
          <span className={`tabular-nums font-medium ${liability > 0n ? 'text-amber-600' : 'text-emerald-600'}`}>
            {finalizedR === true ? `$${formatUsdc6dp(liability)} USDC` : 'Not finalized'}
          </span>
        </div>
        {surplus > 0n && (
          <div className="flex justify-between text-slate-400">
            <span>Stranded surplus (locked in vault)</span>
            <span className="tabular-nums">${formatUsdc6dp(surplus)} USDC</span>
          </div>
        )}
      </div>

      {isClosed ? (
        <div className="rounded-2xl bg-slate-100 border border-slate-200 px-4 py-4 flex items-center gap-3">
          <Lock size={18} className="text-slate-400 shrink-0" />
          <div>
            <div className="font-medium text-slate-700 text-sm">Vault is closed</div>
            <div className="text-xs text-slate-400 mt-0.5">No further state changes are possible.</div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {!canClose && liability > 0n && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700">
              ${formatUsdc6dp(liability)} USDC in outstanding claims must be processed before closing.
              Return to the Return step and call claimFor for each unclaimed participant.
            </div>
          )}
          <TxButton
            onClick={handleClose}
            pending={isPending || preparingClose}
            confirming={isConfirming}
            label="Close Vault"
            disabled={!canClose || !writeAllowed || preparingClose}
            className="w-full"
          />
          {isSuccess && txHash && (
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 size={12} /> Closed.{' '}
              <a href={buildTxExplorerUrl(explorerChainId, txHash)} target="_blank" rel="noopener noreferrer"
                className="underline flex items-center gap-0.5">Tx <ExternalLink size={9} /></a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
