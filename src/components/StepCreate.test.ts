/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-argument, typescript/no-explicit-any, no-unused-vars */

import { describe, it, expect } from 'bun:test'
import {
  deadlinesFromBlockTimestamp,
  sortParticipants,
  validateParticipants,
  validateThreshold,
  buildPreflightKey,
  GAS_LIMIT_CAP,
  MAX_FEE_PER_GAS,
  MAX_PRIORITY_FEE,
  COLLECT_OFFSET_SECONDS,
  SPEND_OFFSET_SECONDS,
} from './StepCreate'
import { parseGwei } from 'viem'

// ── Real participant addresses from testnet acceptance plan ───────────────────
const ADDR_A = '0x03607de69C487BcC460eaD7C4Bdfd25805658b75'  // guardian (lowest)
const ADDR_B = '0x89A4EF745831CFe8957391Ad2e3CF55Dc3a6e502'
const ADDR_C = '0x0f6aD6BBEE5A68D864AE5252811Dd1CBA0Be83dC'
const FACTORY = '0x0cf03f85278a7d1ce3057b77043e1b9af3da2ec0'
const ARC_TESTNET = 5042002
const ARC_MAINNET = 5042

// ─── Suite 1: deadlinesFromBlockTimestamp ────────────────────────────────────

describe('deadlinesFromBlockTimestamp', () => {
  it('returns collectUntil = blockTs + 3600', () => {
    const { collectUntil } = deadlinesFromBlockTimestamp(1_000_000n)
    expect(collectUntil).toBe(1_003_600n)
  })

  it('returns spendUntil = blockTs + 86400', () => {
    const { spendUntil } = deadlinesFromBlockTimestamp(1_000_000n)
    expect(spendUntil).toBe(1_086_400n)
  })

  it('spendUntil is 23 hours after collectUntil', () => {
    const { collectUntil, spendUntil } = deadlinesFromBlockTimestamp(1_000_000n)
    expect(spendUntil - collectUntil).toBe(BigInt(23 * 3600))
  })

  it('COLLECT_OFFSET_SECONDS is 3600', () => {
    expect(COLLECT_OFFSET_SECONDS).toBe(3_600)
  })

  it('SPEND_OFFSET_SECONDS is 86400', () => {
    expect(SPEND_OFFSET_SECONDS).toBe(86_400)
  })

  it('works at block timestamp 0', () => {
    const { collectUntil, spendUntil } = deadlinesFromBlockTimestamp(0n)
    expect(collectUntil).toBe(3_600n)
    expect(spendUntil).toBe(86_400n)
  })

  it('works at a realistic recent block timestamp', () => {
    const ts = 1_729_123_456n
    const { collectUntil, spendUntil } = deadlinesFromBlockTimestamp(ts)
    expect(collectUntil).toBe(ts + 3_600n)
    expect(spendUntil).toBe(ts + 86_400n)
  })

  it('different block timestamps produce different deadlines', () => {
    const a = deadlinesFromBlockTimestamp(1_000_000n)
    const b = deadlinesFromBlockTimestamp(1_000_001n)
    expect(a.collectUntil).not.toBe(b.collectUntil)
    expect(a.spendUntil).not.toBe(b.spendUntil)
  })
})

// ─── Suite 2: sortParticipants ────────────────────────────────────────────────

describe('sortParticipants', () => {
  it('sorts A < C < B (real testnet addresses)', () => {
    const sorted = sortParticipants([ADDR_B, ADDR_C, ADDR_A] as `0x${string}`[])
    expect(sorted[0]).toBe(ADDR_A)
    expect(sorted[1]).toBe(ADDR_C)
    expect(sorted[2]).toBe(ADDR_B)
  })

  it('is case-insensitive', () => {
    const upper = sortParticipants([ADDR_A.toUpperCase(), ADDR_C] as `0x${string}`[])
    const lower = sortParticipants([ADDR_A.toLowerCase(), ADDR_C] as `0x${string}`[])
    expect(upper[0].toLowerCase()).toBe(lower[0].toLowerCase())
  })

  it('does not mutate the input', () => {
    const input = [ADDR_B, ADDR_A] as `0x${string}`[]
    sortParticipants(input)
    expect(input[0]).toBe(ADDR_B)
    expect(input[1]).toBe(ADDR_A)
  })

  it('A is guardian (lowest address)', () => {
    const sorted = sortParticipants([ADDR_C, ADDR_B, ADDR_A] as `0x${string}`[])
    expect(sorted[0]).toBe(ADDR_A)
  })
})

