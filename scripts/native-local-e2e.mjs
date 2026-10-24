import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, http, decodeEventLog, keccak256, stringToHex, parseEther } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { nativeMeetupAbi, nativeFactoryAbi } from '../src/lib/native-meetup-abi.ts'
import { keeperMain } from './meetup-keeper.mjs'

const rpc = process.env.NATIVE_LOCAL_RPC || 'http://127.0.0.1:8548'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(rpc).hostname)) throw new Error('Loopback only')
const client = createPublicClient({ transport: http(rpc) })
assert.equal(await client.getChainId(), 5042002)
assert.equal(await client.request({ method: 'web3_clientVersion' }).then(value => /anvil/i.test(value)), true)
const wallet = createWalletClient({ transport: http(rpc) })
const [organizer, alice, bob, carol, venue, staff] = await wallet.getAddresses()
const artifact = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse)
const factoryArtifact = await artifact('../contracts/out/NativeMeetupFactory.sol/NativeMeetupFactoryTestnet.json')
const receiverArtifact = await artifact('../contracts/out/NativeMeetupEscrow.t.sol/NativeRefundReceiver.json')
const transactions = []
const confirm = async (hash, action) => {
  const receipt = await client.waitForTransactionReceipt({ hash })
  assert.equal(receipt.status, 'success')
  transactions.push({ action, hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed })
  return receipt
}
const factoryDeployment = await confirm(await wallet.deployContract({ account: organizer, chain: null,
  abi: factoryArtifact.abi, bytecode: factoryArtifact.bytecode.object }), 'deploy native factory on local Anvil')
const factory = factoryDeployment.contractAddress
const temporary = await mkdtemp(join(tmpdir(), 'changeback-native-local-'))
const key = generatePrivateKey()
const keeper = privateKeyToAccount(key)
const keyPath = join(temporary, 'local-only.key')
await writeFile(keyPath, key)
await client.request({ method: 'anvil_setBalance', params: [keeper.address, '0x8ac7230489e80000'] })
const environmentBefore = { ...process.env }
Object.assign(process.env, { MEETUP_KIND: 'native', ARC_TESTNET_RPC: rpc, MEETUP_FACTORY: factory,
  MEETUP_FACTORY_CODEHASH: keccak256(await client.getCode({ address: factory })),
  MEETUP_KEEPER_KEY_FILE: keyPath, MEETUP_KEEPER_STATE: join(temporary, 'state.json'),
  MEETUP_KEEPER_LOCK: join(temporary, 'worker.lock') })
process.argv.push('--execute-testnet')

let escrow
const read = (functionName, args = []) => client.readContract({ address: escrow, abi: nativeMeetupAbi, functionName, args })
const send = (account, functionName, args = []) => wallet.writeContract({ account, chain: null,
  address: escrow, abi: nativeMeetupAbi, functionName, args }).then(hash => confirm(hash, functionName))
const advance = async timestamp => {
  await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] })
  await client.request({ method: 'evm_mine', params: [] })
}
async function createEvent() {
  const now = (await client.getBlock()).timestamp
  const collectUntil = now + 100n
  const spendUntil = now + 200n
  const receipt = await confirm(await wallet.writeContract({ account: organizer, chain: null,
    address: factory, abi: nativeFactoryAbi, functionName: 'createEvent', args: [{
      metadataHash: keccak256(stringToHex('Native local E2E terms')), fee: parseEther('10'), capacity: 4n,
      collectUntil, spendUntil, showStaffAmounts: false,
    }, [
      { recipient: venue, cap: parseEther('12'), category: 0, payAfter: collectUntil, automatic: true },
      { recipient: staff, cap: parseEther('2'), category: 2, payAfter: 0n, automatic: false },
    ]] }), 'create native event')
  const created = receipt.logs.map(log => {
    try { return decodeEventLog({ abi: nativeFactoryAbi, ...log }) } catch { return null }
  }).find(log => log?.eventName === 'EventCreated')
  assert.ok(created)
  escrow = created.args.escrow
  process.env.MEETUP_ESCROW = escrow
  return { escrow, collectUntil, spendUntil }
}
const register = (payer, deadline) => send(organizer, 'approveApplicant', [payer, keccak256(stringToHex(payer)), deadline])
const collect = (payer, value) => wallet.sendTransaction({ account: payer, chain: null, to: escrow,
  value: parseEther(value), data: '0x' }).then(hash => confirm(hash, 'one ordinary native USDC send'))
