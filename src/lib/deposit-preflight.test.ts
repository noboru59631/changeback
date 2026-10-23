import { describe, expect, it } from 'bun:test'
import type { PublicClient } from 'viem'
import { checkCollectionLimit, prepareDepositCheck } from './deposit-preflight'

const account = '0x0000000000000000000000000000000000001000'
const vault = '0x0000000000000000000000000000000000002000'

function fixture(values: Record<string, unknown> = {}, chainId = 5042) {
  const requests: Record<string, unknown>[] = []
  const client = {
    getChainId: async () => chainId,
    getBlock: async () => ({ number: 20n, timestamp: 100n }),
    readContract: async (request: Record<string, unknown>) => {
      requests.push(request)
      return ({ totalContributions: 90_000n, collectUntil: 101n, paused: false, isParticipant: true, ...values })[request.functionName as string]
    },
  } as unknown as PublicClient
  return { client, requests }
}

describe('cumulative Mainnet collection safety check', () => {
  it('accepts the exact boundary and rejects repeated deposits above it', () => {
    expect(() => checkCollectionLimit(5042, 90_000n, 10_000n)).not.toThrow()
    expect(() => checkCollectionLimit(5042, 90_000n, 90_000n)).toThrow('cumulative')
    expect(() => checkCollectionLimit(5042, 100_000n, 1n)).toThrow('cumulative')
    expect(() => checkCollectionLimit(5042, 270_000n, 1n)).toThrow('cumulative')
  })
  it('rejects unsupported networks and invalid amounts without restricting test funds', () => {
    expect(() => checkCollectionLimit(1, 0n, 1n)).toThrow('Unsupported')
    expect(() => checkCollectionLimit(5042, 0n, 0n)).toThrow('positive')
    expect(() => checkCollectionLimit(5042002, 270_000n, 1n)).not.toThrow()
  })
  it('reads one chain snapshot and detects another contributor using the remaining budget', async () => {
    const { client, requests } = fixture()
    expect(await prepareDepositCheck(client, account, vault, 10_000n, 5042)).toBe(90_000n)
    expect(requests.every(request => request.blockNumber === 20n)).toBe(true)
    expect(requests.find(request => request.functionName === 'isParticipant')?.args).toEqual([account])
    await expect(prepareDepositCheck(fixture({ totalContributions: 95_000n }).client, account, vault, 10_000n, 5042)).rejects.toThrow('cumulative')
  })
  it('fails closed for chain mismatch, pause, outsiders, deadline and missing data', async () => {
    await expect(prepareDepositCheck(fixture({}, 5042002).client, account, vault, 1n, 5042)).rejects.toThrow('mismatch')
    for (const [values, message] of [
      [{ paused: true }, 'paused'], [{ isParticipant: false }, 'participant'],
      [{ collectUntil: 100n }, 'deadline'], [{ totalContributions: undefined }, 'not ready'],
    ] as const) {
      await expect(prepareDepositCheck(fixture(values).client, account, vault, 1n, 5042)).rejects.toThrow(message)
    }
  })
  it('does not swallow RPC errors', async () => {
    const { client } = fixture()
    client.getBlock = async () => { throw new Error('RPC offline') }
    await expect(prepareDepositCheck(client, account, vault, 1n, 5042)).rejects.toThrow('RPC offline')
  })
})