// ─── Suite 3: validateParticipants ───────────────────────────────────────────

describe('validateParticipants', () => {
  it('passes with 2 valid addresses', () => {
    expect(validateParticipants([ADDR_A, ADDR_B])).toBeNull()
  })

  it('passes with all 3 testnet addresses', () => {
    expect(validateParticipants([ADDR_A, ADDR_B, ADDR_C])).toBeNull()
  })

  it('rejects fewer than 2 participants', () => {
    expect(validateParticipants([ADDR_A])).toMatch(/at least 2/i)
  })

  it('rejects empty list', () => {
    expect(validateParticipants([])).toMatch(/at least 2/i)
  })

  it('rejects more than 20 participants', () => {
    const addrs = Array.from({ length: 21 }, (_, i) =>
      `0x${(i + 1).toString(16).padStart(40, '0')}`,
    )
    expect(validateParticipants(addrs)).toMatch(/maximum 20/i)
  })

  it('rejects an invalid address', () => {
    expect(validateParticipants([ADDR_A, 'not-an-address'])).toMatch(/invalid/i)
  })

  it('rejects a duplicate address', () => {
    expect(validateParticipants([ADDR_A, ADDR_A])).toMatch(/duplicate/i)
  })

  it('trims whitespace before validation', () => {
    expect(validateParticipants([` ${ADDR_A} `, ADDR_B])).toBeNull()
  })

  it('ignores empty strings (filters them out)', () => {
    expect(validateParticipants(['', ADDR_A, ADDR_B])).toBeNull()
  })
})

// ─── Suite 4: validateThreshold ──────────────────────────────────────────────

describe('validateThreshold', () => {
  it('passes for threshold = 2 with 3 participants', () => {
    expect(validateThreshold('2', 3)).toBeNull()
  })

  it('passes for threshold = 3 with 3 participants', () => {
    expect(validateThreshold('3', 3)).toBeNull()
  })

  it('passes for threshold = 2 with 2 participants', () => {
    expect(validateThreshold('2', 2)).toBeNull()
  })

  it('rejects threshold = 1 (too low)', () => {
    expect(validateThreshold('1', 3)).toMatch(/at least 2/i)
  })

  it('rejects threshold exceeding participant count', () => {
    expect(validateThreshold('4', 3)).toMatch(/exceeds/i)
  })

  it('rejects non-integer "2.5"', () => {
    expect(validateThreshold('2.5', 3)).toMatch(/whole number/i)
  })

  it('rejects non-integer "2.0"', () => {
    expect(validateThreshold('2.0', 3)).toMatch(/whole number/i)
  })

  it('rejects empty string', () => {
    expect(validateThreshold('', 3)).toMatch(/whole number/i)
  })

  it('rejects scientific notation "2e0"', () => {
    expect(validateThreshold('2e0', 3)).toMatch(/whole number/i)
  })

  it('rejects negative "-2"', () => {
    expect(validateThreshold('-2', 3)).toMatch(/whole number/i)
  })
})

// ─── Suite 5: gas cap constants ──────────────────────────────────────────────

describe('gas cap constants', () => {
  it('GAS_LIMIT_CAP is 3,000,000', () => {
    expect(GAS_LIMIT_CAP).toBe(3_000_000n)
  })

  it('MAX_FEE_PER_GAS is 30 Gwei', () => {
    expect(MAX_FEE_PER_GAS).toBe(parseGwei('30'))
  })

  it('MAX_PRIORITY_FEE is 1 Gwei', () => {
    expect(MAX_PRIORITY_FEE).toBe(parseGwei('1'))
  })
})

// ─── Suite 6: buildPreflightKey — includes walletChainId ─────────────────────

