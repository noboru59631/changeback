import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nativePaymentStatus, nativeRefunds, reconcileNativeReceipts } from './native-accounting.ts'
import type { NativeReceipt } from './native-accounting.ts'

test('native precision, short and excess amounts are preserved without truncation', () => {
  assert.deepEqual([0n, 1n, 10n, 11n].map(amount => nativePaymentStatus(amount, 10n)), ['unpaid', 'short', 'paid', 'excess'])
  assert.deepEqual(nativeRefunds([13n, 10n, 4n], 10n, 12n), [7n, 4n, 4n])
  assert.deepEqual(nativeRefunds([1n, 2n], 10n, 0n), [1n, 2n])
  assert.throws(() => nativeRefunds([13n, 4n], 10n, 11n))
})

test('native refunds conserve every unit across partial, full and excess payments', () => {
  for (let first = 0n; first <= 24n; first++) {
    for (let second = 0n; second <= 24n; second++) {
      const limit = (first >= 10n ? 10n : 0n) + (second >= 10n ? 10n : 0n)
      for (let spent = 0n; spent <= limit; spent++) {
        const refunds = nativeRefunds([first, second], 10n, spent)
        assert.equal(refunds[0] + refunds[1] + spent, first + second)
      }
    }
  }
})

const evidence = (changes: Partial<NativeReceipt> = {}): NativeReceipt => ({
  chainId: 5042002, escrow: 'event', transactionHash: 'tx1', blockHash: 'block1', logIndex: 0,
  payer: 'alice', amount: 10n, source: 'NativePaid', success: true, ...changes,
})
const reconcile = (items: NativeReceipt[]) => reconcileNativeReceipts(items, 5042002, 'event', new Set(['block1']))

test('Arc system and ERC20 mirror logs cannot double-credit NativePaid', () => {
  const result = reconcile([evidence(), evidence({ source: 'system-transfer' }), evidence({ source: 'erc20-transfer' })])
  assert.equal(result.accepted.length, 1)
  assert.equal(result.review.length, 2)
})

test('RPC replay is idempotent; actual second transfer remains distinct', () => {
  assert.equal(reconcile([evidence(), evidence()]).accepted.length, 1)
  assert.equal(reconcile([evidence(), evidence({ transactionHash: 'tx2' })]).accepted.length, 2)
  assert.equal(reconcile([evidence(), evidence({ payer: 'bob' })]).accepted.length, 0)
})

test('failed, orphaned, invalid and wrong-network evidence never becomes accounting', () => {
  for (const changes of [{ success: false }, { blockHash: 'orphan' }, { amount: 0n }, { logIndex: -1 }]) {
    assert.equal(reconcile([evidence(changes)]).accepted.length, 0)
  }
  assert.equal(reconcile([evidence({ chainId: 5042 }), evidence({ escrow: 'other' })]).accepted.length, 0)
  assert.equal(reconcileNativeReceipts([evidence()], 5042002, 'event', new Set()).accepted.length, 0)
})
