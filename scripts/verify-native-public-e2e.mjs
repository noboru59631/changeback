import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createPublicClient, http, parseEther, formatEther, erc20Abi, decodeEventLog,
  keccak256, hexToBytes, bytesToHex } from 'viem'
import { nativeMeetupAbi, nativeFactoryAbi } from '../src/lib/native-meetup-abi.ts'

const input = process.env.NATIVE_PUBLIC_OUTPUT || 'native-public-e2e.json'
const manifest = JSON.parse(await readFile(input, 'utf8'))
assert.match(manifest.status, /^SUCCESS: PUBLIC native/)
assert.equal(manifest.chainId, 5042002)
assert.equal(manifest.pending, null)
const client = createPublicClient({ transport: http('https://rpc.testnet.arc.io') })
assert.equal(await client.getChainId(), 5042002)
const block = await client.getBlock()
const blockNumber = block.number
const evidence = []
let totalFees = 0n
assert.equal(new Set(manifest.transactions.map(item => item.hash)).size, manifest.transactions.length)
for (const item of manifest.transactions) {
  const [receipt, transaction] = await Promise.all([
    client.getTransactionReceipt({ hash: item.hash }), client.getTransaction({ hash: item.hash }),
  ])
  assert.equal(receipt.status, 'success')
  assert.equal(receipt.transactionHash, item.hash)
  assert.equal(transaction.value, BigInt(item.value))
  const canonical = await client.getBlock({ blockNumber: receipt.blockNumber })
  assert.equal(canonical.hash, receipt.blockHash)
  assert.equal(transaction.blockHash, receipt.blockHash)
  const fee = receipt.gasUsed * receipt.effectiveGasPrice
  assert.ok(fee <= BigInt(item.gasLimit) * BigInt(item.gasPrice))
  totalFees += fee
  evidence.push({ action: item.action, transaction, receipt, fee })
}
assert.ok(totalFees <= parseEther('5'))
assert.equal(BigInt(manifest.principalCommitted), parseEther('30'))
assert.ok(BigInt(manifest.gasCommitted) <= parseEther('5'))
const factoryArtifact = JSON.parse(await readFile(new URL('../contracts/out/NativeMeetupFactory.sol/NativeMeetupFactoryTestnet.json', import.meta.url), 'utf8'))
const escrowArtifact = JSON.parse(await readFile(new URL('../contracts/out/NativeMeetupEscrow.sol/NativeMeetupEscrowTestnet.json', import.meta.url), 'utf8'))
const factoryCode = await client.getCode({ address: manifest.factory, blockNumber })
assert.equal(factoryCode.toLowerCase(), factoryArtifact.deployedBytecode.object.toLowerCase())
assert.equal(keccak256(factoryCode), manifest.factoryCodeHash)
assert.equal(await client.readContract({ address: manifest.factory, abi: nativeFactoryAbi,
  functionName: 'isEvent', args: [manifest.escrow], blockNumber }), true)
const runtime = await client.getCode({ address: manifest.escrow, blockNumber })
const observedBytes = hexToBytes(runtime)
const expectedBytes = hexToBytes(escrowArtifact.deployedBytecode.object)
assert.equal(observedBytes.length, expectedBytes.length)
for (const ranges of Object.values(escrowArtifact.deployedBytecode.immutableReferences)) {
  for (const range of ranges) {
    observedBytes.fill(0, range.start, range.start + range.length)
    expectedBytes.fill(0, range.start, range.start + range.length)
  }
}
assert.equal(bytesToHex(observedBytes), bytesToHex(expectedBytes))
const read = (functionName, args = []) => client.readContract({ address: manifest.escrow,
  abi: nativeMeetupAbi, functionName, args, blockNumber })
const organizer = await read('organizer')
const factoryCreation = evidence.find(item => item.action === 'create native event')
assert.equal(organizer.toLowerCase(), factoryCreation.transaction.from.toLowerCase())
assert.equal(await read('createdAtBlock'), factoryCreation.receipt.blockNumber)
assert.deepEqual(await read('terms'), [manifest.terms.metadataHash, parseEther('10'), 3n,
  BigInt(manifest.terms.collectUntil), BigInt(manifest.terms.spendUntil), false])