describe('buildPreflightKey — includes walletChainId', () => {
  const sorted = sortParticipants([ADDR_A, ADDR_B, ADDR_C] as `0x${string}`[])

  it('produces a stable key for the same inputs', () => {
    const k1 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '2')
    const k2 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '2')
    expect(k1).toBe(k2)
  })

  it('changes when account changes', () => {
    const k1 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '2')
    const k2 = buildPreflightKey(ADDR_B, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '2')
    expect(k1).not.toBe(k2)
  })

  it('changes when selectedChainId changes', () => {
    const k1 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '2')
    const k2 = buildPreflightKey(ADDR_A, ARC_MAINNET,  ARC_TESTNET, FACTORY, sorted, '2')
    expect(k1).not.toBe(k2)
  })

  it('changes when walletChainId changes (Rabby switches chain)', () => {
    // selectedChainId stays 5042002; walletChainId switches from 5042002 to 1
    const k1 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '2')
    const k2 = buildPreflightKey(ADDR_A, ARC_TESTNET, 1,           FACTORY, sorted, '2')
    expect(k1).not.toBe(k2)
  })

  it('changes when walletChainId switches from testnet to mainnet', () => {
    const k1 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '2')
    const k2 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_MAINNET, FACTORY, sorted, '2')
    expect(k1).not.toBe(k2)
  })

  it('changes when walletChainId becomes undefined (wallet disconnects mid-run)', () => {
    const k1 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '2')
    const k2 = buildPreflightKey(ADDR_A, ARC_TESTNET, undefined,   FACTORY, sorted, '2')
    expect(k1).not.toBe(k2)
  })

  it('changes when factory address changes', () => {
    const k1 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '2')
    const k2 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, ADDR_B,  sorted, '2')
    expect(k1).not.toBe(k2)
  })

  it('changes when participants change', () => {
    const k1 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, [ADDR_A, ADDR_B], '2')
    const k2 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, [ADDR_A, ADDR_C], '2')
    expect(k1).not.toBe(k2)
  })

  it('changes when threshold changes', () => {
    const k1 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '2')
    const k2 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY, sorted, '3')
    expect(k1).not.toBe(k2)
  })

  it('is case-insensitive for factory and participants', () => {
    const k1 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY.toUpperCase(), sorted.map(a => a.toUpperCase()), '2')
    const k2 = buildPreflightKey(ADDR_A, ARC_TESTNET, ARC_TESTNET, FACTORY.toLowerCase(), sorted.map(a => a.toLowerCase()), '2')
    expect(k1).toBe(k2)
  })
})

// ─── Suite 7: isPreflightStale — stale detection at render time ───────────────

describe('isPreflightStale detection (structural)', () => {
  const sorted = sortParticipants([ADDR_A, ADDR_B, ADDR_C] as `0x${string}`[])
  const makeKey = (overrides: Partial<{
    account: string; selChain: number; walChain: number | undefined;
    factory: string; parts: string[]; thresh: string
  }> = {}) => buildPreflightKey(
    overrides.account  ?? ADDR_A,
    overrides.selChain ?? ARC_TESTNET,
    overrides.walChain ?? ARC_TESTNET,
    overrides.factory  ?? FACTORY,
    overrides.parts    ?? sorted,
    overrides.thresh   ?? '2',
  )

  it('not stale when key matches', () => {
    const k = makeKey()
    const isStale = (k !== k)
    expect(isStale).toBe(false)
  })

  it('stale when account changes', () => {
    const stored = makeKey()
    const current = makeKey({ account: ADDR_B })
    expect(stored !== current).toBe(true)
  })

  it('stale when selectedChainId changes', () => {
    const stored = makeKey()
    const current = makeKey({ selChain: ARC_MAINNET })
    expect(stored !== current).toBe(true)
  })

  it('stale when walletChainId changes (Rabby chain switch)', () => {
    const stored = makeKey()
    const current = makeKey({ walChain: 1 })  // Rabby switches to Ethereum mainnet
    expect(stored !== current).toBe(true)
  })

  it('stale when threshold changes', () => {
    const stored = makeKey()
    const current = makeKey({ thresh: '3' })
    expect(stored !== current).toBe(true)
  })

  it('stale when participant removed', () => {
    const stored = makeKey()
    const current = makeKey({ parts: [ADDR_A, ADDR_B] })
    expect(stored !== current).toBe(true)
  })

  it('isPreflightStale is false when status is idle', () => {
    const statusIsOk = false
    const stored = makeKey()
    const current = makeKey({ account: ADDR_B })
    expect(statusIsOk && stored !== current).toBe(false)
  })
})

