import { describe, it, expect } from 'bun:test'
import { decodeFunctionData } from 'viem'
import type { PublicClient } from 'viem'
import { VAULT_ABI } from './abi'
import { paymentCandidate, preparePayment } from './payment-preflight'

const input = {
  chainId: 5042002, account: '0x03607de69C487BcC460eaD7C4Bdfd25805658b75',
  vault: '0x6450E88EFeF6Bd1aA80529765834af153cfDf386' as const,
  recipient: '0x89A4EF745831CFe8957391Ad2e3CF55Dc3a6e502',
  amount: '0.03', memo: '', hours: '1', available: 100000n, spendUntil: 1792359920n,
}

describe('payment preflight', () => {
  it('encodes exact amount, memo and fixed chain-time expiry', () => {
    const candidate = paymentCandidate(input, 1792304117n)
    const decoded = decodeFunctionData({ abi: VAULT_ABI, data: candidate.data })
    expect(decoded.functionName).toBe('proposePayment')
    expect(decoded.args).toEqual([input.recipient, 30000n,
      '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470', 1792307717n])
    expect(candidate.value).toBe(0n)
  })
  for (const amount of ['0', '-1', '1e-2', '0.0000001', ' 0.03', '0.11']) {
    it(`rejects invalid or unaffordable amount ${amount}`, () => {
      expect(() => paymentCandidate({ ...input, amount }, 1792304117n)).toThrow()
    })
  }
  for (const recipient of ['0x' + 'z'.repeat(40), '0x' + '0'.repeat(40), input.vault]) {
    it(`rejects bad recipient ${recipient}`, () => {
      expect(() => paymentCandidate({ ...input, recipient }, 1792304117n)).toThrow()
    })
  }
  it('rejects default 24 hour expiry beyond spend deadline', () => {
    expect(() => paymentCandidate({ ...input, hours: '24' }, 1792304117n)).toThrow()
  })
  for (const hours of ['0', '-1', 'NaN', 'Infinity', '1.1', '']) {
    it(`rejects invalid hours ${hours}`, () => {
      expect(() => paymentCandidate({ ...input, hours }, 1792304117n)).toThrow()
    })
  }
  it('accepts Arc Mainnet and rejects other chains', () => {
    expect(paymentCandidate({ ...input, chainId: 5042 }, 1792304117n).chainId).toBe(5042)
    expect(() => paymentCandidate({ ...input, chainId: 1 }, 1792304117n)).toThrow()
  })
  function mockClient(overrides = {}) {
    const calls: unknown[] = []
    const client = {
      getChainId: async () => 5042002,
      getBlock: async () => ({ number: 67788601n, hash: '0x1234', timestamp: 1792304117n }),
      call: async (request: unknown) => { calls.push(request); return { data: '0x' + '0'.repeat(64) } },
      estimateGas: async () => 144062n,
      estimateFeesPerGas: async () => ({ maxFeePerGas: 25000000000n, maxPriorityFeePerGas: 1000000000n }),
      getBalance: async () => 1000000000000000000n,
      getTransactionCount: async () => 35,
      ...overrides,
    }
    return { client: client as unknown as PublicClient, calls }
  }
  it('uses only public reads, rounds gas up and rechecks the capped request', async () => {
    const { client, calls } = mockClient()
    const result = await preparePayment(client, input)
    expect(result.gas).toBe(172875n)
    expect(result.maxFee).toBe(4321875000000000n)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual({ account: input.account, to: input.vault, data: result.data,
      value: 0n, gas: 172875n, maxFeePerGas: 25000000000n, maxPriorityFeePerGas: 1000000000n })
    expect(result.validUntil - result.preparedAt).toBeLessThanOrEqual(120001)
  })
  it('fails closed on RPC mismatch', async () => {
    const { client } = mockClient({ getChainId: async () => 1 })
    await expect(preparePayment(client, input)).rejects.toThrow('RPC chain mismatch')
  })
  it('fails closed on insufficient fee balance', async () => {
    const { client } = mockClient({ getBalance: async () => 1n })
    await expect(preparePayment(client, input)).rejects.toThrow('maximum network fee')
  })
  it('fails closed on missing fee caps', async () => {
    const { client } = mockClient({ estimateFeesPerGas: async () => ({ gasPrice: 1n }) })
    await expect(preparePayment(client, input)).rejects.toThrow('fee caps')
  })
  it('propagates a reverted simulation', async () => {
    const { client } = mockClient({ call: async () => { throw new Error('Not participant') } })
    await expect(preparePayment(client, input)).rejects.toThrow('Not participant')
  })
})
