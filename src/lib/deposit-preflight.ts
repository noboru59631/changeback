import type { Address, PublicClient } from 'viem'
import { VAULT_ABI } from './abi'

export const MAINNET_COLLECTION_LIMIT = 100_000n

export function checkCollectionLimit(chainId: number, total: bigint, amount: bigint) {
  if (![5042, 5042002].includes(chainId)) throw new Error('Unsupported Arc chain.')
  if (amount <= 0n || total < 0n) throw new Error('Enter a positive deposit amount.')
  if (chainId === 5042 && total + amount > MAINNET_COLLECTION_LIMIT) {
    throw new Error('Mainnet safety limit: cumulative deposits must not exceed 0.10 USDC. Do not send directly to the vault.')
  }
}

export async function prepareDepositCheck(client: PublicClient, account: Address, vault: Address, amount: bigint, chainId: number) {
  if (await client.getChainId() !== chainId) throw new Error('RPC chain mismatch.')
  const block = await client.getBlock()
  const read = (functionName: 'totalContributions' | 'collectUntil' | 'paused' | 'isParticipant') =>
    client.readContract({ address: vault, abi: VAULT_ABI, functionName,
      ...(functionName === 'isParticipant' ? { args: [account] as const } : {}), blockNumber: block.number })
  const [total, collectUntil, paused, participant] = await Promise.all([
    read('totalContributions'), read('collectUntil'), read('paused'), read('isParticipant'),
  ])
  if (typeof total !== 'bigint' || typeof collectUntil !== 'bigint' || typeof paused !== 'boolean' || typeof participant !== 'boolean') {
    throw new Error('Vault reads are not ready.')
  }
  if (!participant) throw new Error('Connected wallet is not a participant.')
  if (paused) throw new Error('Vault is paused.')
  if (block.timestamp >= collectUntil) throw new Error('Collection deadline has passed.')
  checkCollectionLimit(chainId, total, amount)
  return total
}