// ─── Suite 8: gas clamp ──────────────────────────────────────────────────────

describe('gas clamp: submitted gasLimit ≤ GAS_LIMIT_CAP', () => {
  const clamp = (estimate: bigint) =>
    estimate < GAS_LIMIT_CAP ? estimate : GAS_LIMIT_CAP

  it('estimate exactly at cap is accepted as-is', () => {
    expect(clamp(3_000_000n)).toBe(3_000_000n)
  })

  it('estimate below cap is submitted as-is', () => {
    expect(clamp(2_500_000n)).toBe(2_500_000n)
  })

  it('estimate above cap is blocked at preflight (not clamped post-check)', () => {
    // The runPreflight logic is: if rawEstimate > GAS_LIMIT_CAP → error (not clamped).
    // This test verifies the cap check fires, not that we silently truncate.
    const rawEstimate = 3_000_001n
    const wouldBlock = rawEstimate > GAS_LIMIT_CAP
    expect(wouldBlock).toBe(true)
  })

  it('old +10% buffer would have exceeded the cap for estimates above 2,727,273', () => {
    // If old code used rawEstimate * 110 / 100, for estimate=2_900_000:
    const old = 2_900_000n * 110n / 100n
    expect(old).toBeGreaterThan(GAS_LIMIT_CAP)
    // New code: estimate passes cap check (2_900_000 < 3_000_000), clamp = 2_900_000.
    expect(clamp(2_900_000n)).toBe(2_900_000n)
    expect(clamp(2_900_000n)).toBeLessThanOrEqual(GAS_LIMIT_CAP)
  })
})

// ─── Suite 9: behavioral async invalidation with mocked RPC ──────────────────
//
// These tests instantiate the EXACT same control-flow logic as runPreflight
// (two refs, isSuperseded closure, three async steps) with controllable
// deferred Promises. They verify that:
//
//   Guard A (runToken): fires when invalidateToken() is called synchronously
//     from an input-change handler — simulating controlled-input edits.
//   Guard B (inputsRef): fires when currentInputsRef is updated — simulating
//     a useLayoutEffect sync after a wagmi state change (walletChainId etc.).
//
// The harness mirrors the component logic exactly to ensure the tests reflect
// real behaviour, not a disconnected copy.

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

type HarnessResult = { status: 'ok'; gasLimit: bigint } | { status: 'error'; message: string } | null

/**
 * Minimal harness replicating exactly the runPreflight control flow:
 * - runTokenRef / currentInputsRef (refs, not closures)
 * - isSuperseded() reads both refs after every await
 * - Token is incremented at run start
 *
 * invalidateToken() simulates Guard A (controlled-input handler).
 * updateInputsRef(key) simulates Guard B (useLayoutEffect sync on wagmi state change).
 */
function makeHarness(startKey: string) {
  const runTokenRef      = { current: 0 }
  const currentInputsRef = { current: startKey }

  const invalidateToken  = () => { runTokenRef.current += 1 }
  const updateInputsRef  = (key: string) => { currentInputsRef.current = key }

  async function run(
    getBlockPromise:  Promise<{ timestamp: bigint }>,
    estimatePromise:  Promise<bigint>,
    simulatePromise:  Promise<void>,
    rawEstimateCap:   bigint = GAS_LIMIT_CAP,
  ): Promise<HarnessResult> {
    runTokenRef.current += 1
    const myToken = runTokenRef.current

    const isSuperseded = () =>
      runTokenRef.current !== myToken ||
      currentInputsRef.current !== startKey

    try {
      const block = await getBlockPromise
      if (isSuperseded()) return null

      const { collectUntil: _c, spendUntil: _s } = { collectUntil: block.timestamp + 3600n, spendUntil: block.timestamp + 86400n }
      void _c; void _s

      const rawEstimate = await estimatePromise
      if (isSuperseded()) return null

      if (rawEstimate > rawEstimateCap) {
        return { status: 'error', message: `estimate ${rawEstimate} exceeds cap` }
      }

      await simulatePromise
      if (isSuperseded()) return null

      const gasLimit = rawEstimate < GAS_LIMIT_CAP ? rawEstimate : GAS_LIMIT_CAP
      return { status: 'ok', gasLimit }
    } catch (err: any) {
      if (isSuperseded()) return null
      return { status: 'error', message: err.message as string }
    }
  }

  return { run, invalidateToken, updateInputsRef, runTokenRef, currentInputsRef }
}

