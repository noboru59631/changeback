import { writeFile } from 'node:fs/promises'
import { createPublicClient, http, erc20Abi, parseAbi } from 'viem'
import { ARC_TESTNET_ID, USDC } from '../src/lib/meetup-abi.ts'

const rpc = process.env.ARC_TESTNET_RPC || 'https://rpc.testnet.arc.io'
const client = createPublicClient({ transport: http(rpc, { timeout: 10_000, retryCount: 0 }) })
const chainId = await client.getChainId()
if (chainId !== ARC_TESTNET_ID) throw new Error('Refusing non-Testnet RPC')
const [block, decimals, code] = await Promise.all([
  client.getBlock(),
  client.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' }),
  client.getCode({ address: USDC }),
])
let authorizationDomain
try {
  authorizationDomain = await client.readContract({ address: USDC,
    abi: parseAbi(['function DOMAIN_SEPARATOR() view returns (bytes32)']), functionName: 'DOMAIN_SEPARATOR' })
} catch { authorizationDomain = 'unavailable; authorization support unverified' }
const report = { network: 'ARC TESTNET READ ONLY', rpc, chainId, blockNumber: block.number.toString(),
  blockHash: block.hash, token: USDC, decimals, codePresent: !!code && code !== '0x', authorizationDomain,
  e2e: 'NOT RUN: no dedicated funded Testnet signer configured; no transactions submitted' }
const output = JSON.stringify(report, null, 2)
if (process.env.MEETUP_PROBE_REPORT) await writeFile(process.env.MEETUP_PROBE_REPORT, output)
console.log(output)
