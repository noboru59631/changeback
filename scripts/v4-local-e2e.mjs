import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createPublicClient, createWalletClient, decodeEventLog, http, keccak256, parseEther, stringToHex } from 'viem'
import { runKeeper } from './meetup-keeper.mjs'
import { v4Abi, v4FactoryAbi } from '../src/lib/v4-abi.ts'

const rpc = process.env.V4_LOCAL_RPC || 'http://127.0.0.1:8554'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(rpc).hostname)) throw new Error('Loopback only')
const client = createPublicClient({ transport: http(rpc) })
assert.equal(await client.getChainId(), 5042002)
assert.match(await client.request({ method: 'web3_clientVersion' }), /anvil/i)

const wallet = createWalletClient({ transport: http(rpc) })
const [organizer, alice, bob, venue, keeper] = await wallet.getAddresses()
const artifact = JSON.parse(await readFile(new URL('../contracts/out/NativeMeetupExpenseSettlementV4Factory.sol/NativeMeetupExpenseSettlementV4FactoryTestnet5042002.json', import.meta.url), 'utf8'))
const confirmed = async hash => {
  const receipt = await client.waitForTransactionReceipt({ hash })
  assert.equal(receipt.status, 'success')
  return receipt
}
const deployed = await confirmed(await wallet.deployContract({
  account: organizer, chain: null, abi: artifact.abi, bytecode: artifact.bytecode.object,
}))
const factory = deployed.contractAddress
const zeroHash = `0x${'00'.repeat(32)}`
const createdReceipt = await confirmed(await wallet.writeContract({
  account: organizer, chain: null, address: factory, abi: v4FactoryAbi, functionName: 'createEvent',
  args: [keccak256(stringToHex('ChangeBack v4 local E2E')), parseEther('0.01'), 2n, 60n, 120n, 30n * 86400n, [
    { recipient: venue, cap: parseEther('0.006'), approvedAmount: 0n, paidAmount: 0n, receiptHash: zeroHash },
  ]],
}))
const created = createdReceipt.logs.map(log => {
  try { return decodeEventLog({ abi: v4FactoryAbi, ...log }) } catch { return null }
}).find(log => log?.eventName === 'EventCreated')
assert.ok(created)
const escrow = created.args.eventAddress
assert.equal(await client.readContract({ address: factory, abi: v4FactoryAbi, functionName: 'isEvent', args: [escrow] }), true)

const write = async (account, functionName, args = []) => confirmed(await wallet.writeContract({
  account, chain: null, address: escrow, abi: v4Abi, functionName, args,
}))
await confirmed(await wallet.writeContract({ account: alice, chain: null, address: escrow, abi: v4Abi,
  functionName: 'join', args: [keccak256(stringToHex('alice'))], value: parseEther('0.01') }))
await confirmed(await wallet.writeContract({ account: bob, chain: null, address: escrow, abi: v4Abi,
  functionName: 'join', args: [keccak256(stringToHex('bob'))], value: parseEther('0.01') }))
await write(organizer, 'approveExpense', [0n, parseEther('0.006'), keccak256(stringToHex('venue receipt'))])

const collectUntil = await client.readContract({ address: escrow, abi: v4Abi, functionName: 'collectUntil' })
const expenseUntil = await client.readContract({ address: escrow, abi: v4Abi, functionName: 'expenseUntil' })
const advance = async timestamp => {
  await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] })
  await client.request({ method: 'evm_mine', params: [] })
}
const send = async (functionName, args, blockNumber) => {
  const simulation = await client.simulateContract({
    account: keeper, address: escrow, abi: v4Abi, functionName, args, blockNumber,
  })
  const receipt = await confirmed(await wallet.writeContract({ ...simulation.request, account: keeper, chain: null }))
  return receipt.transactionHash
}
const keeperPass = () => runKeeper({ client, escrow, send, abi: v4Abi, contractVersion: 4, claimedIndex: 3 })

const venueBefore = await client.getBalance({ address: venue })
await advance(collectUntil)
assert.deepEqual((await keeperPass()).results.map(job => job.functionName), ['payApprovedExpense'])
assert.equal(await client.getBalance({ address: venue }) - venueBefore, parseEther('0.006'))

await advance(expenseUntil)
assert.deepEqual((await keeperPass()).results.map(job => job.functionName), ['finalize'])
const refundsBefore = await Promise.all([alice, bob].map(address => client.getBalance({ address })))
assert.deepEqual((await keeperPass()).results.map(job => job.functionName), ['claimRefund', 'claimRefund'])
const refundsAfter = await Promise.all([alice, bob].map(address => client.getBalance({ address })))
assert.deepEqual(refundsAfter.map((balance, index) => balance - refundsBefore[index]), [parseEther('0.007'), parseEther('0.007')])
assert.equal(await client.readContract({ address: escrow, abi: v4Abi, functionName: 'remainingLiability' }), 0n)
assert.equal(await client.getBalance({ address: escrow }), 0n)
assert.equal((await keeperPass()).results.length, 0)

console.log('PASS: v4 local E2E 0.020 = 0.006 expense + 0.007 + 0.007 refunds; keeper idempotent; escrow 0')

