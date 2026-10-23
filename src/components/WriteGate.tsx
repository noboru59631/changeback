/**
 * WriteGate — shared write-operation gate for ChangeBack.
 *
 * Renders children only when ALL of the following are true:
 *   1. A wallet is connected.
 *   2. The wallet's chain matches the selected viewing chain.
 *   3. The factory address appears in REVIEWED_FACTORY_ADDRESSES for that chain.
 *   4. When a vault is provided: factory.isVault(vault) === true (confirmed,
 *      not loading, not error).
 *
 * Nothing short of all four conditions unlocks writes. In particular:
 *   - A mainnet-warning acknowledgement toggle does NOT bypass this gate.
 *   - A passing factory.isVault() call alone does NOT bypass this gate.
 *   - A runtime user-pasted factory address does NOT bypass this gate.
 *   - Loading or error states from the registry call DO block writes.
 *
 * claimFor is permissionless — any wallet can call it — but it still requires
 * a matching chain and a verified vault (conditions 2 + 4).
 *
 * Usage:
 *   <WriteGate selectedChainId={…} factoryAddress={…} vaultAddress={…}
 *              isVaultRegistered={…} isVaultRegisteredLoading={…}
 *              isVaultRegisteredError={…}>
 *     <TxButton … />
 *   </WriteGate>
 */

import type { ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { isReviewedFactory, CHAIN_CONFIG } from '@/lib/constants'
import { AlertTriangle, ShieldOff } from 'lucide-react'

export type WriteGateReason =
  | 'no-wallet'
  | 'wrong-chain'
  | 'unreviewed-factory'
  | 'vault-not-registered'
  | 'registry-loading'
  | 'registry-error'
  | 'ok'

export interface WriteGateProps {
  /** The chain the user is viewing (from URL or selector — NOT the wallet). */
  selectedChainId: number
  /** Optional: factory address the user entered. */
  factoryAddress?: string
  /** Optional: vault address. When provided the gate also checks isVault. */
  vaultAddress?: string
  /** Result of factory.isVault(vaultAddress). Undefined = not yet needed. */
  isVaultRegistered?: boolean
  isVaultRegisteredLoading?: boolean
  isVaultRegisteredError?: boolean
  children: ReactNode
  /** When true, the gate renders nothing when blocked (caller shows its own UI). */
  silent?: boolean
}

/**
 * Pure function — no hooks, no React. Exported for unit testing.
 * All write components call useWriteAllowed() which calls this internally.
 */
export function gateReason(
  walletChainId: number | undefined,
  isWalletConnected: boolean,
  selectedChainId: number,
  factoryAddress: string | undefined,
  vaultAddress: string | undefined,
  isVaultRegistered: boolean | undefined,
  isVaultRegisteredLoading: boolean | undefined,
  isVaultRegisteredError: boolean | undefined,
): WriteGateReason {
  if (!isWalletConnected) return 'no-wallet'
  if (walletChainId !== selectedChainId) return 'wrong-chain'
  if (!factoryAddress || !isReviewedFactory(selectedChainId, factoryAddress)) return 'unreviewed-factory'
  // Vault check only needed when a vault address is provided
  if (vaultAddress) {
    if (isVaultRegisteredError) return 'registry-error'
    if (isVaultRegisteredLoading || isVaultRegistered === undefined) return 'registry-loading'
    if (!isVaultRegistered) return 'vault-not-registered'
  }
  return 'ok'
}

export function WriteGate({
  selectedChainId,
  factoryAddress,
  vaultAddress,
  isVaultRegistered,
  isVaultRegisteredLoading,
  isVaultRegisteredError,
  children,
  silent = false,
}: WriteGateProps) {
  const { isConnected, chainId: walletChainId } = useAccount()
  const chainLabel = CHAIN_CONFIG[selectedChainId]?.label ?? `chain ${selectedChainId}`

  const reason = gateReason(
    walletChainId,
    isConnected,
    selectedChainId,
    factoryAddress,
    vaultAddress,
    isVaultRegistered,
    isVaultRegisteredLoading,
    isVaultRegisteredError,
  )

  if (reason === 'ok') return <>{children}</>
  if (silent) return null

  const messages: Record<WriteGateReason, string> = {
    'no-wallet': 'Connect your wallet to submit transactions.',
    'wrong-chain': `Switch your wallet to ${chainLabel} to submit transactions.`,
    'unreviewed-factory': `Writes are disabled: this factory is not reviewed for ${chainLabel}. Choose the reviewed factory in settings.`,
    'vault-not-registered': 'Writes are disabled: this vault is not registered in the configured factory. It may have been deployed outside the factory.',
    'registry-loading': 'Checking vault registry…',
    'registry-error': 'Could not verify vault registry. Writes are disabled until the check succeeds.',
    'ok': '',
  }

  const isHard = reason === 'unreviewed-factory' || reason === 'vault-not-registered' || reason === 'registry-error'

  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-start gap-2 text-xs ${
      isHard
        ? 'bg-red-50 border-red-100 text-red-700'
        : 'bg-amber-50 border-amber-100 text-amber-700'
    }`}>
      {isHard
        ? <ShieldOff size={13} className="shrink-0 mt-0.5" />
        : <AlertTriangle size={13} className="shrink-0 mt-0.5" />
      }
      <span>{messages[reason]}</span>
    </div>
  )
}

/**
 * Returns true only when ALL write conditions are satisfied.
 * Use in step components to conditionally enable TxButton.
 */
export function useWriteAllowed(
  selectedChainId: number,
  factoryAddress: string | undefined,
  vaultAddress: string | undefined,
  isVaultRegistered: boolean | undefined,
  isVaultRegisteredLoading: boolean | undefined,
  isVaultRegisteredError: boolean | undefined,
): boolean {
  const { isConnected, chainId: walletChainId } = useAccount()
  return gateReason(
    walletChainId,
    isConnected,
    selectedChainId,
    factoryAddress,
    vaultAddress,
    isVaultRegistered,
    isVaultRegisteredLoading,
    isVaultRegisteredError,
  ) === 'ok'
}
