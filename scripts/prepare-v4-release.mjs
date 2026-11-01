import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createPublicClient, encodeDeployData, encodeFunctionData, formatEther, getAddress, getContractAddress,
  http, keccak256, parseEther, stringToHex,
} from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { v4Abi, v4FactoryAbi } from '../src/lib/v4-abi.ts'

const root = resolve(import.meta.dirname, '..')
const outputDir = resolve(process.argv[2] || resolve(root, 'docs'))
const testnetFactory = getAddress('0xe8DF3Ac08B2564CE5e4a902E1C96524EdE5A209F')
const testnetDeploymentTx = '0x0e061240383d96dd57ca7df1d464dce0445591356559764a72e2b0f3ca87684c'
const organizer = getAddress(process.env.V4_ORGANIZER || '0x03607de69C487BcC460eaD7C4Bdfd25805658b75')
const expenseRecipient = getAddress(process.env.V4_EXPENSE_RECIPIENT || '0x89A4EF745831CFe8957391Ad2e3CF55Dc3a6e502')

const paths = {
  testnet: resolve(root, 'contracts/out/NativeMeetupExpenseSettlementV4Factory.sol/NativeMeetupExpenseSettlementV4FactoryTestnet5042002.json'),
  mainnet: resolve(root, 'contracts/out/NativeMeetupExpenseSettlementV4FactoryMainnet.sol/NativeMeetupExpenseSettlementV4FactoryMainnet5042.json'),
}
const [testnetRaw, mainnetRaw] = await Promise.all([readFile(paths.testnet), readFile(paths.mainnet)])
const testnetArtifact = JSON.parse(testnetRaw)
const mainnetArtifact = JSON.parse(mainnetRaw)

const bytecode = artifact => artifact.bytecode.object
const runtime = artifact => artifact.deployedBytecode.object
const byteLength = value => (value.length - 2) / 2
const namedAbi = (abi, type, name) => abi.find(item => item.type === type && item.name === name)
if (JSON.stringify(namedAbi(testnetArtifact.abi, 'function', 'createEvent')) !== JSON.stringify(namedAbi(mainnetArtifact.abi, 'function', 'createEvent'))
  || JSON.stringify(namedAbi(testnetArtifact.abi, 'event', 'EventCreated')) !== JSON.stringify(namedAbi(mainnetArtifact.abi, 'event', 'EventCreated'))) {
  throw new Error('Testnet/Mainnet createEvent or EventCreated ABI mismatch')
}
for (const artifact of [testnetArtifact, mainnetArtifact]) {
  if (byteLength(bytecode(artifact)) > 49152 || byteLength(runtime(artifact)) > 24576) {
    throw new Error('EIP-3860 or EIP-170 bytecode limit exceeded')
  }
}

const clients = {
  testnet: createPublicClient({ chain: arcTestnet, transport: http('https://rpc.testnet.arc.io') }),
  mainnet: createPublicClient({ chain: arc, transport: http('https://rpc.mainnet.arc.io') }),
}
const [testnetChainId, mainnetChainId, onchainTestnetCode, testnetReceipt, testnetTx, testnetGasPrice, mainnetGasPrice,
  testnetOrganizerBalance, mainnetOrganizerBalance, mainnetOrganizerNonce] = await Promise.all([
  clients.testnet.getChainId(), clients.mainnet.getChainId(), clients.testnet.getCode({ address: testnetFactory }),
  clients.testnet.getTransactionReceipt({ hash: testnetDeploymentTx }), clients.testnet.getTransaction({ hash: testnetDeploymentTx }),
  clients.testnet.getGasPrice(), clients.mainnet.getGasPrice(), clients.testnet.getBalance({ address: organizer }),
  clients.mainnet.getBalance({ address: organizer }), clients.mainnet.getTransactionCount({ address: organizer, blockTag: 'pending' }),
])
if (testnetChainId !== 5042002 || mainnetChainId !== 5042) throw new Error('Arc RPC chainId mismatch')
if (!onchainTestnetCode || keccak256(onchainTestnetCode) !== keccak256(runtime(testnetArtifact))) {
  throw new Error('Testnet v4 Factory runtime mismatch')
}
if (testnetReceipt.status !== 'success' || getAddress(testnetReceipt.contractAddress) !== testnetFactory
  || keccak256(testnetTx.input) !== keccak256(bytecode(testnetArtifact))) {
  throw new Error('Testnet v4 Factory deployment receipt/creation bytecode mismatch')
}

