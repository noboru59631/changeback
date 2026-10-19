/**
 * USDC formatting and parsing utilities.
 *
 * parseUsdc: strict unsigned decimal-string only. Rejects signs, exponents,
 *   multiple dots, >6 dp, whitespace-only, and any non-numeric input.
 *   No Number() conversion — pure string manipulation then BigInt.
 *
 * formatUsdc6dp: exact up-to-6dp formatter for confirmation/claim/entitlement values.
 * formatUsdc: 2dp display-only formatter (rounds DOWN, for balances / summaries).
 */

import { USDC_DECIMALS } from './constants'

// Strict pattern: optional leading digits, optional single dot, optional trailing digits.
// Must have at least one digit. No sign, no exponent, no whitespace.
const STRICT_UNSIGNED_DECIMAL = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/

/**
 * Parse a strict unsigned decimal string to a raw bigint USDC amount.
 * Rejects:
 *   - Negative values (leading minus)
 *   - Scientific notation (1e3)
 *   - More than 6 decimal places (>6dp)
 *   - Multiple dots
 *   - Whitespace-only or empty
 *   - Any non-digit, non-dot character
 * Returns null on invalid input; never rounds or truncates silently.
 */
export function parseUsdc(value: string): bigint | null {
  // No trim — caller must provide clean input; we reject leading/trailing whitespace.
  if (!STRICT_UNSIGNED_DECIMAL.test(value)) return null

  const dotIndex = value.indexOf('.')
  const whole = dotIndex === -1 ? value : value.slice(0, dotIndex)
  const frac  = dotIndex === -1 ? ''    : value.slice(dotIndex + 1)

  // Reject more than 6 decimal places (do not silently truncate).
  if (frac.length > USDC_DECIMALS) return null

  const fracPadded = frac.padEnd(USDC_DECIMALS, '0')

  try {
    const wholePart = BigInt(whole || '0')
    const fracPart  = BigInt(fracPadded)
    if (wholePart < 0n || fracPart < 0n) return null // guard (should never trigger)
    return wholePart * BigInt(10 ** USDC_DECIMALS) + fracPart
  } catch {
    return null
  }
}

/**
 * Format a raw bigint USDC amount to an exact string with up to 6 dp,
 * trailing zeros stripped. Used for confirmation dialogs, claim receipts,
 * entitlement displays, and any value where sub-cent precision matters.
 * Examples: 1_000_000n → "1", 1_500_000n → "1.5", 1n → "0.000001"
 */
export function formatUsdc6dp(raw: bigint): string {
  if (raw < 0n) return '0'
  const divisor   = BigInt(10 ** USDC_DECIMALS)
  const whole     = raw / divisor
  const frac      = raw % divisor
  if (frac === 0n) return whole.toString()
  const fracStr   = frac.toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}

/**
 * Format a raw bigint USDC amount to a fixed-2dp string for balance / summary display.
 * Truncates (does not round) sub-cent amounts.
 * Use formatUsdc6dp for precision-critical values.
 */
export function formatUsdc(raw: bigint): string {
  if (raw < 0n) return '0.00'
  const divisor = BigInt(10 ** USDC_DECIMALS)
  const whole   = raw / divisor
  const frac    = raw % divisor
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').slice(0, 2)
  return `${whole}.${fracStr}`
}

/** Shorten an Ethereum address for display: 0x1234…abcd */
export function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Format a Unix timestamp as a locale date+time string. */
export function formatTs(ts: number | bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Seconds until a future timestamp, or 0 if already past. */
export function secondsUntil(ts: number | bigint): number {
  return Math.max(0, Number(ts) - Math.floor(Date.now() / 1000))
}

/** Format a seconds count as "Xh Ym" or "Xm Ys" etc. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