const sends = evidence.filter(item => item.action.startsWith('native send '))
assert.equal(sends.length, 3)
const participantStates = []
for (const send of sends) {
  assert.equal(send.transaction.input, '0x')
  assert.equal(send.transaction.value, parseEther('10'))
  assert.equal(send.transaction.to.toLowerCase(), manifest.escrow.toLowerCase())
  const paid = send.receipt.logs.filter(log => log.address.toLowerCase() === manifest.escrow.toLowerCase())
    .flatMap(log => {
      try { const decoded = decodeEventLog({ abi: nativeMeetupAbi, ...log }); return decoded.eventName === 'NativePaid' ? [decoded.args] : [] } catch { return [] }
    })
  assert.equal(paid.length, 1)
  assert.equal(paid[0].payer.toLowerCase(), send.transaction.from.toLowerCase())
  assert.equal(paid[0].amount, parseEther('10'))
  assert.equal(paid[0].cumulative, parseEther('10'))
  const systemLogs = send.receipt.logs.filter(log => log.address.toLowerCase() === '0xfffffffffffffffffffffffffffffffffffffffe')
    .flatMap(log => {
      try { const decoded = decodeEventLog({ abi: erc20Abi, ...log }); return decoded.eventName === 'Transfer' ? [decoded.args] : [] } catch { return [] }
    })
  const movement = systemLogs.filter(log => log.from.toLowerCase() === send.transaction.from.toLowerCase()
    && log.to.toLowerCase() === manifest.escrow.toLowerCase() && log.value === parseEther('10'))
  assert.equal(movement.length, 1)
  const member = await read('members', [send.transaction.from])
  assert.equal(member[1], parseEther('10'))
  assert.equal(member[3], 1n)
  assert.equal(member[5], true)
  const refund = evidence.find(item => item.action.toLowerCase() === `keeper refundfor ${send.transaction.from}`.toLowerCase())
  assert.ok(refund)
  const refundMovements = refund.receipt.logs.filter(log => log.address.toLowerCase() === '0xfffffffffffffffffffffffffffffffffffffffe')
    .flatMap(log => {
      try { const decoded = decodeEventLog({ abi: erc20Abi, ...log }); return decoded.eventName === 'Transfer' ? [decoded.args] : [] } catch { return [] }
    })
  assert.equal(refundMovements.filter(log => log.from.toLowerCase() === manifest.escrow.toLowerCase()
    && log.to.toLowerCase() === send.transaction.from.toLowerCase() && log.value === member[2]).length, 1)
  const nativeBalance = await client.getBalance({ address: send.transaction.from, blockNumber })
  const erc20Balance = await client.readContract({ address: '0x3600000000000000000000000000000000000000',
    abi: erc20Abi, functionName: 'balanceOf', args: [send.transaction.from], blockNumber })
  assert.equal(nativeBalance / 10n ** 12n, erc20Balance)
  assert.equal(nativeBalance, parseEther('20') - parseEther('10') - send.fee + member[2])
  participantStates.push({ payer: send.transaction.from, member, depositHash: send.transaction.hash,
    refundHash: refund.transaction.hash, nativeSystemMovementVerified: true,
    nativeBalance, erc20Balance, sharedBalanceTruncationVerified: true,
    erc20DepositMirrorLogs: send.receipt.logs.filter(log => log.address.toLowerCase() === '0x3600000000000000000000000000000000000000').length })
}
assert.equal(participantStates.reduce((sum, item) => sum + item.member[2], 0n), parseEther('16'))
const totals = await Promise.all(['totalCollected', 'totalSpent', 'totalRefunded', 'remainingLiability', 'unaccountedBalance'].map(name => read(name)))
assert.deepEqual(totals, ['30', '14', '16', '0', '0'].map(value => parseEther(value)))
assert.equal(await read('finalized'), true)
assert.equal(await client.getBalance({ address: manifest.escrow, blockNumber }), 0n)
assert.equal(await client.readContract({ address: '0x3600000000000000000000000000000000000000',
  abi: erc20Abi, functionName: 'balanceOf', args: [manifest.escrow], blockNumber }), 0n)
for (const [index, expected] of [[0n, parseEther('12')], [1n, parseEther('2')]]) {
  const budget = await read('budgets', [index])
  assert.equal(await read('budgetSpent', [index]), expected)
  assert.equal(await client.getBalance({ address: budget[0], blockNumber }), expected)
}
assert.equal((await client.getBlock({ blockNumber })).hash, block.hash)
const report = { scope: 'PUBLIC ARC TESTNET INDEPENDENT READBACK', observedAt: new Date().toISOString(),
  chainId: 5042002, blockNumber, blockHash: block.hash, factory: manifest.factory, escrow: manifest.escrow,
  factoryCodeHash: keccak256(factoryCode), escrowCodeHash: keccak256(runtime),
  runtimeMatchExcludingCheckedImmutables: true, totals, participantStates,
  totalFees, totalFeesTestUSDC: formatEther(totalFees), committedWorstCaseGas: manifest.gasCommitted,
  verifiedReceipts: evidence.length, evidence }
await writeFile(process.env.NATIVE_PUBLIC_RECEIPTS || 'native-public-receipts.json',
  JSON.stringify(report, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2))
console.log(JSON.stringify({ verifiedReceipts: evidence.length, scope: report.scope,
  collected: '30', spent: '14', refunded: '16', remainingLiability: '0', balance: '0',
  totalFeesTestUSDC: report.totalFeesTestUSDC, factory: manifest.factory, escrow: manifest.escrow }))