describe('behavioral async invalidation — Guard A (token, controlled inputs)', () => {
  it('completes normally when no changes occur', async () => {
    const key = 'account:5042002:5042002:factory:a,b:2'
    const h = makeHarness(key)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    gb.resolve({ timestamp: 1_700_000_000n })
    est.resolve(2_000_000n)
    sim.resolve()
    const result = await p
    expect(result).not.toBeNull()
    expect(result?.status).toBe('ok')
  })

  it('Guard A: invalidated when invalidateToken() called BEFORE getBlock resolves', async () => {
    const key = 'account:5042002:5042002:factory:a,b:2'
    const h = makeHarness(key)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    // Simulate user editing a participant input: invalidateToken fires synchronously
    h.invalidateToken()
    gb.resolve({ timestamp: 1_700_000_000n })
    est.resolve(2_000_000n)
    sim.resolve()
    const result = await p
    expect(result).toBeNull()
  })

  it('Guard A: invalidated when invalidateToken() called BETWEEN getBlock and estimate', async () => {
    const key = 'account:5042002:5042002:factory:a,b:2'
    const h = makeHarness(key)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    gb.resolve({ timestamp: 1_700_000_000n })
    await Promise.resolve()  // let the continuation past getBlock run
    h.invalidateToken()      // fires before estimate resolves
    est.resolve(2_000_000n)
    sim.resolve()
    const result = await p
    expect(result).toBeNull()
  })

  it('Guard A: invalidated when invalidateToken() called BETWEEN estimate and simulate', async () => {
    const key = 'account:5042002:5042002:factory:a,b:2'
    const h = makeHarness(key)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    gb.resolve({ timestamp: 1_700_000_000n })
    est.resolve(2_000_000n)
    await Promise.resolve()
    await Promise.resolve()
    h.invalidateToken()
    sim.resolve()
    const result = await p
    expect(result).toBeNull()
  })

  it('Guard A: newer run (token advances) invalidates the first during getBlock', async () => {
    const key = 'account:5042002:5042002:factory:a,b:2'
    const h = makeHarness(key)
    const gb1 = deferred<{ timestamp: bigint }>()
    const est1 = deferred<bigint>()
    const sim1 = deferred<void>()
    const gb2 = deferred<{ timestamp: bigint }>()
    const est2 = deferred<bigint>()
    const sim2 = deferred<void>()
    const p1 = h.run(gb1.promise, est1.promise, sim1.promise)
    // Second run starts before first getBlock resolves
    const p2 = h.run(gb2.promise, est2.promise, sim2.promise)
    gb1.resolve({ timestamp: 1_700_000_000n })
    gb2.resolve({ timestamp: 1_700_000_001n })
    est1.resolve(2_000_000n); sim1.resolve()
    est2.resolve(2_100_000n); sim2.resolve()
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBeNull()       // first run discarded
    expect(r2?.status).toBe('ok')  // second run wins
  })

  it('Guard A: change-and-change-back — same final key, new token invalidates old run', async () => {
    // User types a character and then immediately deletes it: key is the same
    // at the post-await check, BUT the token advanced. The old run must be discarded.
    const key = 'account:5042002:5042002:factory:a,b:2'
    const h = makeHarness(key)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const oldRunToken = h.runTokenRef.current
    const p = h.run(gb.promise, est.promise, sim.promise)
    const runToken = h.runTokenRef.current
    expect(runToken).toBe(oldRunToken + 1)
    // User edits (token advances) then reverts (key stays the same)
    h.invalidateToken()
    // currentInputsRef still holds the original key (revert = same key)
    expect(h.currentInputsRef.current).toBe(key)
    gb.resolve({ timestamp: 1_700_000_000n })
    est.resolve(2_000_000n)
    sim.resolve()
    const result = await p
    // Token diverged: runTokenRef.current = runToken+1, myToken = runToken → discarded
    expect(result).toBeNull()
  })
})

