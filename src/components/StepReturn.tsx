import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { prepareRefund, prepareCappedTransaction } from '@/lib/approval-preflight'
import { encodeFunctionData } from 'viem'
import { VAULT_ABI } from '@/lib/abi'
import { formatUsdc, formatUsdc6dp, shortenAddress } from '@/lib/format'
import { useWriteAllowed, WriteGate } from './WriteGate'
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

/**
 * Step 5 — Finalize and claim refund entitlements.
 *
 * claimFor is permissionless: any wallet can trigger a claim on behalf of any
 * participant. The write gate still applies (chain + reviewed factory + vault).
 * Reads are available without a wallet connection.
 */
export function StepReturn({
  vaultAddress,
  selectedChainId,
  factoryAddress,
  isVaultRegistered,
  isVaultRegisteredLoading,
  isVaultRegisteredError,
}: Props) {
  const { address, chainId: walletChainId } = useAccount()
  const publicClient = usePublicClient({ chainId: selectedChainId })
  const [preparingClaim, setPreparingClaim] = useState(false)

  const writeAllowed = useWriteAllowed(
    selectedChainId, factoryAddress, vaultAddress,
    isVaultRegistered, isVaultRegisteredLoading, isVaultRegisteredError,
  )
  const claimScope = JSON.stringify([address, walletChainId, selectedChainId, factoryAddress, vaultAddress, writeAllowed])
  const currentClaimScope = useRef(claimScope)
  currentClaimScope.current = claimScope

  const { data: baseData, refetch } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'finalized',               chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'returnPool',              chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'totalRemainingLiability', chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'participantCount',        chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'contributions', args: [address ?? '0x0000000000000000000000000000000000000000'], chainId: selectedChainId },
    ] as const,
  })

  const [finalizedR, poolR, liabilityR, nParticipantsR, ownContributionR] = (baseData ?? []).map(d => d.result)
  const isFinalized   = (finalizedR   as boolean)  ?? false
  const returnPool    = (poolR        as bigint)   ?? 0n
  const liability     = (liabilityR   as bigint)   ?? 0n
  const nParticipants = nParticipantsR !== undefined ? Number(nParticipantsR) : 0

  const { data: participantData } = useReadContracts({
    contracts: Array.from({ length: nParticipants }, (_, i) => ({
      address: vaultAddress, abi: VAULT_ABI, functionName: 'participants' as const, args: [BigInt(i)], chainId: selectedChainId,
    })),
    query: { enabled: nParticipants > 0 },
  })
  const participantAddresses = (participantData ?? [])
    .map(d => d.result)
    .filter(Boolean) as `0x${string}`[]

  const { data: entData, refetch: refetchEnt } = useReadContracts({
    contracts: participantAddresses.flatMap(p => [
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'entitlement' as const, args: [p], chainId: selectedChainId },
      { address: vaultAddress, abi: VAULT_ABI, functionName: 'claimed'     as const, args: [p], chainId: selectedChainId },
    ]),
    query: { enabled: participantAddresses.length > 0 },
  })

  const refetchAll = () => { void refetch(); void refetchEnt() }

  // Capture the chain the transaction was submitted on.
  const [submittedChainId, setSubmittedChainId] = useState<number | undefined>(undefined)

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: submittedChainId,
  })

  useEffect(() => {
    if (!isSuccess || !receipt) return
    if (receipt.status !== 'success') { toast.error('Transaction reverted on-chain.'); return }
    refetchAll()
    reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, receipt])

  useEffect(() => {
    if (!error) return
    toast.error(parseOnchainError(error))
  }, [error])

  const handleFinalize = async () => {
    if (!writeAllowed) { toast.error('Writes are disabled.'); return }
    if (!publicClient || !address || preparingClaim || isPending || isConfirming) return
    setPreparingClaim(true)
    try {
      const fees = await prepareCappedTransaction(publicClient, address, vaultAddress,
        encodeFunctionData({ abi: VAULT_ABI, functionName: 'finalize' }), 273_945n, selectedChainId)
      if (currentClaimScope.current !== claimScope) { toast.error('Wallet or vault changed. Check again.'); return }
      reset()
      setSubmittedChainId(selectedChainId)
      writeContract({ address: vaultAddress, abi: VAULT_ABI, functionName: 'finalize', chainId: selectedChainId, account: address, ...fees })
    } catch (error) {
      toast.error(parseOnchainError(error))
    } finally {
      setPreparingClaim(false)
    }
  }

  const handleClaimFor = async (participant: `0x${string}`) => {
    if (!writeAllowed) { toast.error('Writes are disabled.'); return }
    if (preparingClaim || isPending || isConfirming) return
    let fees: Awaited<ReturnType<typeof prepareRefund>> | undefined
    {
      if (!publicClient || !address) return
      setPreparingClaim(true)
      try {
        fees = await prepareRefund(publicClient, address, vaultAddress, participant, selectedChainId)
        if (currentClaimScope.current !== claimScope) { toast.error('Wallet or vault changed. Check again.'); return }
      } catch (error) {
        toast.error(parseOnchainError(error))
        return
      } finally {
        setPreparingClaim(false)
      }
    }
    reset()
    setSubmittedChainId(selectedChainId)
    writeContract({ address: vaultAddress, abi: VAULT_ABI, functionName: 'claimFor', args: [participant], chainId: selectedChainId, account: address, ...fees })
  }

  const explorerChainId = submittedChainId ?? selectedChainId

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Return Funds
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          A claim can finalize entitlements and return funds in one transaction. You can also finalize separately.
          Anyone can call claimFor — wallet connection required but participants can help each other.
          These are external on-chain transactions; nothing runs automatically.
        </p>
      </div>

      {selectedChainId === 5042002 && (
        <p className="text-xs text-slate-500">Refund network fee limit: 0.01369725 test USDC. Verify the wallet keeps this limit.</p>
      )}

      {!isFinalized && address && (ownContributionR as bigint ?? 0n) > 0n && (
        <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-xs text-slate-600">Finalize and claim to {address}. No separate finalize transaction is needed.</p>
          <TxButton onClick={() => handleClaimFor(address)} pending={isPending || preparingClaim} confirming={isConfirming}
            label="Finalize & claim my refund" disabled={!writeAllowed || preparingClaim} className="w-full" />
        </div>
      )}

      {!writeAllowed && (
        <WriteGate selectedChainId={selectedChainId} factoryAddress={factoryAddress} vaultAddress={vaultAddress} isVaultRegistered={isVaultRegistered} isVaultRegisteredLoading={isVaultRegisteredLoading} isVaultRegisteredError={isVaultRegisteredError}>{null}</WriteGate>
      )}

      {isFinalized && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3">
          <div className="text-xs text-emerald-600 uppercase tracking-widest mb-0.5">Return pool</div>
          <div className="text-2xl font-semibold tabular-nums text-emerald-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            ${formatUsdc(returnPool)} <span className="text-base font-normal text-emerald-500">USDC</span>
          </div>
          <div className="text-xs text-emerald-600 mt-0.5">Outstanding: ${formatUsdc(liability)} USDC</div>
        </div>
      )}

      {!isFinalized && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Anyone can finalize. This snapshots each participant's entitlement based on their
            contribution share. No funds move during finalize — only accounting is set.
          </p>
          <TxButton
            onClick={handleFinalize}
            pending={isPending || preparingClaim} confirming={isConfirming}
            label="Finalize"
            disabled={!writeAllowed || preparingClaim}
            className="w-full"
          />
        </div>
      )}

      {isSuccess && receipt?.status === 'success' && txHash && (
        <div className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 size={12} /> Transaction confirmed.{' '}
          <a href={buildTxExplorerUrl(explorerChainId, txHash)} target="_blank" rel="noopener noreferrer"
            className="underline flex items-center gap-0.5">Tx <ExternalLink size={9} /></a>
        </div>
      )}

      {isFinalized && participantAddresses.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-widest">Participants</div>
          {participantAddresses.map((p, i) => {
            const ent      = (entData?.[i * 2]?.result     as bigint)  ?? 0n
            const isClaimed = (entData?.[i * 2 + 1]?.result as boolean) ?? false
            const isMe     = p.toLowerCase() === address?.toLowerCase()

            return (
              <div key={p} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                isClaimed ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'
              }`}>
                <div>
                  <span className="font-mono text-xs text-slate-700">{shortenAddress(p)}</span>
                  {isMe && <span className="ml-1 text-xs text-blue-500">(you)</span>}
                  <div className="text-xs text-slate-400 mt-0.5">
                    Entitlement: <span className="font-semibold tabular-nums">${formatUsdc6dp(ent)} USDC</span>
                  </div>
                </div>
                <div>
                  {isClaimed ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <CheckCircle2 size={12} /> Claimed
                    </span>
                  ) : ent > 0n ? (
                    <TxButton
                      onClick={() => handleClaimFor(p)}
                      pending={isPending || preparingClaim} confirming={isConfirming}
                      label="Claim"
                      disabled={!writeAllowed}
                      variant="ghost"
                      className="text-xs py-1.5 px-3"
                    />
                  ) : (
                    <span className="text-xs text-slate-300">Zero entitlement</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