const metadataHash = keccak256(stringToHex('ChangeBack v4 minimal differential E2E'))
const zeroHash = `0x${'0'.repeat(64)}`
const createArgs = [metadataHash, parseEther('0.01'), 1n, 600n, 1200n, 30n * 86400n,
  [{ recipient: expenseRecipient, cap: parseEther('0.006'), approvedAmount: 0n, paidAmount: 0n, receiptHash: zeroHash }]]
const createData = encodeFunctionData({ abi: v4FactoryAbi, functionName: 'createEvent', args: createArgs })
const testnetCreateEstimate = await clients.testnet.estimateContractGas({
  account: organizer, address: testnetFactory, abi: v4FactoryAbi, functionName: 'createEvent', args: createArgs,
})
const mainnetDeployData = encodeDeployData({ abi: mainnetArtifact.abi, bytecode: bytecode(mainnetArtifact) })
const mainnetDeployEstimate = await clients.mainnet.estimateGas({ account: organizer, data: mainnetDeployData })
const expectedMainnetFactory = getContractAddress({ from: organizer, nonce: BigInt(mainnetOrganizerNonce) })
const expectedMainnetEvent = getContractAddress({ from: expectedMainnetFactory, nonce: 1n })
let expectedMainnetRuntime = runtime(mainnetArtifact)
const immutableRefs = Object.values(mainnetArtifact.deployedBytecode.immutableReferences || {}).flat()
if (!immutableRefs.length || immutableRefs.some(reference => reference.length !== 32)) throw new Error('Unexpected deploymentOperator immutable layout')
for (const { start, length } of immutableRefs) {
  if (length !== 32) throw new Error('Unexpected immutable width')
  const offset = 2 + start * 2
  const word = organizer.slice(2).toLowerCase().padStart(64, '0')
  expectedMainnetRuntime = expectedMainnetRuntime.slice(0, offset) + word + expectedMainnetRuntime.slice(offset + 64)
}
const gasLimit = estimate => (estimate * 120n + 99n) / 100n
const gasPriceCap = 25_000_000_000n
const maxFee = limit => limit * gasPriceCap
const mainnetDeployLimit = gasLimit(mainnetDeployEstimate)
const testnetCreateLimit = gasLimit(testnetCreateEstimate)
const joinData = encodeFunctionData({ abi: v4Abi, functionName: 'join', args: [keccak256(stringToHex('ChangeBack v4 demo participant'))] })
const receiptHash = keccak256(stringToHex('ChangeBack v4 actual expense 0.006 USDC'))
const approveExpenseData = encodeFunctionData({ abi: v4Abi, functionName: 'approveExpense', args: [0n, parseEther('0.006'), receiptHash] })
const payExpenseData = encodeFunctionData({ abi: v4Abi, functionName: 'payApprovedExpense', args: [0n] })
const finalizeData = encodeFunctionData({ abi: v4Abi, functionName: 'finalize' })
const claimData = encodeFunctionData({ abi: v4Abi, functionName: 'claimRefund', args: [organizer] })
const lifecycleGasLimits = [220000n, 180000n, 180000n, 260000n, 180000n]
const testnetTotalGasLimit = testnetCreateLimit + lifecycleGasLimits.reduce((sum, value) => sum + value, 0n)
const mainnetTotalGasLimit = mainnetDeployLimit + testnetCreateLimit + lifecycleGasLimits.reduce((sum, value) => sum + value, 0n)

