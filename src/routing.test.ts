/**
 * Unit tests for App.tsx routing predicates.
 *
 * shouldShowClose is exported as a pure function so it can be tested without
 * a React or wagmi environment. The tests import the actual function from
 * App.tsx — they exercise the same code path the component tree uses, not a
 * disconnected copy.
 *
 * This file uses bun:test. Excluded from tsconfig and oxlint via the
 * existing *.test.ts exclusion rules.
 */
// oxlint-disable
/* eslint-disable */
// @ts-nocheck

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { shouldShowClose } from './App'
import { Phase, isReviewedFactory, ARC_TESTNET_CHAIN_ID, ARC_MAINNET_CHAIN_ID } from './lib/constants'

// ── App.tsx source-text wiring regression ───────────────────────────────────
// Reads the actual source file so this test FAILS if App.tsx reverts to
// isReviewedFactory={false} or removes the derivation expression.
// The 9 derivation/behaviour tests below this block test the allowlist logic
// itself; this block is the only one that catches a hardcoded-false regression
// in the JSX prop.
describe('App.tsx source wiring — detects hardcoded isReviewedFactory={false} regression', () => {
  const src = readFileSync(new URL('./App.tsx', import.meta.url).pathname, 'utf8')

  it('derives factoryIsReviewed from the allowlist — derivation expression present', () => {
    // Must contain: factoryIsReviewed = factoryValid && isReviewedFactory(
    expect(src).toMatch(/factoryIsReviewed\s*=\s*factoryValid\s*&&\s*isReviewedFactory\s*\(/)
  })

  it('passes factoryIsReviewed to StepCreate — not a literal', () => {
    // Must contain: isReviewedFactory={factoryIsReviewed}
    expect(src).toMatch(/isReviewedFactory=\{factoryIsReviewed\}/)
  })

  it('does NOT contain the hardcoded isReviewedFactory={false}', () => {
    expect(src).not.toMatch(/isReviewedFactory=\{false\}/)
  })

  it('unverified-factory warning uses factoryValid && !factoryIsReviewed condition', () => {
    // The "Unverified factory" warning must be gated on both factoryValid and
    // the negation of factoryIsReviewed — not on factoryValid alone.
    expect(src).toMatch(/factoryValid\s*&&\s*!factoryIsReviewed/)
  })
})

// ── isReviewedFactory allowlist behaviour ────────────────────────────────────
// These test the allowlist logic itself; they do NOT guard against the
// hardcoded-false regression (that is the source-text block above).
describe('isReviewedFactory — allowlist behaviour', () => {
  const REVIEWED = '0x0cf03f85278a7d1ce3057b77043e1b9af3da2ec0'
  const UNKNOWN  = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

  it('returns true for the deployed testnet factory on Arc Testnet', () => {
    expect(isReviewedFactory(ARC_TESTNET_CHAIN_ID, REVIEWED)).toBe(true)
  })

  it('returns false for an unknown address on Arc Testnet', () => {
    expect(isReviewedFactory(ARC_TESTNET_CHAIN_ID, UNKNOWN)).toBe(false)
  })

  it('returns false for the testnet factory on Arc Mainnet (empty list)', () => {
    expect(isReviewedFactory(ARC_MAINNET_CHAIN_ID, REVIEWED)).toBe(false)
  })

  it('returns false for any address on Arc Mainnet (allowlist is empty)', () => {
    expect(isReviewedFactory(ARC_MAINNET_CHAIN_ID, UNKNOWN)).toBe(false)
  })

  it('is case-insensitive — upper-case address matches', () => {
    expect(isReviewedFactory(ARC_TESTNET_CHAIN_ID, REVIEWED.toUpperCase())).toBe(true)
  })

  it('returns false for empty string factory address', () => {
    expect(isReviewedFactory(ARC_TESTNET_CHAIN_ID, '')).toBe(false)
  })

  it('factoryIsReviewed derivation: false when factoryValid=false', () => {
    const factoryValid = false
    const factoryIsReviewed = factoryValid && isReviewedFactory(ARC_TESTNET_CHAIN_ID, REVIEWED)
    expect(factoryIsReviewed).toBe(false)
  })

  it('factoryIsReviewed derivation: true when factoryValid=true and reviewed', () => {
    const factoryValid = true
    const factoryIsReviewed = factoryValid && isReviewedFactory(ARC_TESTNET_CHAIN_ID, REVIEWED)
    expect(factoryIsReviewed).toBe(true)
  })

  it('factoryIsReviewed derivation: false when factoryValid=true but not reviewed', () => {
    const factoryValid = true
    const factoryIsReviewed = factoryValid && isReviewedFactory(ARC_TESTNET_CHAIN_ID, UNKNOWN)
    expect(factoryIsReviewed).toBe(false)
  })
})

describe('shouldShowClose — rendering predicate for StepClose', () => {
  // ── Phases where close IS reachable ─────────────────────────────────────

  it('returns true for Phase.Returning (close() callable once liability=0)', () => {
    expect(shouldShowClose(Phase.Returning)).toBe(true)
  })

  it('returns true for Phase.Closed (vault already closed, show final accounting)', () => {
    expect(shouldShowClose(Phase.Closed)).toBe(true)
  })

  // ── Phases where close is NOT yet reachable ───────────────────────────────

  it('returns false for Phase.Collecting', () => {
    expect(shouldShowClose(Phase.Collecting)).toBe(false)
  })

  it('returns false for Phase.Active', () => {
    expect(shouldShowClose(Phase.Active)).toBe(false)
  })

  it('returns false for null (phase not yet loaded)', () => {
    expect(shouldShowClose(null)).toBe(false)
  })

  // ── Numeric values — matches Solidity Phase enum order ───────────────────

  it('Phase enum values: Collecting=0, Active=1, Returning=2, Closed=3', () => {
    expect(Phase.Collecting).toBe(0)
    expect(Phase.Active).toBe(1)
    expect(Phase.Returning).toBe(2)
    expect(Phase.Closed).toBe(3)
  })

  it('returns true for numeric 2 (Returning)', () => {
    expect(shouldShowClose(2)).toBe(true)
  })

  it('returns true for numeric 3 (Closed)', () => {
    expect(shouldShowClose(3)).toBe(true)
  })

  it('returns false for numeric 0 (Collecting)', () => {
    expect(shouldShowClose(0)).toBe(false)
  })

  it('returns false for numeric 1 (Active)', () => {
    expect(shouldShowClose(1)).toBe(false)
  })

  // ── Exhaustiveness: no other phase value returns true ─────────────────────

  it('returns false for an unknown future phase value (e.g. 4)', () => {
    expect(shouldShowClose(4)).toBe(false)
  })

  it('returns false for -1 (invalid / sentinel)', () => {
    expect(shouldShowClose(-1)).toBe(false)
  })
})
