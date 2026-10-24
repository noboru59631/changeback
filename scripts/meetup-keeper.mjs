import { pathToFileURL } from 'node:url'
import { readFile, writeFile, rename, open, unlink } from 'node:fs/promises'
import { createPublicClient, createWalletClient, http, keccak256, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { meetupAbi, factoryAbi, requireSafeNetwork } from '../src/lib/meetup-abi.ts'
import { nativeMeetupAbi } from '../src/lib/native-meetup-abi.ts'

export async function runKeeper({ client, escrow, send, maxJobs = 20, startIndex = 0, abi = meetupAbi, claimedIndex = 4 }) {
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 20) throw new Error('Job limit must be 1–20')
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) throw new Error('Invalid refund cursor')
  const read = (functionName, args = []) => client.readContract({ address: escrow, abi, functionName, args })
  const results = []
  let nextIndex = startIndex
  const submit = async (functionName, args) => {
    if (results.length >= maxJobs) return
    try {
      const submitted = await send(functionName, args)
      results.push({ functionName, args, status: submitted === false ? 'planned' : 'success',
        transactionHash: typeof submitted === 'string' ? submitted : undefined })
    } catch (error) {
      results.push({ functionName, args, status: 'retry', reason: error.shortMessage || error.message })
    }
  }
  let finalized = await read('finalized')
  const terms = await read('terms')
  const { timestamp } = await client.getBlock()
  if (!finalized && timestamp >= terms[3] && timestamp < terms[4]) {
    const count = Number(await read('budgetCount'))
    for (let budgetId = 0; budgetId < count && results.length < maxJobs; budgetId++) {
      const budget = await read('budgets', [BigInt(budgetId)])
      if (budget[4] && timestamp >= budget[3] && await read('budgetSpent', [BigInt(budgetId)]) === 0n) {
        await submit('executeScheduled', [BigInt(budgetId)])
      }
    }
  }
  if (!finalized && timestamp >= terms[4] && results.length < maxJobs) {
    await submit('finalize', [])
    finalized = await read('finalized')
  }
  if (finalized) {
    const count = Number(await read('participantCount'))
    for (let offset = 0; offset < count && results.length < maxJobs; offset++) {
      const memberId = (startIndex + offset) % count
      const payer = await read('participants', [BigInt(memberId)])
      const member = await read('members', [payer])
      if (!member[claimedIndex]) await submit('refundFor', [payer])
      nextIndex = (memberId + 1) % count
    }
  }
  return { results, nextIndex }
}

export async function keeperMain() {
  const lockFile = process.env.MEETUP_KEEPER_LOCK || '.meetup-keeper.lock'
  const lock = await open(lockFile, 'wx')
  try { return await keeperRun() } finally { await lock.close(); await unlink(lockFile) }
}

