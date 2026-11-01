import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeFunctionData, getAbiItem, toFunctionSelector } from 'viem'
import { v4FactoryAbi } from './v4-abi.ts'

test('v4 createEvent ABI matches the deployed five-field Expense tuple', () => {
  const item = getAbiItem({ abi: v4FactoryAbi, name: 'createEvent' })
  assert.equal(toFunctionSelector(item), '0x9d9df41f')
  const data = encodeFunctionData({
    abi: v4FactoryAbi,
    functionName: 'createEvent',
    args: [
      `0x${'11'.repeat(32)}`,
      10n,
      2n,
      60n,
      120n,
      300n,
      [{
        recipient: '0x0000000000000000000000000000000000000001',
        cap: 6n,
        approvedAmount: 0n,
        paidAmount: 0n,
        receiptHash: `0x${'00'.repeat(32)}`,
      }],
    ],
  })
  assert.equal(data.slice(0, 10), '0x9d9df41f')
})

