import { encodeFunctionData, isAddress, keccak256, parseUnits, toBytes, zeroAddress } from 'viem'
import type { Address, PublicClient } from 'viem'
import { VAULT_ABI } from './abi'

export interface PaymentInput {
  chainId: number
  account: string
  vault: Address
  recipient: string
  amount: string
  memo: string
  hours: string
  available: bigint
  spendUntil: bigint
}

export function paymentCandidate(input: PaymentInput, timestamp: bigint) {
  if (![5042, 5042002].includes(input.chainId)) throw new Error('Unsupported Arc chain.')
  if (!isAddress(input.account)) throw new Error('Enter a valid simulation sender.')
  if (!isAddress(input.recipient) || input.recipient.toLowerCase() === zeroAddress ||
      input.recipient.toLowerCase() === input.vault.toLowerCase()) throw new Error('Invalid payment recipient.')
  if (!/^(?:[0-9]+(?:\.[0-9]{0,6})?|\.[0-9]{1,6})$/.test(input.amount)) throw new Error('Enter an unsigned amount with at most 6 decimals.')
  const amount = parseUnits(input.amount, 6)
  if (amount <= 0n || amount > input.available) throw new Error('Amount exceeds available funds or is zero.')
  if (!/^[1-9][0-9]*$/.test(input.hours)) throw new Error('Enter a whole number of hours greater than zero.')
  const expiresAt = timestamp + BigInt(input.hours) * 3600n
  if (expiresAt > input.spendUntil) throw new Error('Proposal expiry exceeds the vault spend deadline.')
  const args = [input.recipient, amount, keccak256(toBytes(input.memo)), expiresAt] as const
  const data = encodeFunctionData({ abi: VAULT_ABI, functionName: 'proposePayment', args })
  return { args, data, account: input.account, to: input.vault, value: 0n, chainId: input.chainId }
}

export async function preparePayment(client: PublicClient, input: PaymentInput) {
  if (await client.getChainId() !== input.chainId) throw new Error('RPC chain mismatch.')
  const block = await client.getBlock()
  const candidate = paymentCandidate(input, block.timestamp)
  const transaction = { account: candidate.account, to: candidate.to, data: candidate.data, value: 0n }
  const simulation = await client.call({ ...transaction, blockNumber: block.number })
  const [estimatedGas, fees, balance, nonce] = await Promise.all([
    client.estimateGas({ ...transaction, blockNumber: block.number }),
    client.estimateFeesPerGas(),
    client.getBalance({ address: candidate.account }),
    client.getTransactionCount({ address: candidate.account, blockTag: 'pending' }),
  ])
  const gas = (estimatedGas * 120n + 99n) / 100n
  const { maxFeePerGas, maxPriorityFeePerGas } = fees
  if (maxFeePerGas === undefined || maxPriorityFeePerGas === undefined || maxFeePerGas <= 0n ||
      maxPriorityFeePerGas > maxFeePerGas) throw new Error('RPC did not provide valid EIP-1559 fee caps.')
  const maxFee = gas * maxFeePerGas
  if (input.chainId === 5042 && (gas > 195_000n || maxFeePerGas > 50_000_000_000n || maxPriorityFeePerGas > 5_000_000_000n)) {
    throw new Error('Payment proposal exceeds the mainnet network fee limit.')
  }
  if (balance < maxFee) throw new Error('Sender balance does not cover the maximum network fee.')
  await client.call({ ...transaction, gas, maxFeePerGas, maxPriorityFeePerGas })
  return { ...candidate, estimatedGas, gas, maxFeePerGas, maxPriorityFeePerGas, maxFee,
    balance, nonce, simulationResult: simulation.data, blockNumber: block.number,
    blockHash: block.hash, blockTimestamp: block.timestamp, preparedAt: Date.now(),
    validUntil: Date.now() + 120_000 }
}

export type PaymentPreflight = Awaited<ReturnType<typeof preparePayment>>
