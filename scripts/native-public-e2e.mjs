import assert from 'node:assert/strict'
import { readFile, writeFile, rename, open, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { createPublicClient, createWalletClient, defineChain, http, parseEther, encodeFunctionData,
  decodeEventLog, keccak256, stringToHex, erc20Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { nativeMeetupAbi, nativeFactoryAbi } from '../src/lib/native-meetup-abi.ts'
import { runKeeper } from './meetup-keeper.mjs'

const rpc = 'https://rpc.testnet.arc.io'
const chain = defineChain({ id: 5042002, name: 'Arc Testnet', nativeCurrency: {
  name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } })
const client = createPublicClient({ chain, transport: http(rpc, { timeout: 15_000 }) })
assert.equal(await client.getChainId(), chain.id)
const directory = resolve(process.env.NATIVE_TESTNET_KEYS || '../testnet-keys')
const addresses = JSON.parse(await readFile(join(directory, 'addresses.json'), 'utf8'))
const statePath = join(directory, 'public-e2e-state.json')
let state = { chainId: chain.id, gasCommitted: '0', principalCommitted: '0', transactions: [] }
try { state = JSON.parse(await readFile(statePath, 'utf8')) } catch (error) {
  if (error.code !== 'ENOENT') throw error
}
const roles = ['organizer', 'alice', 'bob', 'carol', 'venue', 'staff']
const balances = Object.fromEntries(await Promise.all(roles.map(async role => [role,
  (await client.getBalance({ address: addresses[role] })).toString()])))
console.log(JSON.stringify({ scope: 'PUBLIC ARC TESTNET', addresses, balances,
  writesEnabled: process.argv.includes('--execute-approved-testnet') }))
if (!process.argv.includes('--execute-approved-testnet')) process.exit(0)
assert.equal(process.env.NATIVE_APPROVED_PRINCIPAL, '30', 'Requires explicit 30 test-USDC approval')
assert.equal(process.env.NATIVE_APPROVED_GAS, '5', 'Requires explicit 5 test-USDC gas ceiling')
assert.ok(BigInt(balances.organizer) >= parseEther('0.5'), 'Organizer testnet gas funding required')
for (const role of ['alice', 'bob', 'carol']) {
  if (!state.transactions.some(transaction => transaction.action === `native send ${role}`)) {
    assert.ok(BigInt(balances[role]) >= parseEther('10.05'), `${role}: 10 principal plus gas reserve required`)
  }
}
const accounts = {}
for (const role of ['organizer', 'alice', 'bob', 'carol']) {
  const key = (await readFile(join(directory, `${role}.key`), 'utf8')).trim()
  accounts[role] = privateKeyToAccount(key)
  assert.equal(accounts[role].address.toLowerCase(), addresses[role].toLowerCase())
}
const lockPath = join(directory, 'public-e2e.lock')
const lock = await open(lockPath, 'wx')
const serialize = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2)
const save = async () => {
  await writeFile(`${statePath}.tmp`, serialize(state))
  await rename(`${statePath}.tmp`, statePath)
}
try {
  try { state = JSON.parse(await readFile(statePath, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  assert.equal(state.chainId, chain.id)
  const submit = async (action, role, { to, data = '0x', value = 0n }) => {
    const existing = state.transactions.find(transaction => transaction.action === action)
    if (existing) {
      const receipt = await client.waitForTransactionReceipt({ hash: existing.hash, timeout: 60_000 })
      assert.equal(receipt.status, 'success', `Prior action failed: ${action}`)
      if (state.pending?.hash === existing.hash) {
        state.pending = null
        await save()
      }
      return receipt
    }
    assert.ok(!state.pending, 'Unresolved prior submission; inspect receipt before recovery')
    const account = accounts[role]
    const gasPrice = await client.getGasPrice()
    assert.ok(gasPrice <= 100_000_000_000n, 'Gas price above approved execution guard')
    const gasEstimate = await client.estimateGas({ account, to, data, value })
    const gas = (gasEstimate * 120n + 99n) / 100n
    assert.ok(gas <= 10_000_000n, 'Gas limit exceeded')
    const nextGas = BigInt(state.gasCommitted) + gas * gasPrice
    const nextPrincipal = BigInt(state.principalCommitted) + value
    assert.ok(nextGas <= parseEther('5'), 'Cumulative approved gas ceiling exceeded')
    assert.ok(nextPrincipal <= parseEther('30'), 'Cumulative approved participant principal exceeded')
    const balance = await client.getBalance({ address: account.address })
    assert.ok(balance >= value + gas * gasPrice, 'Insufficient testnet balance')
    const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' })
    const wallet = createWalletClient({ account, chain, transport: http(rpc) })
    const signed = await wallet.signTransaction({ to, data, value, gas, gasPrice, nonce, type: 'legacy' })
    const hash = keccak256(signed)
    state.gasCommitted = String(nextGas)
    state.principalCommitted = String(nextPrincipal)
    state.pending = { action, hash, role, nonce, to, value: String(value) }
    state.transactions.push({ action, hash, role, nonce, to, value: String(value), gasLimit: String(gas), gasPrice: String(gasPrice) })
    await save()
    assert.equal(await client.sendRawTransaction({ serializedTransaction: signed }), hash)
    console.log(serialize({ submitted: action, hash }))
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 })
    assert.equal(receipt.status, 'success', `Failed: ${action}`)
    state.pending = null
    await save()
    return receipt
  }
  const factoryArtifact = JSON.parse(await readFile(new URL('../contracts/out/NativeMeetupFactory.sol/NativeMeetupFactoryTestnet.json', import.meta.url), 'utf8'))
  const deployment = await submit('deploy native factory', 'organizer', { data: factoryArtifact.bytecode.object })
  const factory = deployment.contractAddress
  assert.ok(factory)
  const factoryCode = await client.getCode({ address: factory })
  assert.equal(factoryCode.toLowerCase(), factoryArtifact.deployedBytecode.object.toLowerCase())
  state.factory = factory
  state.factoryCodeHash = keccak256(factoryCode)
  if (!state.terms) {
    const now = (await client.getBlock()).timestamp
    state.terms = { metadataHash: keccak256(stringToHex('ChangeBack approved native public Testnet rehearsal')),
      fee: String(parseEther('10')), capacity: '3', collectUntil: String(now + 180n),
      spendUntil: String(now + 600n), showStaffAmounts: false }
    await save()
  }
  const terms = { ...state.terms, fee: BigInt(state.terms.fee), capacity: 3n,
    collectUntil: BigInt(state.terms.collectUntil), spendUntil: BigInt(state.terms.spendUntil) }
  const budgets = [
    { recipient: addresses.venue, cap: parseEther('12'), category: 0, payAfter: terms.collectUntil, automatic: true },
    { recipient: addresses.staff, cap: parseEther('2'), category: 2, payAfter: 0n, automatic: false },
  ]
  const createdReceipt = await submit('create native event', 'organizer', { to: factory,
    data: encodeFunctionData({ abi: nativeFactoryAbi, functionName: 'createEvent', args: [terms, budgets] }) })
  const created = createdReceipt.logs.filter(log => log.address.toLowerCase() === factory.toLowerCase()).flatMap(log => {
    try { const decoded = decodeEventLog({ abi: nativeFactoryAbi, ...log }); return decoded.eventName === 'EventCreated' ? [decoded] : [] } catch { return [] }
  })
  assert.equal(created.length, 1)
  const escrow = created[0].args.escrow
  state.escrow = escrow
  assert.equal(await client.readContract({ address: factory, abi: nativeFactoryAbi, functionName: 'isEvent', args: [escrow] }), true)
  assert.equal(await client.readContract({ address: escrow, abi: nativeMeetupAbi, functionName: 'organizer' }), addresses.organizer)
  assert.deepEqual(await client.readContract({ address: escrow, abi: nativeMeetupAbi, functionName: 'terms' }),
    [terms.metadataHash, terms.fee, terms.capacity, terms.collectUntil, terms.spendUntil, false])
  for (const [index, budget] of budgets.entries()) {
    assert.deepEqual(await client.readContract({ address: escrow, abi: nativeMeetupAbi,
      functionName: 'budgets', args: [BigInt(index)] }),
    [budget.recipient, budget.cap, budget.category, budget.payAfter, budget.automatic])
  }
  await save()
  const call = (functionName, args = []) => ({ to: escrow,
    data: encodeFunctionData({ abi: nativeMeetupAbi, functionName, args }) })
  for (const role of ['alice', 'bob', 'carol']) {
    await submit(`approve ${role}`, 'organizer', call('approveApplicant', [addresses[role],
      keccak256(stringToHex(`synthetic-test-person-${role}`)), terms.collectUntil]))
    await submit(`native send ${role}`, role, { to: escrow, value: parseEther('10'), data: '0x' })
  }
  const read = functionName => client.readContract({ address: escrow, abi: nativeMeetupAbi, functionName })
  assert.equal(await read('totalCollected'), parseEther('30'))
  console.log(serialize({ stage: 'collected', escrow, collectUntil: terms.collectUntil }))
  while ((await client.getBlock()).timestamp < terms.collectUntil) await pause(15_000)
  const scheduledPass = await runKeeper({ client, escrow, abi: nativeMeetupAbi, claimedIndex: 5,
    send: async (functionName, args) => (await submit(`keeper ${functionName} ${args.join(',')}`,
      'organizer', call(functionName, args))).transactionHash })
  assert.ok(scheduledPass.results.every(job => job.status === 'success'))
  await submit('staff payment', 'organizer', call('spend', [1n, parseEther('2'), keccak256(stringToHex('Approved test staff task'))]))
  await submit('organizer finalize', 'organizer', call('finalize'))
  const refundPass = () => runKeeper({ client, escrow, abi: nativeMeetupAbi, claimedIndex: 5,
    send: async (functionName, args) => (await submit(`keeper ${functionName} ${args.join(',')}`,
      'organizer', call(functionName, args))).transactionHash })
  await refundPass()
  const nonceBefore = await client.getTransactionCount({ address: addresses.organizer })
  assert.equal((await refundPass()).results.length, 0)
  assert.equal(await client.getTransactionCount({ address: addresses.organizer }), nonceBefore)
  assert.equal(await read('totalSpent'), parseEther('14'))
  assert.equal(await read('totalRefunded'), parseEther('16'))
  assert.equal(await read('remainingLiability'), 0n)
  assert.equal(await client.getBalance({ address: escrow }), 0n)
  assert.equal(await client.readContract({ address: '0x3600000000000000000000000000000000000000',
    abi: erc20Abi, functionName: 'balanceOf', args: [escrow] }), 0n)
  state.status = 'SUCCESS: PUBLIC native 30 = venue 12 + staff 2 + refunds 16; zero balance/liability'
  await save()
  await writeFile(process.env.NATIVE_PUBLIC_OUTPUT || 'native-public-e2e.json', serialize(state))
  console.log(state.status)
} finally {
  await lock.close()
  await unlink(lockPath)
}
