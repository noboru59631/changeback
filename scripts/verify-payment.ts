import { writeFile } from 'node:fs/promises'
import { createPublicClient, custom } from 'viem'
import { arcTestnet } from 'viem/chains'
import { VAULT_ABI } from '../src/lib/abi'
import { preparePayment } from '../src/lib/payment-preflight'

const methods: Record<string, number> = {}
const allowed = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_call', 'eth_estimateGas',
  'eth_maxPriorityFeePerGas', 'eth_gasPrice', 'eth_getBalance', 'eth_getTransactionCount'])
const client = createPublicClient({ chain: arcTestnet, transport: custom({
  async request({ method, params }) {
    if (!allowed.has(method)) throw new Error(`Forbidden RPC method: ${method}`)
    methods[method] = (methods[method] ?? 0) + 1
    const response = await fetch('https://rpc.testnet.arc.io', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? [] }),
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`)
    const result = await response.json()
    if (result.error) throw new Error(JSON.stringify(result.error))
    return result.result
  },
}) })
const vault = '0x6450E88EFeF6Bd1aA80529765834af153cfDf386'
const [totalContributions, totalSpent, spendUntil] = await Promise.all(
  (['totalContributions', 'totalSpent', 'spendUntil'] as const).map(functionName =>
    client.readContract({ address: vault, abi: VAULT_ABI, functionName })),
)
const result = await preparePayment(client, { chainId: 5042002,
  account: '0x03607de69C487BcC460eaD7C4Bdfd25805658b75', vault,
  recipient: '0x89A4EF745831CFe8957391Ad2e3CF55Dc3a6e502', amount: '0.03', memo: '', hours: '1',
  available: totalContributions - totalSpent, spendUntil,
})
const record = { observedAt: new Date().toISOString(), result, methods,
  note: 'Read-only RPC estimates; no wallet confirmation, signature or submission. Candidate expires after 120 seconds.' }
await writeFile(process.argv[2], JSON.stringify(record, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2))
console.log(JSON.stringify({ block: result.blockNumber.toString(), estimatedGas: result.estimatedGas.toString(),
  gas: result.gas.toString(), maxFeePerGas: result.maxFeePerGas.toString(), maxFee: result.maxFee.toString(), methods }))
