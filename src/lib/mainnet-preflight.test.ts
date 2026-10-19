import { describe, expect, it } from 'bun:test'
import { keccak256, toBytes, type PublicClient } from 'viem'
import { prepareApproval, prepareCappedTransaction, prepareClose, prepareEarlyReturn, prepareExecution, prepareRefund } from './approval-preflight'
import { preparePayment } from './payment-preflight'

const account = '0x03607de69C487BcC460eaD7C4Bdfd25805658b75'
const vault = '0x6450E88EFeF6Bd1aA80529765834af153cfDf386'
const input = { chainId: 5042, account, vault, recipient: '0x89A4EF745831CFe8957391Ad2e3CF55Dc3a6e502',
  amount: '0.03', memo: '', hours: '1', available: 100000n, spendUntil: 2000000000n }

function fixture(overrides = {}) {
  const calls: Record<string, unknown>[] = []
  const client = {
    getChainId: async () => 5042,
    getBlock: async () => ({ number: 100n, hash: '0x1234', timestamp: 1900000000n }),
    call: async (request: Record<string, unknown>) => { calls.push(request); return { data: '0x' } },
    estimateGas: async () => 30000n,
    getBalance: async () => 1000000000000000000n,
    estimateFeesPerGas: async () => ({ maxFeePerGas: 30000000000n, maxPriorityFeePerGas: 1000000000n }),
    getTransactionCount: async () => 0,
    readContract: async (request: { functionName: string }) => request.functionName === 'spendUntil' ? 2000000000n : 0n,
    ...overrides,
  }
  return { client: client as unknown as PublicClient, calls }
}

describe('mainnet preparation without signing', () => {
  it('requires the explicitly selected chain and rejects unsupported chains', async () => {
    const { client, calls } = fixture()
    await expect(prepareApproval(client, account, vault, 0n)).rejects.toThrow('RPC chain mismatch')
    await expect(prepareApproval(client, account, vault, 0n, 1)).rejects.toThrow('RPC chain mismatch')
    expect(calls).toHaveLength(0)
  })
  it('caps approval, spend, refund and close on mainnet', async () => {
    const { client, calls } = fixture()
    await prepareApproval(client, account, vault, 0n, 5042)
    await prepareExecution(client, account, vault, 0n, 5042)
    await prepareRefund(client, account, vault, account, 5042)
    await prepareClose(client, account, vault, 5042)
    expect(calls).toHaveLength(8)
    for (const request of calls) {
      expect(request.account).toBe(account)
      expect(request.to).toBe(vault)
      expect(request.value).toBe(0n)
      expect(request.maxFeePerGas).toBe(50000000000n)
    }
  })
  it('preserves chain-time early-return expiry', async () => {
    const { client } = fixture()
    const prepared = await prepareEarlyReturn(client, account, vault, '1', 5042)
    expect(prepared.expiresAt).toBe(1900003600n)
    expect(prepared.args[0]).toBe(keccak256(toBytes('ChangeBack microgrants 0.03 USDC demonstration')))
  })
  it('accepts the approved early-return gas reallocation and rejects excess', async () => {
    const { client } = fixture({ estimateGas: async () => 106197n })
    expect((await prepareEarlyReturn(client, account, vault, '1', 5042)).gas).toBe(127437n)
    const excessive = fixture({ estimateGas: async () => 110352n })
    await expect(prepareEarlyReturn(excessive.client, account, vault, '1', 5042)).rejects.toThrow('network fee limit')
  })
  it('rejects payment proposals above the revised mainnet gas cap', async () => {
    const { client } = fixture({ estimateGas: async () => 162501n })
    await expect(preparePayment(client, input)).rejects.toThrow('mainnet network fee limit')
  })
  it('refuses gas beyond the cap after adding its buffer', async () => {
    const { client } = fixture({ estimateGas: async () => 98519n })
    await expect(prepareApproval(client, account, vault, 0n, 5042)).rejects.toThrow('network fee limit')
  })
  it('reserves principal separately from gas in the same USDC balance', async () => {
    const { client } = fixture({ getBalance: async () => 100000000000000000n })
    await expect(prepareCappedTransaction(client, account, vault, '0x', 200000n, 5042, 100000000000000000n))
      .rejects.toThrow('network fee and transfer')
  })
  it('propagates stale-state reverts before returning a request', async () => {
    let count = 0
    const { client } = fixture({ call: async () => { if (++count === 2) throw new Error('Already executed'); return {} } })
    await expect(prepareExecution(client, account, vault, 0n, 5042)).rejects.toThrow('Already executed')
  })
  it('encodes mainnet payment with six-decimal principal and zero native value', async () => {
    const { client } = fixture()
    const prepared = await preparePayment(client, input)
    expect(prepared.args[1]).toBe(30000n)
    expect(prepared.chainId).toBe(5042)
    expect(prepared.value).toBe(0n)
  })
  it('refuses excessive mainnet fees and gas', async () => {
    for (const overrides of [
      { estimateFeesPerGas: async () => ({ maxFeePerGas: 51000000000n, maxPriorityFeePerGas: 1000000000n }) },
      { estimateGas: async () => 200000n },
    ]) {
      const { client } = fixture(overrides)
      await expect(preparePayment(client, input)).rejects.toThrow('mainnet network fee limit')
    }
  })
})
