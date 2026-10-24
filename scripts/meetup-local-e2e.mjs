import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, http, keccak256, stringToHex, erc20Abi, decodeEventLog } from 'viem'
import { meetupAbi, factoryAbi, USDC, ARC_TESTNET_ID } from '../src/lib/meetup-abi.ts'
import { runKeeper } from './meetup-keeper.mjs'
import { keeperMain } from './meetup-keeper.mjs'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const rpc = process.env.MEETUP_LOCAL_RPC || 'http://127.0.0.1:8547'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(rpc).hostname)) throw new Error('This fixture only runs on loopback Anvil')
const client = createPublicClient({ transport: http(rpc) })
assert.equal(await client.getChainId(), ARC_TESTNET_ID)
const wallet = createWalletClient({ transport: http(rpc) })
const [organizer, alice, bob, carol, venue, staff, keeper] = await wallet.getAddresses()
const json = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse)
const tokenArtifact = await json('../contracts/out/MeetupEscrow.t.sol/AuthorizationToken.json')
const factoryArtifact = await json('../contracts/out/MeetupFactory.sol/MeetupFactoryTestnet.json')
const transactions = []

async function confirm(hash, action) {
  const receipt = await client.waitForTransactionReceipt({ hash })
  assert.equal(receipt.status, 'success')
  transactions.push({ action, hash, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString() })
  return receipt
}

const tokenDeployment = await confirm(await wallet.deployContract({ account: organizer, chain: null,
  abi: tokenArtifact.abi, bytecode: tokenArtifact.bytecode.object }), 'deploy local mock token')
await client.request({ method: 'anvil_setCode', params: [USDC, await client.getCode({ address: tokenDeployment.contractAddress })] })
const venueBefore = await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [venue] })
const staffBefore = await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [staff] })
const factoryDeployment = await confirm(await wallet.deployContract({ account: organizer, chain: null,
  abi: factoryArtifact.abi, bytecode: factoryArtifact.bytecode.object }), 'deploy Testnet-only event factory locally')
const factory = factoryDeployment.contractAddress
const now = (await client.getBlock()).timestamp
const collection = now + 100n
const spending = now + 200n
const fee = 10_000_000n
const receipt = await confirm(await wallet.writeContract({ account: organizer, chain: null, address: factory,
  abi: factoryAbi, functionName: 'createEvent', args: [{ metadataHash: keccak256(stringToHex('Local meetup terms v1')),
    fee, capacity: 3n, collectUntil: collection, spendUntil: spending, showStaffAmounts: false }, [
    { recipient: venue, cap: 12_000_000n, category: 0, payAfter: collection, automatic: true },
    { recipient: staff, cap: 2_000_000n, category: 2, payAfter: 0n, automatic: false },
  ]] }), 'create event')
let escrow
for (const log of receipt.logs) {
  try {
    const decoded = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics })
    if (decoded.eventName === 'EventCreated') escrow = decoded.args.escrow
  } catch {}
}
assert.ok(escrow)
const read = (functionName, args = []) => client.readContract({ address: escrow, abi: meetupAbi, functionName, args })
const send = async (account, functionName, args = []) => confirm(await wallet.writeContract({ account, chain: null,
  address: escrow, abi: meetupAbi, functionName, args }), functionName)
const keyDirectory = await mkdtemp(join(tmpdir(), 'changeback-local-keeper-'))
const keyPath = join(keyDirectory, 'ephemeral-local-only.key')
const statePath = join(keyDirectory, 'state.json')
const localKey = generatePrivateKey()
const keeperAccount = privateKeyToAccount(localKey)
await writeFile(keyPath, localKey)
await client.request({ method: 'anvil_setBalance', params: [keeperAccount.address, '0x8ac7230489e80000'] })
Object.assign(process.env, { ARC_TESTNET_RPC: rpc, MEETUP_FACTORY: factory,
  MEETUP_FACTORY_CODEHASH: keccak256(await client.getCode({ address: factory })), MEETUP_ESCROW: escrow,
  MEETUP_KEEPER_KEY_FILE: keyPath, MEETUP_KEEPER_STATE: statePath, MEETUP_KEEPER_LOCK: join(keyDirectory, 'worker.lock') })