const keeperPass = async () => {
  const result = await keeperMain()
  for (const job of result.results) if (job.transactionHash) {
    const receipt = await client.getTransactionReceipt({ hash: job.transactionHash })
    transactions.push({ action: `keeper ${job.functionName}`, hash: job.transactionHash,
      blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed })
  }
  return result
}

try {
  const main = await createEvent()
  for (const payer of [alice, bob, carol]) {
    await register(payer, main.collectUntil)
    await collect(payer, '10')
  }
  assert.equal(await read('totalCollected'), parseEther('30'))
  const venueBefore = await client.getBalance({ address: venue })
  const staffBefore = await client.getBalance({ address: staff })
  await advance(main.collectUntil)
  assert.equal((await keeperPass()).results[0].status, 'success')
  await send(organizer, 'spend', [1n, parseEther('2'), keccak256(stringToHex('Staff work approved'))])
  await send(organizer, 'finalize')
  const beforeRefunds = await Promise.all([alice, bob, carol].map(address => client.getBalance({ address })))
  assert.equal((await keeperPass()).results.length, 3)
  const afterRefunds = await Promise.all([alice, bob, carol].map(address => client.getBalance({ address })))
  assert.equal(afterRefunds.reduce((sum, balance, index) => sum + balance - beforeRefunds[index], 0n), parseEther('16'))
  assert.equal(await client.getBalance({ address: venue }) - venueBefore, parseEther('12'))
  assert.equal(await client.getBalance({ address: staff }) - staffBefore, parseEther('2'))
  assert.equal(await read('remainingLiability'), 0n)
  assert.equal(await client.getBalance({ address: escrow }), 0n)
  const nonce = await client.getTransactionCount({ address: keeper.address })
  assert.equal((await keeperPass()).results.length, 0)
  assert.equal(await client.getTransactionCount({ address: keeper.address }), nonce)

  const edge = await createEvent()
  const receiverReceipt = await confirm(await wallet.deployContract({ account: organizer, chain: null,
    abi: receiverArtifact.abi, bytecode: receiverArtifact.bytecode.object }), 'deploy local rejecting wallet fixture')
  const receiver = receiverReceipt.contractAddress
  await register(receiver, edge.collectUntil)
  await register(alice, edge.collectUntil)
  await register(bob, edge.collectUntil)
  await collect(alice, '13')
  await collect(bob, '4')
  await confirm(await wallet.writeContract({ account: organizer, chain: null, address: receiver,
    abi: receiverArtifact.abi, functionName: 'pay', args: [escrow], value: parseEther('10') }), 'smart wallet ordinary native send')
  await advance(edge.spendUntil)
  const failedPass = await keeperPass()
  assert.equal(failedPass.results.filter(job => job.status === 'retry').length, 1)
  assert.equal(await read('remainingLiability'), parseEther('10'))
  await confirm(await wallet.writeContract({ account: organizer, chain: null, address: receiver,
    abi: receiverArtifact.abi, functionName: 'unblock' }), 'restore same smart wallet receive capability')
  process.exitCode = 0
  assert.equal((await keeperPass()).results.filter(job => job.status === 'success').length, 1)
  assert.equal(await read('totalRefunded'), parseEther('27'))
  assert.equal(await read('remainingLiability'), 0n)
  assert.equal(await client.getBalance({ address: escrow }), 0n)
  const finalNonce = await client.getTransactionCount({ address: keeper.address })
  assert.equal((await keeperPass()).results.length, 0)
  assert.equal(await client.getTransactionCount({ address: keeper.address }), finalNonce)
  const result = { scope: 'LOCAL ANVIL ONLY; native units simulate USDC; not public Arc evidence',
    chainId: 5042002, factory, main, edge, collected: '30', venue: '12', staff: '2', refunded: '16',
    edgeCollectedAndRefunded: '27', zeroLiability: true, idempotent: true, transactions }
  await writeFile(process.env.NATIVE_E2E_OUTPUT || 'native-local-e2e.json', JSON.stringify(result,
    (_, value) => typeof value === 'bigint' ? value.toString() : value, 2))
  console.log('PASS: native 30 = 12 venue + 2 staff + 16 refunds; edge 27 refunded; same-sender retry; idempotent keeper')
} finally {
  process.argv.pop()
  for (const name of Object.keys(process.env)) if (!(name in environmentBefore)) delete process.env[name]
  Object.assign(process.env, environmentBefore)
  await rm(temporary, { recursive: true, force: true })
}
