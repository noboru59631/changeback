import { useState, useEffect, useLayoutEffect, useRef, useCallback, type FormEvent } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { decodeEventLog, parseGwei } from 'viem'
import { FACTORY_ABI } from '@/lib/abi'
import { CHAIN_CONFIG } from '@/lib/constants'
import { useWriteAllowed } from './WriteGate'
import { parseOnchainError } from '@/lib/errors'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { TxButton } from './TxButton'
import { ShieldOff, ExternalLink, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'

// ─── Gas cap constants ────────────────────────────────────────────────────────

export const GAS_LIMIT_CAP    = 3_000_000n
export const MAX_FEE_PER_GAS  = parseGwei('30')  // 30 Gwei
export const MAX_PRIORITY_FEE = parseGwei('1')   // 1 Gwei

// ─── Deadline helpers (exported for unit tests) ───────────────────────────────

export const COLLECT_OFFSET_SECONDS = 3_600   //  1 hour
export const SPEND_OFFSET_SECONDS   = 86_400  // 24 hours (23 h after collect)

/**
 * Given the latest block timestamp (seconds, as returned by eth_getBlockByNumber),
 * return the collect and spend deadlines as absolute Unix timestamps (bigint).
 *   collectUntil = blockTs + 1 h
 *   spendUntil   = blockTs + 24 h  (23 h after collectUntil)
 */
export function deadlinesFromBlockTimestamp(blockTs: bigint): {
  collectUntil: bigint
  spendUntil: bigint
} {
  return {
    collectUntil: blockTs + BigInt(COLLECT_OFFSET_SECONDS),
    spendUntil:   blockTs + BigInt(SPEND_OFFSET_SECONDS),
  }
}

/** Sort participant addresses ascending (case-insensitive). */
export function sortParticipants(addrs: `0x${string}`[]): `0x${string}`[] {
  return [...addrs].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
}

/** Validate participant address strings. Returns an error string or null. */
export function validateParticipants(raw: string[]): string | null {
  const cleaned = raw.map(s => s.trim()).filter(Boolean)
  if (cleaned.length < 2) return 'At least 2 participants required.'
  if (cleaned.length > 20) return 'Maximum 20 participants.'
  const hexRe = /^0x[0-9a-fA-F]{40}$/
  for (const addr of cleaned) {
    if (!hexRe.test(addr)) return `Invalid address: ${addr}`
  }
  const seen = new Set<string>()
  for (const addr of cleaned) {
    const lc = addr.toLowerCase()
    if (seen.has(lc)) return `Duplicate address: ${addr}`
    seen.add(lc)
  }
  return null
}

/** Validate threshold. Returns an error string or null. */
export function validateThreshold(thresholdStr: string, participantCount: number): string | null {
  if (!/^\d+$/.test(thresholdStr.trim())) return 'Threshold must be a whole number.'
  const t = parseInt(thresholdStr.trim(), 10)
  if (t < 2) return 'Threshold must be at least 2.'
  if (t > participantCount) return `Threshold (${t}) exceeds participant count (${participantCount}).`
  return null
}

// ─── Preflight state ──────────────────────────────────────────────────────────

/**
 * Snapshot of every input that determines the createVault call.
 * Includes walletChainId so a wallet chain switch always invalidates the result.
 * The write step uses these exact frozen values — never re-derived live state.
 */
type PreflightOk = {
  status:        'ok'
  forKey:        string           // full input snapshot key
  gasLimit:      bigint           // raw estimate, clamped to GAS_LIMIT_CAP
  collectUntil:  bigint
  spendUntil:    bigint
  sorted:        `0x${string}`[]  // exact args for writeContract
  guardian:      `0x${string}`
  threshold:     bigint
  factory:       `0x${string}`
  chainId:       number           // selectedChainId at preflight time
}

type PreflightState =
  | { status: 'idle' }
  | { status: 'running' }
  | PreflightOk
  | { status: 'error'; message: string }

/**
 * Build a stable key encoding every input that affects the createVault call.
 * Includes both selectedChainId and walletChainId: a wallet chain switch
 * (walletChainId changes) while selectedChainId stays fixed still invalidates
 * the preflight.
 */
export function buildPreflightKey(
  account:         string,
  selectedChainId: number,
  walletChainId:   number | undefined,
  factory:         string,
  sorted:          string[],
  threshold:       string,
): string {
  return [
    account.toLowerCase(),
    selectedChainId,
    walletChainId ?? 'none',
    factory.toLowerCase(),
    sorted.map(a => a.toLowerCase()).join(','),
    threshold,
  ].join(':')
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  factoryAddress:    `0x${string}`
  selectedChainId:   number
  isReviewedFactory: boolean
  onVaultCreated:    (addr: `0x${string}`) => void
}

export function StepCreate({
  factoryAddress,
  selectedChainId,
  isReviewedFactory,
  onVaultCreated,
}: Props) {
  // walletChainId: the chain Rabby (or any connected wallet) is CURRENTLY on.
  // Distinct from selectedChainId (the app's network selector). A mismatch means
  // the wallet would sign on the wrong chain — we include it in the preflight key
  // so switching Rabby to another chain always invalidates a prior preflight.
  const { address: connectedAddress, chainId: walletChainId } = useAccount()
  const publicClient = usePublicClient({ chainId: selectedChainId })
  const chainConfig  = CHAIN_CONFIG[selectedChainId]

  const [participants, setParticipants] = useState<string[]>(
    connectedAddress ? [connectedAddress] : [''],
  )
  const [threshold, setThreshold] = useState('2')

  const writeAllowed = useWriteAllowed(
    selectedChainId, factoryAddress, undefined,
    undefined, undefined, undefined,
  )

  const [submittedChainId, setSubmittedChainId] = useState<number | undefined>(undefined)

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash,
    chainId: submittedChainId,
  })

  const [preflight, setPreflight] = useState<PreflightState>({ status: 'idle' })

  // ─── Invalidation: two complementary guards ────────────────────────────────
  //
  // GUARD A — runTokenRef (commit-synchronous, event-driven):
  //   An integer ref incremented at the start of every preflight run AND
  //   synchronously from every controlled input-change handler (participants,
  //   threshold). This ensures that even an immediately-resolved Promise
  //   continuation finds a stale token if an input changed in the same
  //   synchronous event. After every await, the run checks its captured token
  //   against the current ref; a mismatch means this run is superseded.
  //
  // GUARD B — currentInputsRef (layout-synchronous, covers wagmi state):
  //   A string ref holding the full input key. Updated in useLayoutEffect
  //   (runs synchronously after DOM commit, before paint). This covers changes
  //   that come from wagmi state updates (walletChainId, connectedAddress,
  //   selectedChainId, factoryAddress) which cannot be intercepted in event
  //   handlers. useLayoutEffect fires before any new macrotask, so any async
  //   RPC continuation from a prior event-loop tick finds the updated ref.
  //
  // Together: Guard A catches same-event-loop input edits (including
  //   change-and-change-back with the same final key). Guard B catches
  //   cross-event-loop wallet/chain state changes. Neither alone is sufficient.

  const runTokenRef      = useRef(0)
  const currentInputsRef = useRef('')

  const sortedNow = sortParticipants(
    participants.map(p => p.trim()).filter(Boolean) as `0x${string}`[],
  )
  const currentPreflightKey = buildPreflightKey(
    connectedAddress ?? '',
    selectedChainId,
    walletChainId,
    factoryAddress,
    sortedNow,
    threshold,
  )

  // Guard B sync: useLayoutEffect runs after DOM commit, before paint.
  // This is synchronous relative to the browser's rendering pipeline and fires
  // before any macrotask (including async RPC continuations from a prior task).
  useLayoutEffect(() => {
    currentInputsRef.current = currentPreflightKey
  }, [currentPreflightKey])

  // Stale detection at render time.
  const isPreflightStale = preflight.status === 'ok' &&
    preflight.forKey !== currentPreflightKey

  const successFiredRef = useRef<`0x${string}` | undefined>(undefined)

  // ── Side-effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isSuccess || !receipt || !hash || successFiredRef.current === hash) return
    if (receipt.status !== 'success') {
      toast.error('Transaction reverted on-chain.')
      return
    }
    successFiredRef.current = hash
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics })
        if (decoded.eventName === 'VaultCreated') {
          onVaultCreated((decoded.args as { vault: `0x${string}` }).vault)
          return
        }
      } catch {
        // not this log — continue
      }
    }
    toast.error('Could not find VaultCreated event in receipt.')
  }, [isSuccess, receipt, hash, onVaultCreated])

  useEffect(() => {
    if (!writeError) return
    toast.error(parseOnchainError(writeError))
  }, [writeError])

  // ── Participant helpers ────────────────────────────────────────────────────

  // Each helper increments runTokenRef synchronously (Guard A) so that any
  // in-flight preflight run is immediately invalidated even if its awaited
  // Promise resolves in the same microtask drain.
  const invalidateToken = () => { runTokenRef.current += 1 }

  const addParticipant    = () => {
    invalidateToken()
    setParticipants(p => [...p, ''])
    setPreflight({ status: 'idle' })
  }
  const removeParticipant = (i: number) => {
    invalidateToken()
    setParticipants(p => p.filter((_, idx) => idx !== i))
    setPreflight({ status: 'idle' })
  }
  const setParticipant = (i: number, val: string) => {
    invalidateToken()
    setParticipants(p => p.map((a, idx) => (idx === i ? val : a)))
    setPreflight({ status: 'idle' })
  }
  const setThresholdInvalidating = (val: string) => {
    invalidateToken()
    setThreshold(val)
    setPreflight({ status: 'idle' })
  }

  // ── Preflight: fetch latest block timestamp + estimate + simulate ─────────

  const runPreflight = useCallback(async () => {
    if (!publicClient) {
      setPreflight({ status: 'error', message: 'No RPC client available for chain.' })
      return
    }
    if (!connectedAddress) {
      setPreflight({ status: 'error', message: 'Wallet not connected.' })
      return
    }

    const validationErr = validateParticipants(participants)
    if (validationErr) { setPreflight({ status: 'error', message: validationErr }); return }

    const cleanedParticipants = participants.map(p => p.trim()).filter(Boolean) as `0x${string}`[]
    const thresholdErr = validateThreshold(threshold, cleanedParticipants.length)
    if (thresholdErr) { setPreflight({ status: 'error', message: thresholdErr }); return }

    const sorted       = sortParticipants(cleanedParticipants)
    const guardian     = sorted[0]
    const thresholdBig = BigInt(parseInt(threshold.trim(), 10))

    // Capture the full input key and the current token for THIS run.
    // startKey is built from the same inputs as currentInputsRef will hold
    // (via useLayoutEffect). myToken is the NEXT integer — we increment the ref
    // here so any concurrent run that also calls runPreflight gets a different token.
    const startKey = buildPreflightKey(
      connectedAddress, selectedChainId, walletChainId, factoryAddress, sorted, threshold,
    )
    runTokenRef.current += 1
    const myToken = runTokenRef.current

    setPreflight({ status: 'running' })

    // isSuperseded reads both refs at call time — always current.
    // Called after every await. Returns true → this run silently discards its result.
    const isSuperseded = (): boolean =>
      runTokenRef.current !== myToken ||          // Guard A: newer run or input-handler edit
      currentInputsRef.current !== startKey       // Guard B: wagmi state changed

    try {
      if (await publicClient.getChainId() !== selectedChainId) throw new Error('RPC chain mismatch.')
      if (isSuperseded()) return
      // ── Step 1: Fetch latest block timestamp ──────────────────────────────
      const block = await publicClient.getBlock({ blockTag: 'latest' })
      if (isSuperseded()) return

      const blockTs = block.timestamp
      const { collectUntil, spendUntil } = deadlinesFromBlockTimestamp(blockTs)

      // ── Step 2: Estimate gas ──────────────────────────────────────────────
      const baseParams = {
        address:              factoryAddress,
        abi:                  FACTORY_ABI,
        functionName:         'createVault' as const,
        args:                 [sorted, thresholdBig, collectUntil, spendUntil, guardian] as const,
        account:              connectedAddress,
        maxFeePerGas:         MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE,
      }

      const rawEstimate = await publicClient.estimateContractGas(baseParams)
      if (isSuperseded()) return

      if (rawEstimate > GAS_LIMIT_CAP) {
        setPreflight({
          status: 'error',
          message: `Gas estimate ${rawEstimate.toLocaleString()} exceeds cap ${GAS_LIMIT_CAP.toLocaleString()}. Blocked.`,
        })
        return
      }

      // ── Step 3: Simulate ─────────────────────────────────────────────────
      await publicClient.simulateContract(baseParams)
      if (isSuperseded()) return
      if (await publicClient.getBalance({ address: connectedAddress }) < rawEstimate * MAX_FEE_PER_GAS) {
        throw new Error('Insufficient balance for the maximum network fee.')
      }
      if (isSuperseded()) return

      // ── Step 4: Commit ───────────────────────────────────────────────────
      const gasLimit = rawEstimate < GAS_LIMIT_CAP ? rawEstimate : GAS_LIMIT_CAP

      setPreflight({
        status: 'ok',
        forKey:       startKey,
        gasLimit,
        collectUntil,
        spendUntil,
        sorted,
        guardian,
        threshold:    thresholdBig,
        factory:      factoryAddress,
        chainId:      selectedChainId,
      })
    } catch (err: unknown) {
      if (isSuperseded()) return
      const msg = err instanceof Error ? err.message : String(err)
      setPreflight({ status: 'error', message: `Preflight failed: ${msg}` })
    }
  }, [
    publicClient, connectedAddress, walletChainId, selectedChainId,
    participants, threshold, factoryAddress,
  ])

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!writeAllowed) {
      toast.error('Writes are disabled — factory not in reviewed allowlist.')
      return
    }
    if (preflight.status !== 'ok') {
      toast.error('Run preflight check before creating the vault.')
      return
    }
    if (!connectedAddress) {
      toast.error('Wallet not connected.')
      return
    }
    if (isPreflightStale) {
      toast.error('Inputs changed since preflight. Please re-run preflight.')
      return
    }

    const p = preflight  // narrows to PreflightOk

    reset()
    setSubmittedChainId(p.chainId)

    writeContract({
      address:      p.factory,
      abi:          FACTORY_ABI,
      functionName: 'createVault' as const,
      args:         [p.sorted, p.threshold, p.collectUntil, p.spendUntil, p.guardian] as const,
      chainId:      p.chainId,
      // value omitted: createVault is non-payable
      gas:          p.gasLimit,
      maxFeePerGas:         MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: MAX_PRIORITY_FEE,
    })
  }

  const explorerChainId = submittedChainId ?? selectedChainId
  const fmtTs = (ts: bigint) => new Date(Number(ts) * 1000).toUTCString()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div>
        <h2
          className="text-lg font-semibold text-slate-900"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Create a new vault
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Participants, threshold, and deadlines are immutable after creation.
          The lowest-sorted address becomes guardian.
          Deadlines are derived from the latest block timestamp at preflight time.
        </p>
      </div>

      {!writeAllowed && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2.5 flex items-start gap-2 text-xs text-red-700">
          <ShieldOff size={13} className="shrink-0 mt-0.5" />
          <span>
            Create is disabled. Connect your wallet on {chainConfig?.label} and configure
            a reviewed factory address.
          </span>
        </div>
      )}

      {!isReviewedFactory && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
          This factory address has not been reviewed. A reviewed factory address will be
          configured after deployment approval.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide">
            Participants (2–20, sorted ascending before creation)
          </label>
          {participants.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                placeholder="0x…"
                value={p}
                onChange={e => setParticipant(i, e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              {participants.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeParticipant(i)}
                  className="p-2 text-slate-400 hover:text-red-500 rounded-lg"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {participants.length < 20 && (
            <button
              type="button"
              onClick={addParticipant}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 mt-1"
            >
              <Plus size={12} /> Add participant
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
            Approval threshold (min 2)
          </label>
          <input
            type="number"
            min={2}
            max={participants.length}
            value={threshold}
            onChange={e => setThresholdInvalidating(e.target.value)}
            className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 leading-relaxed space-y-1">
          <div className="font-medium text-slate-700">Deadlines (set at preflight time)</div>
          <div>Collect until: block timestamp + 1 hour</div>
          <div>Spend until: block timestamp + 24 hours</div>
          {preflight.status === 'ok' && (
            <div className="mt-2 space-y-0.5 text-slate-800 font-mono text-[10px]">
              <div>collectUntil  = {preflight.collectUntil.toString()} ({fmtTs(preflight.collectUntil)})</div>
              <div>spendUntil    = {preflight.spendUntil.toString()} ({fmtTs(preflight.spendUntil)})</div>
              <div>gasLimit      = {preflight.gasLimit.toLocaleString()} (cap {GAS_LIMIT_CAP.toLocaleString()}, no buffer)</div>
              <div>participants  = {preflight.sorted.join(', ')}</div>
              <div>guardian      = {preflight.guardian}</div>
              <div>threshold     = {preflight.threshold.toString()}</div>
              <div>factory       = {preflight.factory}</div>
              <div>value         = 0 (no native transfer)</div>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700 leading-relaxed">
          <strong>Important:</strong> Any {threshold || 'M'} signers can approve payments to any
          destination, including one they control. Only add participants you trust.
          The contract does not protect against quorum collusion.
        </div>

        <button
          type="button"
          onClick={() => void runPreflight()}
          disabled={!writeAllowed || preflight.status === 'running' || isPending || isConfirming}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {preflight.status === 'running' ? 'Running preflight…' : 'Run preflight check'}
        </button>

        {preflight.status === 'error' && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
            {preflight.message}
          </div>
        )}

        {preflight.status === 'ok' && !isPreflightStale && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-700">
            Preflight passed: simulation succeeded, gas within cap. Review all parameters above
            before signing. The Create Vault button will submit exactly the parameters shown.
          </div>
        )}

        {isPreflightStale && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
            Account, wallet chain, or inputs changed since preflight. Re-run preflight before signing.
          </div>
        )}

        <TxButton
          type="submit"
          pending={isPending}
          confirming={isConfirming}
          label="Create Vault"
          disabled={!writeAllowed || preflight.status !== 'ok' || isPreflightStale}
          className="w-full"
        />
      </form>

      {isSuccess && receipt?.status === 'success' && hash && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-xs text-emerald-700">
          Vault created!{' '}
          <a
            href={buildTxExplorerUrl(explorerChainId, hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            View transaction <ExternalLink size={10} />
          </a>
        </div>
      )}
    </div>
  )
}
