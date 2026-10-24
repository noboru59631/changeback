import { readFile, writeFile } from 'node:fs/promises'
import { createPublicClient, createWalletClient, http, keccak256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ARC_TESTNET_ID, USDC } from '../src/lib/meetup-abi.ts'

const rpc = process.env.ARC_TESTNET_RPC || 'https://rpc.testnet.arc.io'
const client = createPublicClient({ transport: http(rpc) })
if (await client.getChainId() !== ARC_TESTNET_ID) throw new Error('Arc Testnet only')
if (!process.argv.includes('--broadcast-testnet')) throw new Error('Broadcast requires --broadcast-testnet and a dedicated Testnet key file')
if (!process.env.MEETUP_DEPLOYER_KEY_FILE) throw new Error('Set MEETUP_DEPLOYER_KEY_FILE; Mainnet key variables are not used')
const key = (await readFile(process.env.MEETUP_DEPLOYER_KEY_FILE, 'utf8')).trim()
const account = privateKeyToAccount(key)
const wallet = createWalletClient({ account, transport: http(rpc) })
const artifact = JSON.parse(await readFile(new URL('../contracts/out/MeetupFactory.sol/MeetupFactoryTestnet.json', import.meta.url), 'utf8'))
const gasPrice = await client.getGasPrice()
const gas = await client.estimateGas({ account, data: artifact.bytecode.object })
const limit = BigInt(process.env.MEETUP_DEPLOY_GAS_LIMIT || '10000000')
const maxPrice = BigInt(process.env.MEETUP_MAX_GAS_PRICE || '100000000000')
const gasLimit = gas * 120n / 100n
if (gasLimit > limit || gasPrice > maxPrice || limit <= 0n || maxPrice <= 0n) throw new Error('Deployment exceeds operator gas limits')
if (await client.getBalance({ address: account.address }) < gasLimit * gasPrice + 10n ** 16n) throw new Error('Testnet gas funding required')
const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object,
  chain: null, gas: gasLimit, gasPrice })
console.log(JSON.stringify({ submitted: hash }))
const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 })
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment failed')
const code = await client.getCode({ address: receipt.contractAddress })
const manifest = { chainId: ARC_TESTNET_ID, token: USDC, factory: receipt.contractAddress,
  factoryCodeHash: keccak256(code), transactionHash: hash, blockNumber: receipt.blockNumber.toString(),
  deployer: account.address, compiler: '0.8.28', status: 'TESTNET; requires independent source and bytecode review before UI enablement' }
const output = JSON.stringify(manifest, null, 2)
if (process.env.MEETUP_DEPLOYMENT_MANIFEST) await writeFile(process.env.MEETUP_DEPLOYMENT_MANIFEST, output)
console.log(output)
