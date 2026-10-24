import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcilePayments, distributeRefunds, validateResidualSpend } from './event-accounting.ts'
import type { PaymentEvidence } from './event-accounting.ts'

const terms = { chainId: 5042002, token: 'usdc', escrow: 'event', fee: 10_000_000n, deadline: 100n }
const attendees = ['alice', 'bob', 'carol'].map(wallet => ({ wallet, name: wallet, verified: true }))
const evidence = (changes: Partial<PaymentEvidence> = {}): PaymentEvidence => ({
  chainId: terms.chainId, token: 'usdc', escrow: 'event', payer: 'alice', amount: terms.fee,
  timestamp: 90n, transactionHash: '0xabc', logIndex: 1, confirmed: true, kind: 'accounted', ...changes,
})

test('paid, unpaid and insufficient amounts derive from accepted accounting events', () => {
  const result = reconcilePayments(attendees, [evidence(), evidence({ payer: 'bob', amount: 4n, logIndex: 2 })], terms)
  assert.deepEqual(result.rows.map(row => row.status), ['paid', 'short', 'unpaid'])
})

test('RPC replay is idempotent; a second actual payment is excess', () => {
  assert.equal(reconcilePayments(attendees, [evidence(), evidence()], terms).rows[0].status, 'paid')
  assert.equal(reconcilePayments(attendees, [evidence(), evidence({ logIndex: 2 })], terms).rows[0].status, 'duplicate')
})

test('plain transfers, late deposits, unconfirmed logs and forged registration require review', () => {
  for (const changes of [{ kind: 'direct' as const }, { timestamp: 100n }, { confirmed: false }, { amount: -1n }]) {
    const row = reconcilePayments(attendees, [evidence(changes)], terms).rows[0]
    assert.equal(row.status, 'review')
    assert.equal(row.received, 0n)
  }
  assert.equal(reconcilePayments([{ ...attendees[0], verified: false }], [evidence()], terms).rows[0].status, 'review')
})

test('wrong chain, token or event cannot credit a participant; exchange deposits stay unmatched', () => {
  for (const changes of [{ chainId: 5042 }, { token: 'fake' }, { escrow: 'evil' }]) {
    assert.equal(reconcilePayments(attendees, [evidence(changes)], terms).rows[0].status, 'unpaid')
  }
  const result = reconcilePayments(attendees, [evidence({ payer: 'exchange', kind: 'direct' })], terms)
  assert.equal(result.unmatched.length, 1)
  assert.equal(result.rows[0].status, 'unpaid')
})

test('conflicting receipts and duplicate registry identities never become paid', () => {
  assert.equal(reconcilePayments(attendees, [evidence(), evidence({ amount: 1n })], terms).rows[0].status, 'review')
  assert.equal(reconcilePayments([attendees[0], attendees[0]], [evidence()], terms).rows[0].status, 'review')
})

test('refund allocation matches the contract, reserves partial payments and conserves every unit', () => {
  assert.deepEqual(distributeRefunds([10n, 10n, 10n, 3n], 10n, 14n), [5n, 5n, 6n, 3n])
  assert.throws(() => distributeRefunds([10n, 3n], 10n, 11n))
  assert.deepEqual(distributeRefunds([0n, 3n], 10n, 0n), [0n, 3n])
  for (let spent = 0n; spent <= 30n; spent++) {
    const refunds = distributeRefunds([10n, 10n, 10n, 3n], 10n, spent)
    assert.equal(refunds.reduce((sum, amount) => sum + amount, spent), 33n)
  }
})

const org = '0xOrganizer'
const validArgs = (overrides: Partial<{ spent: bigint; finalized: boolean; caller: string; now: bigint }> = {}) => [
  100n, overrides.spent ?? 40n, overrides.finalized ?? false,
  org, overrides.caller ?? org,
  1000n, 2000n, overrides.now ?? 1500n,
] as const

test('validateResidualSpend returns cap minus spent for valid organizer within spend window', () => {
  assert.equal(validateResidualSpend(...validArgs()), 60n)
  assert.equal(validateResidualSpend(...validArgs({ spent: 0n })), 100n)
})

test('validateResidualSpend rejects when finalized', () => {
  assert.throws(() => validateResidualSpend(...validArgs({ finalized: true })), /finalized/)
})

test('validateResidualSpend rejects non-organizer caller', () => {
  assert.throws(() => validateResidualSpend(...validArgs({ caller: '0xOther' })), /organizer/)
})

test('validateResidualSpend rejects when spend window has closed', () => {
  assert.throws(() => validateResidualSpend(...validArgs({ now: 2000n })), /closed/)
})

test('validateResidualSpend rejects during collection window', () => {
  assert.throws(() => validateResidualSpend(...validArgs({ now: 999n })), /collection/)
})

test('validateResidualSpend rejects when budget is fully spent', () => {
  assert.throws(() => validateResidualSpend(...validArgs({ spent: 100n })), /remaining/)
})
