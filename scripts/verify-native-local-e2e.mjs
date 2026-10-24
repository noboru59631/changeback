import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createPublicClient, http, parseEther, decodeEventLog } from 'viem'
import { nativeMeetupAbi } from '../src/lib/native-meetup-abi.ts'

const rpc = process.env.NATIVE_LOCAL_RPC || 'http://127.0.0.1:8548'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(rpc).hostname)) throw new Error('Loopback only')
const client = createPublicClient({ transport: http(rpc) })
assert.equal(await client.getChainId(), 5042002)
const input = process.env.NATIVE_E2E_OUTPUT || 'native-local-e2e.json'
const result = JSON.parse(await readFile(input, 'utf8'))
assert.match(result.scope, /LOCAL ANVIL ONLY/)
assert.equal(new Set(result.transactions.map(item => item.hash)).size, result.transactions.length)
const evidence = []
for (const transaction of result.transactions) {
  const [receipt, original] = await Promise.all([
    client.getTransactionReceipt({ hash: transaction.hash }), client.getTransaction({ hash: transaction.hash }),
  ])
  assert.equal(receipt.status, 'success')
  assert.equal(receipt.blockNumber.toString(), transaction.blockNumber)
  assert.equal((await client.getBlock({ blockNumber: receipt.blockNumber })).hash, receipt.blockHash)
  evidence.push({ action: transaction.action, transaction: original, receipt })
}
const states = []
for (const [event, expected] of [[result.main, ['30', '14', '16']], [result.edge, ['27', '0', '27']]]) {
  const read = functionName => client.readContract({ address: event.escrow, abi: nativeMeetupAbi, functionName })
  const values = await Promise.all(['totalCollected', 'totalSpent', 'totalRefunded', 'remainingLiability', 'unaccountedBalance'].map(read))
  assert.deepEqual(values, [...expected.map(amount => parseEther(amount)), 0n, 0n])
  assert.equal(await client.getBalance({ address: event.escrow }), 0n)
  assert.equal(await read('finalized'), true)
  states.push({ escrow: event.escrow, collected: values[0], spent: values[1], refunded: values[2], liability: values[3], balance: 0n })
}
const ordinarySends = evidence.filter(item => item.action === 'one ordinary native USDC send')
assert.equal(ordinarySends.length, 5)
assert.ok(ordinarySends.every(item => item.transaction.input === '0x'))
const mainSends = ordinarySends.filter(item => item.transaction.to.toLowerCase() === result.main.escrow.toLowerCase())
assert.equal(mainSends.length, 3)
for (const send of mainSends) {
  assert.equal(send.transaction.value, parseEther('10'))
  const paid = send.receipt.logs.filter(log => log.address.toLowerCase() === result.main.escrow.toLowerCase()).map(log => {
    try { return decodeEventLog({ abi: nativeMeetupAbi, ...log }) } catch { return null }
  }).find(log => log?.eventName === 'NativePaid')
  assert.ok(paid)
  assert.equal(paid.args.payer.toLowerCase(), send.transaction.from.toLowerCase())
  assert.equal(paid.args.amount, send.transaction.value)
}
const output = { scope: result.scope, independentlyReRead: true, transactionCount: evidence.length,
  nativeValueOnlyMainPayments: true, states, evidence }
await writeFile(process.env.NATIVE_RECEIPTS_OUTPUT || 'native-local-receipts.json', JSON.stringify(output,
  (_, value) => typeof value === 'bigint' ? value.toString() : value, 2))
console.log(`PASS: ${evidence.length} local receipts re-read; native send input/value/sender/event verified; both escrows solvent and fully refunded`)
