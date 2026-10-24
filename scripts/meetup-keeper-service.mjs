import { setTimeout } from 'node:timers/promises'
import { keeperMain } from './meetup-keeper.mjs'

if (!process.argv.includes('--execute-testnet')) throw new Error('Service requires explicit --execute-testnet')
const interval = Number(process.env.MEETUP_KEEPER_INTERVAL_SECONDS || '30') * 1000
if (!Number.isFinite(interval) || interval < 10_000 || interval > 300_000) throw new Error('Interval must be 10–300 seconds')
const controller = new AbortController()
process.once('SIGINT', () => controller.abort())
process.once('SIGTERM', () => controller.abort())
let failures = 0
while (!controller.signal.aborted) {
  process.exitCode = 0
  try {
    await keeperMain()
    failures = process.exitCode ? failures + 1 : 0
  } catch (error) {
    failures++
    console.error(JSON.stringify({ status: 'retry', reason: error.shortMessage || error.message }))
  }
  const delay = Math.min(interval * 2 ** Math.min(failures, 4), 300_000)
  try { await setTimeout(delay, undefined, { signal: controller.signal }) } catch { break }
}
