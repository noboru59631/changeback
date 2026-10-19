/**
 * ChangeBack — shared USDC budget app.
 * Six-step lifecycle: Create → Collect → Approve → Spend → Return → Close.
 *
 * CHAIN SELECTION:
 *   The "selected chain" for reads and writes comes from:
 *     1. ?chainId= URL parameter (highest priority — enables wallet-free reads)
 *     2. A user-facing chain selector in the config panel
 *   It is NEVER silently overridden by the connected wallet's chain.
 *   The wallet chain must MATCH the selected chain before any write is allowed.
 *
 * READ-ONLY ACCESS:
 *   VaultCard, StepRail, and all phase/proposal reads are outside the wallet
 *   gate. Anyone with a share link (?chainId=&factory=&vault=) can view vault
 *   state without connecting a wallet.
 *
 * WRITE GATE (enforced by WriteGate / useWriteAllowed):
 *   ALL writes — create, approve-USDC, deposit, propose, vote, revoke, execute,
 *   early-return, pause, finalize, claimFor, close — are disabled unless:
 *     1. Wallet connected
 *     2. Wallet chain === selected chain
 *     3. Factory address is in REVIEWED_FACTORY_ADDRESSES for that chain
 *     4. factory.isVault(vault) === true (when a vault is loaded)
 *   Arc Testnet allowlist: 0x0cf03f85278a7d1ce3057b77043e1b9af3da2ec0.
 *   Arc Mainnet allowlist: empty (no mainnet deployment approved).
 *   No acknowledgement toggle, no runtime paste, no isVault result alone
 *   can bypass these conditions.
 *
 * FACTORY TRUST:
 *   A user-pasted factory address is not trusted provenance. The UI shows the
 *   registry result as informational, clearly labeled as unverified. Unknown
 *   factories keep vault reads open but all writes remain blocked.
 *
 * SHARE LINKS:
 *   Share URLs include ?chainId=&factory=&vault= so mainnet links load
 *   the correct chain without a wallet.
 */

import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { useSwitchChain } from 'wagmi'
import { FACTORY_ABI, VAULT_ABI } from '@/lib/abi'
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_MAINNET_CHAIN_ID,
  SUPPORTED_CHAIN_IDS,
  CHAIN_CONFIG,
  Phase,
  isReviewedFactory,
} from '@/lib/constants'
import { StepRail } from '@/components/StepRail'
import { VaultCard } from '@/components/VaultCard'
import { StepCreate } from '@/components/StepCreate'
import { StepCollect } from '@/components/StepCollect'
import { StepApproveSpend } from '@/components/StepApproveSpend'
import { StepReturn } from '@/components/StepReturn'
import { StepClose } from '@/components/StepClose'
import { DemoView } from '@/components/DemoView'
import { AlertTriangle, ExternalLink, Settings, Eye, ShieldOff } from 'lucide-react'

function phaseToStep(phase: number | null): number {
  if (phase === null) return 0
  if (phase === Phase.Collecting) return 1
  if (phase === Phase.Active)     return 2
  if (phase === Phase.Returning)  return 4
  if (phase === Phase.Closed)     return 5
  return 0
}

/**
 * Pure routing predicate — exported for unit testing.
 *
 * close() is callable on-chain during Returning phase (after all claimFor
 * calls succeed) as well as after Closed. Rendering StepClose only when
 * phase===Closed would make close() unreachable from the UI during Returning.
 * StepClose handles both states: the button is disabled until liability===0,
 * and shows the locked banner once isClosed===true.
 */
export function shouldShowClose(phase: number | null): boolean {
  return phase === Phase.Returning || phase === Phase.Closed
}

function isValidAddress(s: string): s is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(s)
}

/** Parse ?chainId= from URL. Returns supported chain or undefined. */
function parseUrlChainId(search: string): number | undefined {
  const raw = new URLSearchParams(search).get('chainId')
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  return SUPPORTED_CHAIN_IDS.includes(n) ? n : undefined
}