const approvalBundle = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  preparationOnly: true,
  signingAuthorized: false,
  broadcastingAuthorized: false,
  gasPriceCapWei: gasPriceCap.toString(),
  actors: { organizer, participant: organizer, expenseRecipient, keeper: 'permissionless; use organizer for the minimal demo' },
  verified: {
    testnet: {
      chainId: testnetChainId, factory: testnetFactory, deploymentTx: testnetDeploymentTx,
      creationHash: keccak256(bytecode(testnetArtifact)), runtimeHash: keccak256(runtime(testnetArtifact)),
      creationBytes: byteLength(bytecode(testnetArtifact)), runtimeBytes: byteLength(runtime(testnetArtifact)),
      deploymentGasUsed: testnetReceipt.gasUsed.toString(), deploymentEffectiveGasPrice: testnetReceipt.effectiveGasPrice.toString(),
      deploymentCostWei: (testnetReceipt.gasUsed * testnetReceipt.effectiveGasPrice).toString(),
    },
    mainnetBuild: {
      chainId: mainnetChainId, contract: 'NativeMeetupExpenseSettlementV4FactoryMainnet5042',
      artifactSha256: createHash('sha256').update(mainnetRaw).digest('hex'),
      creationHash: keccak256(bytecode(mainnetArtifact)), runtimeHash: keccak256(expectedMainnetRuntime),
      creationBytes: byteLength(bytecode(mainnetArtifact)), runtimeBytes: byteLength(runtime(mainnetArtifact)),
      createEventAndEventCreatedAbiMatchTestnet: true, deploymentOperator: organizer,
      maxPrincipalWei: parseEther('0.01').toString(), maxCapacity: '1', predictedFactoryAtPendingNonce: expectedMainnetFactory,
      predictedFirstEvent: expectedMainnetEvent,
    },
  },
  liveReadOnly: {
    testnetGasPriceWei: testnetGasPrice.toString(), mainnetGasPriceWei: mainnetGasPrice.toString(),
    testnetOrganizerBalanceWei: testnetOrganizerBalance.toString(), mainnetOrganizerBalanceWei: mainnetOrganizerBalance.toString(),
    mainnetOrganizerPendingNonce: mainnetOrganizerNonce,
  },
  approvals: {
    testnetMinimalE2E: [
      { order: 1, signer: organizer, to: testnetFactory, valueWei: '0', action: 'createEvent', data: createData,
        gasEstimate: testnetCreateEstimate.toString(), gasLimit: testnetCreateLimit.toString(), maxGasCostWei: maxFee(testnetCreateLimit).toString() },
      { order: 2, signer: organizer, to: 'EVENT_FROM_ORDER_1_RECEIPT', valueWei: parseEther('0.01').toString(), action: 'join', dataTemplate: 'join(keccak256(private participant label))', gasLimit: '220000' },
      { order: 3, signer: organizer, to: 'EVENT_FROM_ORDER_1_RECEIPT', valueWei: '0', action: 'approveExpense(0, 0.006 USDC, receiptHash)', dataTemplate: 'receiptHash must be fixed before signing', gasLimit: '180000' },
      { order: 4, signer: organizer, to: 'EVENT_FROM_ORDER_1_RECEIPT', valueWei: '0', action: 'payApprovedExpense(0)', earliest: 'after collectUntil', gasLimit: '180000' },
      { order: 5, signer: organizer, to: 'EVENT_FROM_ORDER_1_RECEIPT', valueWei: '0', action: 'finalize()', earliest: 'after expenseUntil', gasLimit: '260000' },
      { order: 6, signer: organizer, to: 'EVENT_FROM_ORDER_1_RECEIPT', valueWei: '0', action: 'claimRefund(participant)', gasLimit: '180000' },
    ],
    mainnetPhase1FactoryOnly: [{ order: 1, signer: organizer, to: null, valueWei: '0', action: 'deploy dedicated v4 Mainnet Factory',
      data: mainnetDeployData, gasEstimate: mainnetDeployEstimate.toString(), gasLimit: mainnetDeployLimit.toString(),
      maxGasCostWei: maxFee(mainnetDeployLimit).toString(), expectedRuntimeHash: keccak256(expectedMainnetRuntime),
      expectedFactoryAddressIfNonceUnchanged: expectedMainnetFactory }],
    mainnetFullE2EConditional: [
      { order: 1, signer: organizer, to: null, valueWei: '0', action: 'deploy dedicated v4 Mainnet Factory', gasLimit: mainnetDeployLimit.toString(), data: mainnetDeployData },
      { order: 2, signer: organizer, to: expectedMainnetFactory, valueWei: '0', action: 'createEvent', gasLimit: testnetCreateLimit.toString(), data: createData,
        condition: 'only after order 1 receipt success, exact predicted address, runtime hash and operator/limits verification' },
      { order: 3, signer: organizer, to: expectedMainnetEvent, valueWei: parseEther('0.01').toString(), action: 'join', gasLimit: lifecycleGasLimits[0].toString(), data: joinData,
        condition: 'only after order 2 EventCreated receipt and event runtime/terms verification' },
      { order: 4, signer: organizer, to: expectedMainnetEvent, valueWei: '0', action: 'approveExpense(0, 0.006 USDC, fixed receiptHash)', gasLimit: lifecycleGasLimits[1].toString(), data: approveExpenseData },
      { order: 5, signer: organizer, to: expectedMainnetEvent, valueWei: '0', action: 'payApprovedExpense(0)', gasLimit: lifecycleGasLimits[2].toString(), data: payExpenseData, earliest: 'after collectUntil' },
      { order: 6, signer: organizer, to: expectedMainnetEvent, valueWei: '0', action: 'finalize()', gasLimit: lifecycleGasLimits[3].toString(), data: finalizeData, earliest: 'after expenseUntil' },
      { order: 7, signer: organizer, to: expectedMainnetEvent, valueWei: '0', action: 'claimRefund(organizer)', gasLimit: lifecycleGasLimits[4].toString(), data: claimData },
    ],
  },
  caps: {
    testnetPrincipalWei: parseEther('0.01').toString(), mainnetPhase1ValueWei: '0',
    testnetAllTransactionsMaxGasCostWei: maxFee(testnetTotalGasLimit).toString(),
    testnetAllTransactionsMaximumLossWei: (maxFee(testnetTotalGasLimit) + parseEther('0.01')).toString(),
    mainnetPhase1MaxGasCostWei: maxFee(mainnetDeployLimit).toString(),
    mainnetPhase1MaximumLossWei: maxFee(mainnetDeployLimit).toString(),
    mainnetAllTransactionsPrincipalWei: parseEther('0.01').toString(),
    mainnetAllTransactionsMaxGasCostWei: maxFee(mainnetTotalGasLimit).toString(),
    mainnetAllTransactionsMaximumLossWei: (maxFee(mainnetTotalGasLimit) + parseEther('0.01')).toString(),
  },
  notes: [
    '25 gwei is an approval ceiling, not a promise to submit at that price.',
    'The browser wallet must show Arc Testnet 5042002 or Arc Mainnet 5042 exactly.',
    'No private key is read or stored by this preparation script; signing is wallet-confirmed only.',
    `Human-readable Mainnet phase-1 cap: ${formatEther(maxFee(mainnetDeployLimit))} USDC-equivalent native gas.`,
  ],
}

