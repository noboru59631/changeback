import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runKeeper } from './meetup-keeper.mjs'
import { requireSafeNetwork } from '../src/lib/meetup-abi.ts'

function fixture({ finalized = true, now = 200n, count = 3, blocked = new Set(), automatic = false } = {}) {
  const claimed = new Set()
  let spent = 0n
  const calls = []
  const client = {
    getBlock: async () => ({ timestamp: now }),
    readContract: async ({ functionName, args }) => {
      const values = {
        finalized, terms: ['terms', 10n, BigInt(count), 100n, 200n, false],
        participantCount: BigInt(count), budgetCount: 2n,
      }
      if (functionName === 'participants') return `payer${args[0]}`
      if (functionName === 'members') return ['refund', 'name', 10n, 10n, claimed.has(args[0])]
      if (functionName === 'budgets') return ['merchant', 10n, args[0] === 0n ? 0 : 2, 110n, args[0] === 0n && automatic]
      if (functionName === 'budgetSpent') return spent
      return values[functionName]
    },
  }
  const send = async (name, args) => {
    calls.push([name, args])
    if (name === 'refundFor') {
      if (blocked.has(args[0])) throw new Error('Blocked recipient')
      assert.equal(claimed.has(args[0]), false)
      claimed.add(args[0])
    }
    if (name === 'executeScheduled') spent = 10n
  }
  return { client, send, calls, claimed }
}

test('partial failure does not stop later refunds; retry skips completed refunds', async () => {
  const blocked = new Set(['payer0'])
  const setup = fixture({ blocked })
  const first = await runKeeper({ ...setup, escrow: 'event' })
  assert.deepEqual(first.results.map(job => job.status), ['retry', 'success', 'success'])
  blocked.clear()
  await runKeeper({ ...setup, escrow: 'event' })
  assert.equal(setup.claimed.size, 3)
  assert.equal(setup.calls.length, 4)
})

test('cursor prevents a full batch of failed recipients starving later participants', async () => {
  const setup = fixture({ count: 30, blocked: new Set(Array.from({ length: 20 }, (_, index) => `payer${index}`)) })
  const first = await runKeeper({ ...setup, escrow: 'event', maxJobs: 20 })
  assert.equal(first.nextIndex, 20)
  await runKeeper({ ...setup, escrow: 'event', startIndex: first.nextIndex, maxJobs: 10 })
  assert.equal(setup.claimed.size, 10)
})

test('keeper executes due merchants once and never authorizes staff', async () => {
  const setup = fixture({ finalized: false, now: 120n, automatic: true })
  await runKeeper({ ...setup, escrow: 'event' })
  await runKeeper({ ...setup, escrow: 'event' })
  assert.deepEqual(setup.calls, [['executeScheduled', [0n]]])
})

test('Mainnet and remote development chains are rejected', () => {
  assert.throws(() => requireSafeNetwork(5042, 'https://rpc.mainnet.arc.io'))
  assert.throws(() => requireSafeNetwork(31337, 'https://example.com'))
  requireSafeNetwork(31337, 'http://127.0.0.1:8545')
  requireSafeNetwork(5042002, 'https://rpc.testnet.arc.io')
})

test('dry run is explicitly marked planned and invalid batch sizes rejected', async () => {
  const setup = fixture()
  const result = await runKeeper({ ...setup, escrow: 'event', send: async () => false })
  assert.equal(result.results[0].status, 'planned')
  await assert.rejects(runKeeper({ ...setup, escrow: 'event', maxJobs: 21 }))
})