export default function App() {
  const { chainId: walletChainId, isConnected } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  // ── URL-param initialisation ─────────────────────────────────────────────
  const [factoryAddr, setFactoryAddr] = useState(
    () => new URLSearchParams(window.location.search).get('factory') ?? ''
  )
  const [vaultAddr, setVaultAddr] = useState(
    () => new URLSearchParams(window.location.search).get('vault') ?? ''
  )

  // ── Selected chain — independent of wallet ───────────────────────────────
  // Priority: URL param → user selector. Wallet chain does NOT override this.
  const [selectedChainId, setSelectedChainId] = useState<number>(
    () => parseUrlChainId(window.location.search) ?? ARC_TESTNET_CHAIN_ID
  )
  const selectedChainConfig = CHAIN_CONFIG[selectedChainId]

  // Mainnet guard: show warning when user selects mainnet; tracks ack for UX
  // only. The WriteGate does NOT use this flag — it enforces the allowlist.
  const [mainnetAcknowledged, setMainnetAcknowledged] = useState(false)
  const onMainnet = selectedChainId === ARC_MAINNET_CHAIN_ID

  const [showConfig, setShowConfig] = useState(false)
  const [showDemo,   setShowDemo]   = useState(false)

  // ── Vault phase (live read — no wallet required) ──────────────────────────
  const { data: phaseData } = useReadContract({
    address: isValidAddress(vaultAddr) ? vaultAddr : undefined,
    abi: VAULT_ABI,
    functionName: 'getPhase',
    chainId: selectedChainId,       // use SELECTED chain, never wallet chain
    query: { refetchInterval: 10_000 },
  })
  const phase      = phaseData !== undefined ? Number(phaseData) : null
  const activeStep = phaseToStep(phase)

  // ── Factory registry check ────────────────────────────────────────────────
  // isVault is informational: confirms the vault was created through THIS
  // factory. It does NOT confirm the factory itself is a reviewed deployment.
  const factoryValid      = isValidAddress(factoryAddr)
  const vaultValid        = isValidAddress(vaultAddr)
  // Computed once from the real allowlist — passed down to all write components.
  const factoryIsReviewed = factoryValid && isReviewedFactory(selectedChainId, factoryAddr)

  const {
    data:    isRegisteredInFactory,
    isLoading: isRegisteredLoading,
    isError:   isRegisteredError,
  } = useReadContract({
    address: factoryValid ? factoryAddr : undefined,
    abi: FACTORY_ABI,
    functionName: 'isVault',
    args: vaultValid ? [vaultAddr] : undefined,
    chainId: selectedChainId,
    query: { enabled: factoryValid && vaultValid },
  })

  // ── Share URL (includes chainId, factory, vault) ──────────────────────────
  // Always includes chainId so mainnet share links load the correct chain.
  const shareUrl = vaultValid
    ? `${window.location.origin}${window.location.pathname}` +
      `?chainId=${selectedChainId}` +
      (factoryValid ? `&factory=${factoryAddr}` : '') +
      `&vault=${vaultAddr}`
    : null

  // ── Chain mismatch banner ─────────────────────────────────────────────────
  const walletOnWrongChain = isConnected && walletChainId !== selectedChainId

  return (
    <div className="min-h-dvh bg-slate-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');`}</style>

      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-900 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>CB</span>
            </div>
            <span className="font-semibold text-slate-900 text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              ChangeBack
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              · {selectedChainConfig.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDemo(s => !s)}
              className={`p-2 rounded-lg text-sm transition-colors flex items-center gap-1 ${
                showDemo
                  ? 'bg-violet-100 text-violet-600'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }`}
              title="Toggle demo view"
            >
              <Eye size={14} />
              <span className="text-xs hidden sm:inline">Demo</span>
            </button>
            <button
              onClick={() => setShowConfig(s => !s)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Configure addresses"
            >
              <Settings size={16} />
            </button>
            <ConnectKitButton />
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5 pb-20">

        {/* Mainnet info banner — informational ONLY; does not gate writes */}
        {onMainnet && !mainnetAcknowledged && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-4 text-sm text-red-700">
            <div className="font-semibold mb-1">Arc Mainnet — real funds</div>
            <p className="text-xs leading-relaxed mb-3">
              You are viewing Arc Mainnet. Transactions involve real USDC and are irreversible.
              No reviewed mainnet factory deployment exists yet. Write operations are disabled
              by the factory allowlist until a reviewed deployment is approved and configured.
            </p>
            <button
              onClick={() => setMainnetAcknowledged(true)}
              className="rounded-lg bg-red-700 text-white px-4 py-1.5 text-xs font-semibold hover:bg-red-800"
            >
              Understood
            </button>
          </div>
        )}

        {/* Setup banner: no deployment config */}
        {!factoryValid && !showDemo && (
          <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-4 text-sm text-amber-700">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">No factory address configured.</strong>
                <p className="mt-1 text-xs leading-relaxed">
                  ChangeBack contracts have not been deployed yet. Deployment requires explicit
                  approval. Once deployed, paste the factory address in the settings panel.
                  Vault reads are available to anyone with a share link — no wallet required.
                </p>
                <button
                  onClick={() => setShowDemo(true)}
                  className="mt-2 text-xs underline text-amber-600 hover:text-amber-800"
                >
                  View design overview without connecting
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Config panel */}
        {showConfig && (
          <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4 space-y-3 shadow-sm">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-widest">Configuration</div>

            {/* Chain selector — independent of wallet */}
            <div>
              <div className="text-xs text-slate-500 mb-1.5">Network (for reads and writes)</div>
              <div className="flex gap-2">
                {SUPPORTED_CHAIN_IDS.map(id => (
                  <button
                    key={id}
                    onClick={() => { setSelectedChainId(id); setMainnetAcknowledged(false) }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                      selectedChainId === id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {CHAIN_CONFIG[id].label}
                    {id === ARC_MAINNET_CHAIN_ID && (
                      <span className="ml-1 text-[10px] opacity-60">real funds</span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                This controls which chain is read. Your wallet must match for any write.
              </p>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Factory address</label>
              <input
                type="text" placeholder="0x…"
                value={factoryAddr} onChange={e => setFactoryAddr(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              {factoryValid && !factoryIsReviewed && (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600">
                  <ShieldOff size={11} className="shrink-0 mt-0.5" />
                  <span>
                    Unverified factory — not in the reviewed deployment allowlist.
                    Vault reads are available. Writes are disabled until a reviewed
                    deployment is configured.
                  </span>
                </div>
              )}
              {factoryIsReviewed && (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-emerald-600">
                  <span className="shrink-0 mt-0.5">✓</span>
                  <span>Reviewed deployment — in the verified allowlist for {selectedChainConfig.label}.</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Vault address (load existing vault)</label>
              <input
                type="text" placeholder="0x…"
                value={vaultAddr} onChange={e => setVaultAddr(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            {/* Factory registry result — informational */}
            {vaultValid && factoryValid && !isRegisteredLoading && isRegisteredError && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                Could not verify vault registry (RPC error).
              </div>
            )}
            {vaultValid && factoryValid && !isRegisteredLoading && !isRegisteredError && isRegisteredInFactory === false && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                This vault is NOT registered in the configured factory. It may have been deployed
                directly (bypassing the factory) or the factory address is wrong.
              </div>
            )}
            {vaultValid && factoryValid && !isRegisteredLoading && !isRegisteredError && isRegisteredInFactory === true && (
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
                Factory registry: vault confirmed created through this factory.
                Note: this does not verify that the factory itself is a reviewed deployment —
                writes remain disabled until a reviewed factory address is configured.
              </div>
            )}
            {isRegisteredLoading && (
              <div className="text-xs text-slate-400 animate-pulse">Checking factory registry…</div>
            )}

            {/* Share link — always includes chainId, factory, vault */}
            {shareUrl && (
              <div className="text-xs text-slate-400">
                <div className="mb-0.5">Read-only share link (no wallet required):</div>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer"
                  className="text-blue-500 hover:underline inline-flex items-center gap-0.5 break-all">
                  {shareUrl.slice(0, 55)}{shareUrl.length > 55 ? '…' : ''} <ExternalLink size={9} />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Demo view — no wallet, no chain gate, clearly labeled */}
        {showDemo && <DemoView />}

        {/* ─── Read-only section — NO wallet gate ───────────────────────────── */}
        {/* VaultCard, StepRail, and phase reads are available without a wallet. */}
        {!showDemo && (
          <div className="space-y-5">

            {/* Chain mismatch: wallet on different chain than selected */}
            {walletOnWrongChain && (
              <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-xs text-amber-700">
                  Your wallet is on a different chain than the selected network ({selectedChainConfig.label}).
                  Switch your wallet to submit transactions.
                </div>
                <button
                  onClick={() => switchChain({ chainId: selectedChainId })}
                  disabled={isSwitching}
                  className="shrink-0 rounded-lg bg-amber-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
                >
                  {isSwitching ? 'Switching…' : `Switch to ${selectedChainConfig.label}`}
                </button>
              </div>
            )}

            {/* Vault status card — read-only, no wallet */}
            {vaultValid && (
              <VaultCard
                vaultAddress={vaultAddr}
                chainId={selectedChainId}
              />
            )}

            {/* Step rail — read-only */}
            {(vaultValid || factoryValid) && (
              <div className="overflow-x-auto">
                <StepRail activeStep={vaultValid ? activeStep : 0} />
              </div>
            )}

            {/* Step panels */}
            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm px-5 py-5">
              {!factoryValid && !vaultValid && (
                <div className="text-sm text-slate-400 text-center py-8">
                  Enter a factory address in settings to create a vault,
                  or a vault address to view an existing one. No wallet required for reads.
                </div>
              )}

              {factoryValid && !vaultValid && (
                <StepCreate
                  factoryAddress={factoryAddr}
                  selectedChainId={selectedChainId}
                  isReviewedFactory={factoryIsReviewed}
                  onVaultCreated={(addr) => {
                    setVaultAddr(addr)
                    setShowConfig(false)
                  }}
                />
              )}

              {vaultValid && phase !== null && (
                <>
                  {phase === Phase.Collecting && (
                    <StepCollect
                      vaultAddress={vaultAddr}
                      selectedChainId={selectedChainId}
                      factoryAddress={factoryAddr || undefined}
                      isVaultRegistered={isRegisteredInFactory}
                      isVaultRegisteredLoading={isRegisteredLoading}
                      isVaultRegisteredError={isRegisteredError}
                    />
                  )}
                  {phase === Phase.Active && (
                    <StepApproveSpend
                      vaultAddress={vaultAddr}
                      selectedChainId={selectedChainId}
                      factoryAddress={factoryAddr || undefined}
                      isVaultRegistered={isRegisteredInFactory}
                      isVaultRegisteredLoading={isRegisteredLoading}
                      isVaultRegisteredError={isRegisteredError}
                    />
                  )}
                  {phase === Phase.Returning && (
                    <StepReturn
                      vaultAddress={vaultAddr}
                      selectedChainId={selectedChainId}
                      factoryAddress={factoryAddr || undefined}
                      isVaultRegistered={isRegisteredInFactory}
                      isVaultRegisteredLoading={isRegisteredLoading}
                      isVaultRegisteredError={isRegisteredError}
                    />
                  )}
                  {/* StepClose is rendered during BOTH Returning and Closed phases.
                      close() is callable on-chain from Returning (once liability=0),
                      so it must be reachable in the UI before phase transitions to Closed.
                      StepClose disables its button until canClose===true and shows the
                      locked banner once isClosed===true — it handles both states. */}
                  {shouldShowClose(phase) && (
                    <StepClose
                      vaultAddress={vaultAddr}
                      selectedChainId={selectedChainId}
                      factoryAddress={factoryAddr || undefined}
                      isVaultRegistered={isRegisteredInFactory}
                      isVaultRegisteredLoading={isRegisteredLoading}
                      isVaultRegisteredError={isRegisteredError}
                    />
                  )}
                </>
              )}

              {vaultValid && phase === null && (
                <div className="py-8 text-center text-sm text-slate-400 animate-pulse">
                  Loading vault…
                </div>
              )}
            </div>

            <p className="text-center text-xs text-slate-400 pb-4">
              Arc Testnet + Mainnet · USDC only · testnet has no real funds.{' '}
              <a href="https://docs.arc.io/ai/arc-studio" target="_blank" rel="noopener noreferrer"
                className="underline hover:text-slate-600">Arc Studio docs</a>
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
