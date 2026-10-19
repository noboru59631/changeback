/**
 * Unit tests for parseUsdc and formatUsdc6dp.
 * Run with: bun test src/lib/format.test.ts
 *
 * This file uses bun:test (a Bun built-in). It is excluded from
 * the TypeScript project (tsconfig.json exclude) and from oxlint
 * type-aware analysis. Lint rules are disabled at file level.
 */
// oxlint-disable
/* eslint-disable */
// @ts-nocheck

import { describe, it, expect } from 'bun:test'
import { parseUsdc, formatUsdc, formatUsdc6dp } from './format'

describe('parseUsdc — valid inputs', () => {
  it('parses "1" as 1_000_000', () => expect(parseUsdc('1')).toBe(1_000_000n))
  it('parses "1.0" as 1_000_000', () => expect(parseUsdc('1.0')).toBe(1_000_000n))
  it('parses "1.5" as 1_500_000', () => expect(parseUsdc('1.5')).toBe(1_500_000n))
  it('parses "0.5" as 500_000', () => expect(parseUsdc('0.5')).toBe(500_000n))
  it('parses "0.50" as 500_000', () => expect(parseUsdc('0.50')).toBe(500_000n))
  it('parses "0.000001" (1 micro-USDC)', () => expect(parseUsdc('0.000001')).toBe(1n))
  it('parses "1.000000" as 1_000_000', () => expect(parseUsdc('1.000000')).toBe(1_000_000n))
  it('parses "100.0" as 100_000_000', () => expect(parseUsdc('100.0')).toBe(100_000_000n))
  it('parses "0" as 0', () => expect(parseUsdc('0')).toBe(0n))
  it('parses "0.0" as 0', () => expect(parseUsdc('0.0')).toBe(0n))
  it('parses ".5" (leading-dot) as 500_000', () => expect(parseUsdc('.5')).toBe(500_000n))
  it('parses "1." (trailing-dot) as 1_000_000', () => expect(parseUsdc('1.')).toBe(1_000_000n))
  it('parses exact 6 dp "1.123456"', () => expect(parseUsdc('1.123456')).toBe(1_123_456n))
})

describe('parseUsdc — invalid / rejected inputs', () => {
  it('rejects negative "-0.5"',      () => expect(parseUsdc('-0.5')).toBeNull())
  it('rejects negative "-1.5"',      () => expect(parseUsdc('-1.5')).toBeNull())
  it('rejects negative "-1"',        () => expect(parseUsdc('-1')).toBeNull())
  it('rejects scientific "1e3"',     () => expect(parseUsdc('1e3')).toBeNull())
  it('rejects scientific "1E6"',     () => expect(parseUsdc('1E6')).toBeNull())
  it('rejects >6dp "1.0000001"',     () => expect(parseUsdc('1.0000001')).toBeNull())
  it('rejects multiple dots "1.2.3"',() => expect(parseUsdc('1.2.3')).toBeNull())
  it('rejects whitespace-only " "',  () => expect(parseUsdc(' ')).toBeNull())
  it('rejects empty string ""',      () => expect(parseUsdc('')).toBeNull())
  it('rejects alpha "abc"',          () => expect(parseUsdc('abc')).toBeNull())
  it('rejects "1 000" (space)',      () => expect(parseUsdc('1 000')).toBeNull())
  it('rejects leading whitespace " 1"', () => expect(parseUsdc(' 1')).toBeNull())
  it('rejects trailing whitespace "1 "', () => expect(parseUsdc('1 ')).toBeNull())
  it('rejects "NaN"',                () => expect(parseUsdc('NaN')).toBeNull())
  it('rejects "Infinity"',           () => expect(parseUsdc('Infinity')).toBeNull())
  it('rejects "+1" (explicit plus)', () => expect(parseUsdc('+1')).toBeNull())
})

describe('formatUsdc6dp — exact precision', () => {
  it('formats 1n as "0.000001"',      () => expect(formatUsdc6dp(1n)).toBe('0.000001'))
  it('formats 1_000_000n as "1"',     () => expect(formatUsdc6dp(1_000_000n)).toBe('1'))
  it('formats 1_500_000n as "1.5"',   () => expect(formatUsdc6dp(1_500_000n)).toBe('1.5'))
  it('formats 500_000n as "0.5"',     () => expect(formatUsdc6dp(500_000n)).toBe('0.5'))
  it('formats 0n as "0"',             () => expect(formatUsdc6dp(0n)).toBe('0'))
  it('formats 1_234_567n as "1.234567"', () => expect(formatUsdc6dp(1_234_567n)).toBe('1.234567'))
  it('strips trailing zeros "1.500000" → "1.5"', () => expect(formatUsdc6dp(1_500_000n)).toBe('1.5'))
})

describe('formatUsdc — 2dp display', () => {
  it('formats 1_000_000n as "1.00"',  () => expect(formatUsdc(1_000_000n)).toBe('1.00'))
  it('formats 500_000n as "0.50"',    () => expect(formatUsdc(500_000n)).toBe('0.50'))
  it('formats 1n as "0.00" (truncates sub-cent)', () => expect(formatUsdc(1n)).toBe('0.00'))
  it('formats 10_000n as "0.01"',     () => expect(formatUsdc(10_000n)).toBe('0.01'))
  it('formats 0n as "0.00"',          () => expect(formatUsdc(0n)).toBe('0.00'))
})
