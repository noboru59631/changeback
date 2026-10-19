import { encodeFunctionData, keccak256, toBytes } from 'viem'
import type { Address, Hex, PublicClient } from 'viem'
import { VAULT_ABI } from './abi'

export async function prepareCappedTransaction(client: PublicClient, account: Address, vault: Address, data: Hex, maximumGas: bigint, expectedChainId = 5042002, reserve = 0n) {
  if (![5042, 5042002].includes(expectedChainId) || await client.getChainId() !== expectedChainId) throw new Error('RPC chain mismatch.')
  const maxFeePerGas = 50_000_000_000n
  const maxPriorityFeePerGas = 5_000_000_000n
  const transaction = { account, to: vault, value: 0n,
    data,
    maxFeePerGas, maxPriorityFeePerGas }
  const block = await client.getBlock()
  await client.call({ ...transaction, gas: maximumGas, blockNumber: block.number })
  const estimatedGas = await client.estimateGas({ ...transaction, gas: maximumGas, blockNumber: block.number })
  const gas = (estimatedGas * 120n + 99n) / 100n
  if (estimatedGas <= 0n || gas > maximumGas) throw new Error('Transaction exceeds the approved network fee limit.')
  if (await client.getBalance({ address: account }) < gas * maxFeePerGas + reserve) throw new Error('Insufficient balance for network fee and transfer.')
  await client.call({ ...transaction, gas })
  return { gas, maxFeePerGas, maxPriorityFeePerGas }
}

export function prepareApproval(client: PublicClient, account: Address, vault: Address, proposalId: bigint, expectedChainId = 5042002) {
  const data = encodeFunctionData({ abi: VAULT_ABI, functionName: 'approve', args: [proposalId] })
  return prepareCappedTransaction(client, account, vault, data, 98_519n, expectedChainId)
}

export function prepareExecution(client: PublicClient, account: Address, vault: Address, proposalId: bigint, expectedChainId = 5042002) {
  const data = encodeFunctionData({ abi: VAULT_ABI, functionName: 'execute', args: [proposalId] })
  return prepareCappedTransaction(client, account, vault, data, 151_659n, expectedChainId)
}

export function prepareEarlyReturnExecution(client: PublicClient, account: Address, vault: Address, proposalId: bigint, expectedChainId = 5042002) {
  const data = encodeFunctionData({ abi: VAULT_ABI, functionName: 'executeEarlyReturn', args: [proposalId] })
  return prepareCappedTransaction(client, account, vault, data, 103_852n, expectedChainId)
}

export function prepareRefund(client: PublicClient, account: Address, vault: Address, participant: Address, expectedChainId = 5042002) {
  const data = encodeFunctionData({ abi: VAULT_ABI, functionName: 'claimFor', args: [participant] })
  return prepareCappedTransaction(client, account, vault, data, 273_945n, expectedChainId)
}

export function prepareClose(client: PublicClient, account: Address, vault: Address, expectedChainId = 5042002) {
  const data = encodeFunctionData({ abi: VAULT_ABI, functionName: 'close' })
  return prepareCappedTransaction(client, account, vault, data, 38_620n, expectedChainId)
}

export async function prepareEarlyReturn(client: PublicClient, account: Address, vault: Address, hours: string, expectedChainId = 5042002) {
  if (!/^[1-9][0-9]*$/.test(hours)) throw new Error('Enter a whole number of hours greater than zero.')
  if (![5042, 5042002].includes(expectedChainId) || await client.getChainId() !== expectedChainId) throw new Error('RPC chain mismatch.')
  const block = await client.getBlock()
  const read = (functionName: 'spendUntil' | 'proposalCount') => client.readContract({
    address: vault, abi: VAULT_ABI, functionName, blockNumber: block.number })
  const [spendUntil, proposalCount] = await Promise.all([read('spendUntil'), read('proposalCount')])
  const expiresAt = block.timestamp + BigInt(hours) * 3600n
  if (expiresAt > spendUntil) throw new Error('Proposal expiry exceeds the vault spend deadline.')
  const proposals = await Promise.all(Array.from({ length: Number(proposalCount) }, (_, index) =>
    client.readContract({ address: vault, abi: VAULT_ABI, functionName: 'getProposal', args: [BigInt(index)], blockNumber: block.number })))
  if (proposals.some(proposal => proposal[0] === 1 && !proposal[6] && !proposal[7] && proposal[4] > block.timestamp)) {
    throw new Error('An active early-return proposal already exists.')
  }
  const args = [keccak256(toBytes(expectedChainId === 5042 ? 'ChangeBack microgrants 0.03 USDC demonstration' : '')), expiresAt] as const
  const data = encodeFunctionData({ abi: VAULT_ABI, functionName: 'proposeEarlyReturn', args })
  const fees = await prepareCappedTransaction(client, account, vault, data, expectedChainId === 5042 ? 132_422n : 127_422n, expectedChainId)
  return { ...fees, args, data, account, expiresAt, proposalCount, validUntil: Date.now() + 120_000 }
}
