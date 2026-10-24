import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createPublicClient, http, erc20Abi, decodeEventLog, keccak256, formatEther } from 'viem'
import { meetupAbi, USDC } from '../src/lib/meetup-abi.ts'

const rpc = process.env.ARC_TESTNET_RPC || 'https://rpc.testnet.arc.io'
const client = createPublicClient({ transport: http(rpc, { timeout: 15_000, retryCount: 1 }) })
assert.equal(await client.getChainId(), 5042002, 'Public Arc Testnet only')
assert.equal(new URL(rpc).hostname, 'rpc.testnet.arc.io', 'Official public RPC only')
const previous = JSON.parse(await readFile(process.env.PREVIOUS_TESTNET_TRANSACTIONS, 'utf8'))
assert.equal(previous.length, 16, 'Expected prior approve/pay E2E evidence')
const escrow = '0x1E06FC86AFde4443F025b010e15b8Eec04b41eBB'
const block = await client.getBlock()
const blockNumber = block.number
const receipts = []
for (const item of previous) {
  const receipt = await client.getTransactionReceipt({ hash: item.hash })
  const transaction = await client.getTransaction({ hash: item.hash })
  const canonical = await client.getBlock({ blockNumber: receipt.blockNumber })
  assert.equal(receipt.status, 'success')
  assert.equal(receipt.blockNumber, BigInt(item.block))
  assert.equal(receipt.blockHash, canonical.hash)
  assert.equal(transaction.blockHash, canonical.hash)
  receipts.push({ action: item.action, transaction, receipt })
}
const read = functionName => client.readContract({ address: escrow, abi: meetupAbi, functionName, blockNumber })
const [collected, spent, refunded, liability, finalized, nativeBalance, tokenBalance, decimals, gasPrice, code] = await Promise.all([
  read('totalCollected'), read('totalSpent'), read('totalRefunded'), read('remainingLiability'), read('finalized'),
  client.getBalance({ address: escrow, blockNumber }),
  client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [escrow], blockNumber }),
  client.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals', blockNumber }),
  client.getGasPrice(), client.getCode({ address: escrow, blockNumber }),
])
assert.equal(collected, 30_000_000n)
assert.equal(spent, 14_000_000n)
assert.equal(refunded, 16_000_000n)
assert.equal(liability, 0n)
assert.equal(finalized, true)
assert.equal(nativeBalance, 0n)
assert.equal(tokenBalance, 0n)
assert.equal(decimals, 6)
const organizer = receipts[0].transaction.from
const organizerNative = await client.getBalance({ address: organizer, blockNumber })
const organizerErc20 = await client.readContract({ address: USDC, abi: erc20Abi,
  functionName: 'balanceOf', args: [organizer], blockNumber })
assert.equal(organizerNative / 10n ** 12n, organizerErc20)
const transfers = receipts.flatMap(({ action, receipt }) => receipt.logs.flatMap(log => {
  if (![USDC.toLowerCase(), '0xfffffffffffffffffffffffffffffffffffffffe'].includes(log.address.toLowerCase())) return []
  try {
    const decoded = decodeEventLog({ abi: erc20Abi, ...log })
    if (decoded.eventName !== 'Transfer') return []
    return [{ action, transactionHash: receipt.transactionHash, emitter: log.address,
      decimals: log.address.toLowerCase() === USDC.toLowerCase() ? 6 : 18, ...decoded.args }]
  } catch { return [] }
}))
const factoryArtifact = JSON.parse(await readFile(new URL('../contracts/out/NativeMeetupFactory.sol/NativeMeetupFactoryTestnet.json', import.meta.url), 'utf8'))
let deploymentEstimate
try {
  const gas = await client.estimateGas({ account: organizer, data: factoryArtifact.bytecode.object })
  deploymentEstimate = { gas, bufferedGas: (gas * 120n + 99n) / 100n,
    feeAtCurrentPriceUSDC: formatEther(gas * gasPrice),
    note: 'Estimate only; no transaction or signature. Re-estimate and obtain approval before broadcast.' }
} catch (error) {
  deploymentEstimate = { unavailable: error.shortMessage || error.message }
}
assert.equal((await client.getBlock({ blockNumber })).hash, block.hash)
const report = { observedAt: new Date().toISOString(), scope: 'PUBLIC ARC TESTNET READ ONLY', rpc,
  chainId: 5042002, blockNumber, blockHash: block.hash,
  previousE2E: { kind: 'ERC20 register + approve + pay; NOT native single-send', escrow,
    runtimeCodeHash: keccak256(code), collected, spent, refunded, liability, finalized, nativeBalance, tokenBalance,
    successfulReceipts: receipts.length },
  sharedBalanceObservation: { address: organizer, native18: organizerNative, erc20_6: organizerErc20,
    matchesTruncatedNative: true },
  priorTransferObservations: transfers,
  nativeCandidate: { deployed: false, publicE2ERun: false, newTransactionHashes: [], deploymentEstimate,
    initCodeHash: keccak256(factoryArtifact.bytecode.object), gasPrice,
    gasBudgetProposal: 'At most 5 testnet USDC gas, at most 30 testnet USDC participant principal; approval required',
    unverified: ['receive callback on public Arc', 'native refunds', 'wallet native send', 'blocklist',
      'native sub-micro dust', 'runtime deployment review', 'crash-in-flight keeper recovery'] },
  receipts }
const output = JSON.stringify(report, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)
await writeFile(process.env.NATIVE_READONLY_OUTPUT || 'native-testnet-readonly.json', output)
console.log(JSON.stringify({ scope: report.scope, blockNumber: String(blockNumber),
  priorReceiptsVerified: receipts.length, previousE2E: '30 / 14 / 16, zero balance and liability; ERC20 approve/pay',
  sharedBalanceMatches: true, gasPrice: String(gasPrice), deploymentEstimate,
  nativePublicE2E: 'NOT RUN; funds not approved; no signatures or transactions' },
  (_, value) => typeof value === 'bigint' ? value.toString() : value, 2))