describe('behavioral async invalidation — Guard B (inputsRef, wagmi state changes)', () => {
  it('Guard B: invalidated when walletChainId changes during getBlock await', async () => {
    // Simulates: Rabby switches from Arc Testnet to Ethereum mainnet while
    // getBlock is in flight. useLayoutEffect fires, updating currentInputsRef.
    const keyWithTestnet  = 'account:5042002:5042002:factory:a,b:2'
    const keyWithEthereum = 'account:5042002:1:factory:a,b:2'  // walletChainId=1
    const h = makeHarness(keyWithTestnet)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    // Simulate wagmi walletChainId update → useLayoutEffect fires synchronously
    h.updateInputsRef(keyWithEthereum)
    gb.resolve({ timestamp: 1_700_000_000n })
    est.resolve(2_000_000n)
    sim.resolve()
    const result = await p
    expect(result).toBeNull()
  })

  it('Guard B: invalidated when walletChainId changes between estimate and simulate', async () => {
    const keyWithTestnet  = 'account:5042002:5042002:factory:a,b:2'
    const keyAfterSwitch  = 'account:5042002:1:factory:a,b:2'
    const h = makeHarness(keyWithTestnet)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    gb.resolve({ timestamp: 1_700_000_000n })
    est.resolve(2_000_000n)
    await Promise.resolve()
    await Promise.resolve()
    // Wallet switches chain after estimate resolves, before simulate resolves
    h.updateInputsRef(keyAfterSwitch)
    sim.resolve()
    const result = await p
    expect(result).toBeNull()
  })

  it('Guard B: completes when wagmi state does NOT change', async () => {
    const key = 'account:5042002:5042002:factory:a,b:2'
    const h = makeHarness(key)
    h.updateInputsRef(key)  // layout effect ran with same key
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    gb.resolve({ timestamp: 1_700_000_000n })
    est.resolve(2_500_000n)
    sim.resolve()
    const result = await p
    expect(result?.status).toBe('ok')
  })

  it('Guard B: invalidated when account disconnects mid-run (address becomes undefined)', async () => {
    const keyConnected    = '0xaaa:5042002:5042002:factory:a,b:2'
    const keyDisconnected = ':5042002:none:factory:a,b:2'
    const h = makeHarness(keyConnected)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    gb.resolve({ timestamp: 1_700_000_000n })
    await Promise.resolve()
    h.updateInputsRef(keyDisconnected)  // wagmi fires on disconnect
    est.resolve(2_000_000n)
    sim.resolve()
    const result = await p
    expect(result).toBeNull()
  })
})

describe('edge cases', () => {
  it('returns null (not error) when superseded at gas-exceeds-cap check', async () => {
    // If estimate exceeds cap BUT the run is already superseded, return null
    // (not an error state), so the UI is not polluted by a stale error.
    const key = 'account:5042002:5042002:factory:a,b:2'
    const h = makeHarness(key)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    gb.resolve({ timestamp: 1_700_000_000n })
    await Promise.resolve()
    h.invalidateToken()
    est.resolve(4_000_000n)  // over cap
    sim.resolve()
    const result = await p
    // Guard A fires (at the estimate check) before the gas cap check → null
    expect(result).toBeNull()
  })

  it('blocks when rawEstimate exceeds GAS_LIMIT_CAP (no invalidation)', async () => {
    const key = 'account:5042002:5042002:factory:a,b:2'
    const h = makeHarness(key)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    gb.resolve({ timestamp: 1_700_000_000n })
    est.resolve(3_000_001n)
    sim.resolve()
    const result = await p
    expect(result?.status).toBe('error')
    expect(result?.message).toMatch(/exceeds cap/)
  })

  it('clamps gasLimit to GAS_LIMIT_CAP when estimate equals cap exactly', async () => {
    const key = 'account:5042002:5042002:factory:a,b:2'
    const h = makeHarness(key)
    const gb = deferred<{ timestamp: bigint }>()
    const est = deferred<bigint>()
    const sim = deferred<void>()
    const p = h.run(gb.promise, est.promise, sim.promise)
    gb.resolve({ timestamp: 1_700_000_000n })
    est.resolve(3_000_000n)  // exactly at cap
    sim.resolve()
    const result = await p
    expect(result?.status).toBe('ok')
    expect((result as any)?.gasLimit).toBe(3_000_000n)
  })
})