await mkdir(outputDir, { recursive: true })
await writeFile(resolve(outputDir, 'changeback-v4-approval-bundle.json'), JSON.stringify(approvalBundle, null, 2) + '\n')
await writeFile(resolve(root, 'src/lib/v4-factory-artifacts.generated.ts'),
  `export const v4FactoryArtifacts = ${JSON.stringify({
    testnet: { chainId: 5042002, address: testnetFactory, creationHash: keccak256(bytecode(testnetArtifact)), runtimeHash: keccak256(runtime(testnetArtifact)) },
    mainnet: { chainId: 5042, creationHash: keccak256(bytecode(mainnetArtifact)), runtimeHash: keccak256(expectedMainnetRuntime), bytecode: bytecode(mainnetArtifact),
      deploymentOperator: organizer, predictedFactoryAtPendingNonce: expectedMainnetFactory },
  })} as const\n`)
console.log(JSON.stringify({ mode: 'PREPARATION_ONLY_NO_SIGNING_NO_BROADCAST',
  testnetRuntimeHash: approvalBundle.verified.testnet.runtimeHash,
  mainnetRuntimeHash: approvalBundle.verified.mainnetBuild.runtimeHash,
  testnetCreateGasEstimate: testnetCreateEstimate.toString(), mainnetDeployGasEstimate: mainnetDeployEstimate.toString(),
  mainnetDeployMaxCostAt25Gwei: formatEther(maxFee(mainnetDeployLimit)), outputDir }))