try {
process.argv.push('--execute-testnet')
for (const payer of [alice, bob, carol]) {
  await send(payer, 'register', [keccak256(stringToHex(payer)), payer])
  await confirm(await wallet.writeContract({ account: organizer, chain: null, address: USDC,
    abi: tokenArtifact.abi, functionName: 'mint', args: [payer, fee] }), 'mint local fixture USDC')
  await confirm(await wallet.writeContract({ account: payer, chain: null, address: USDC,
    abi: erc20Abi, functionName: 'approve', args: [escrow, fee] }), 'approve exact fee')
  await send(payer, 'pay', [fee])
}
assert.equal(await read('totalCollected'), 30_000_000n)
await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(collection)] })
await client.request({ method: 'evm_mine', params: [] })
const merchantPass = await keeperMain()
assert.equal(merchantPass.results[0].status, 'success')
assert.equal(await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [venue] }) - venueBefore, 12_000_000n)
assert.equal(await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [staff] }), staffBefore)
await send(organizer, 'spend', [1n, 2_000_000n, keccak256(stringToHex('Organizer confirmed staff work complete'))])
await confirm(await wallet.writeContract({ account: organizer, chain: null, address: USDC,
  abi: tokenArtifact.abi, functionName: 'setBlockedRecipient', args: [alice] }), 'simulate blocked refund recipient')
await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(spending)] })
await client.request({ method: 'evm_mine', params: [] })
const first = await keeperMain()
assert.equal(first.results.length, 4)
assert.equal(first.results.filter(job => job.status === 'retry').length, 1)
assert.equal(await read('remainingLiability'), 5_333_333n)
process.exitCode = 0
const recoveredDestination = (await wallet.getAddresses())[8]
const recoveryBefore = await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [recoveredDestination] })
await send(alice, 'setRefundDestination', [recoveredDestination])
const retryPass = await keeperMain()
assert.equal(retryPass.results.length, 1)
assert.equal(retryPass.results[0].status, 'success')
assert.equal(await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [recoveredDestination] }) - recoveryBefore, 5_333_333n)
await confirm(await wallet.writeContract({ account: organizer, chain: null, address: USDC,
  abi: tokenArtifact.abi, functionName: 'setBlockedRecipient', args: ['0x0000000000000000000000000000000000000000'] }), 'clear local mock recipient block')
const nonceBefore = await client.getTransactionCount({ address: keeperAccount.address })
await keeperMain()
assert.equal(await client.getTransactionCount({ address: keeperAccount.address }), nonceBefore)
const replay = await runKeeper({ client, escrow, send: (name, args) => send(keeper, name, args) })
assert.equal(replay.results.length, 0)
const collected = await read('totalCollected')
const spent = await read('totalSpent')
const refunded = await read('totalRefunded')
assert.equal(collected, spent + refunded)
assert.equal(refunded, 16_000_000n)
assert.equal(await read('remainingLiability'), 0n)
assert.equal(await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [escrow] }), 0n)
const report = { network: 'LOOPBACK ANVIL WITH MOCK USDC, NOT ARC TESTNET', chainId: ARC_TESTNET_ID,
  factory, factoryCodeHash: keccak256(await client.getCode({ address: factory })), escrow,
  collected, spent, refunded, remainingLiability: 0n, repeatedKeeperJobs: replay.results.length,
  keeper: keeperAccount.address, keeperPasses: [merchantPass, first, retryPass], transactions }
const text = JSON.stringify(report, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)
if (process.env.MEETUP_E2E_REPORT) await writeFile(process.env.MEETUP_E2E_REPORT, text)
console.log(text)
} finally {
  await Promise.allSettled([unlink(keyPath), unlink(statePath), unlink(`${statePath}.tmp`), unlink(join(keyDirectory, 'worker.lock'))])
  await rmdir(keyDirectory)
}