async function keeperRun() {
  const kind = process.env.MEETUP_KIND || 'erc20'
  if (!['erc20', 'native'].includes(kind)) throw new Error('Unknown event kind')
  const abi = kind === 'native' ? nativeMeetupAbi : meetupAbi
  const rpc = process.env.ARC_TESTNET_RPC || 'https://rpc.testnet.arc.io'
  const escrow = process.env.MEETUP_ESCROW
  const factory = process.env.MEETUP_FACTORY
  if (!isAddress(escrow || '') || !isAddress(factory || '')) throw new Error('Set event and factory addresses')
  const client = createPublicClient({ transport: http(rpc) })
  const chainId = await client.getChainId()
  requireSafeNetwork(chainId, rpc)
  if (!await client.readContract({ address: factory, abi: factoryAbi, functionName: 'isEvent', args: [escrow] })) {
    throw new Error('Event is not registered by the configured factory')
  }
  const code = await client.getCode({ address: factory })
  if (!code || keccak256(code).toLowerCase() !== process.env.MEETUP_FACTORY_CODEHASH?.toLowerCase()) {
    throw new Error('Factory bytecode does not match the reviewed deployment manifest')
  }
  const execute = process.argv.includes('--execute-testnet')
  const maxJobs = Number(process.env.MEETUP_MAX_JOBS || '20')
  const stateFile = process.env.MEETUP_KEEPER_STATE || `.meetup-keeper-${chainId}-${escrow.toLowerCase()}.json`
  let state = { nextIndex: 0, pending: null }
  try { state = JSON.parse(await readFile(stateFile, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const save = async () => {
    await writeFile(`${stateFile}.tmp`, JSON.stringify(state))
    await rename(`${stateFile}.tmp`, stateFile)
  }
  if (execute && state.pending) {
    await client.waitForTransactionReceipt({ hash: state.pending, timeout: 60_000 })
    state.pending = null
    await save()
  }
  let wallet
  if (execute) {
    if (!process.env.MEETUP_KEEPER_KEY_FILE) throw new Error('Set a dedicated Testnet keeper key file')
    const key = (await readFile(process.env.MEETUP_KEEPER_KEY_FILE, 'utf8')).trim()
    wallet = createWalletClient({ account: privateKeyToAccount(key), transport: http(rpc) })
    const balance = await client.getBalance({ address: wallet.account.address })
    const reserve = BigInt(process.env.MEETUP_MIN_GAS_BALANCE || '10000000000000000')
    if (reserve < 0n || balance < reserve) throw new Error('Keeper native USDC gas reserve is insufficient')
  }
  const send = async (functionName, args) => {
    if (!execute) {
      console.log(JSON.stringify({ planned: functionName, args }, (_, value) => typeof value === 'bigint' ? value.toString() : value))
      return false
    }
    const gasPrice = await client.getGasPrice()
    if (state.pending) throw new Error('A transaction is pending; wait for its receipt before retrying')
    const maxGasPrice = BigInt(process.env.MEETUP_MAX_GAS_PRICE || '100000000000')
    if (maxGasPrice <= 0n || gasPrice > maxGasPrice) throw new Error('Gas price exceeds operator limit')
    const { request } = await client.simulateContract({ account: wallet.account, address: escrow,
      abi, functionName, args, gasPrice })
    const gas = await client.estimateContractGas({ account: wallet.account, address: escrow,
      abi, functionName, args })
    const gasLimit = gas * 120n / 100n
    const maxGas = BigInt(process.env.MEETUP_MAX_GAS_PER_JOB || '10000000')
    if (gasLimit > maxGas || maxGas <= 0n) throw new Error('Job gas estimate exceeds operator limit')
    const balance = await client.getBalance({ address: wallet.account.address })
    const reserve = BigInt(process.env.MEETUP_MIN_GAS_BALANCE || '10000000000000000')
    if (balance < reserve + gasLimit * gasPrice) throw new Error('Insufficient gas reserve for this job')
    const hash = await wallet.writeContract({ ...request, gas: gasLimit, chain: null })
    state.pending = hash
    await save()
    console.log(JSON.stringify({ submitted: hash, functionName }))
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 })
    state.pending = null
    await save()
    if (receipt.status !== 'success') throw new Error(`Reverted: ${hash}`)
    console.log(JSON.stringify({ confirmed: hash, blockNumber: receipt.blockNumber.toString() }))
    return hash
  }
  const result = await runKeeper({ client, escrow, send, maxJobs, startIndex: state.nextIndex,
    abi, claimedIndex: kind === 'native' ? 5 : 4 })
  state.nextIndex = result.nextIndex
  if (execute) await save()
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(rpc).hostname)
  console.log(JSON.stringify({ mode: execute ? loopback ? 'loopback' : 'testnet' : 'dry-run', ...result }, (_, value) => typeof value === 'bigint' ? value.toString() : value))
  if (result.results.some(job => job.status === 'retry')) process.exitCode = 1
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  keeperMain().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
}
