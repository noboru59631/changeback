export type NativePaymentStatus = 'unpaid' | 'short' | 'paid' | 'excess'

export function nativePaymentStatus(paid: bigint, fee: bigint): NativePaymentStatus {
  if (paid < 0n || fee <= 0n) throw new Error('Invalid amounts')
  return paid === 0n ? 'unpaid' : paid < fee ? 'short' : paid === fee ? 'paid' : 'excess'
}

export function nativeRefunds(payments: bigint[], fee: bigint, spent: bigint) {
  if (fee <= 0n || spent < 0n || payments.some(amount => amount < 0n)) throw new Error('Invalid amounts')
  const fullCount = BigInt(payments.filter(amount => amount >= fee).length)
  if (spent > fullCount * fee) throw new Error('Short and excess payments are reserved')
  const pool = fullCount * fee - spent
  let fullIndex = 0n
  let previousFloor = 0n
  return payments.map(paid => {
    if (paid < fee) return paid
    fullIndex++
    const currentFloor = pool * fullIndex / fullCount
    const entitlement = paid - fee + currentFloor - previousFloor
    previousFloor = currentFloor
    return entitlement
  })
}

export interface NativeReceipt {
  chainId: number
  escrow: string
  transactionHash: string
  blockHash: string
  logIndex: number
  payer: string
  amount: bigint
  source: 'NativePaid' | 'erc20-transfer' | 'system-transfer'
  success: boolean
}

export function reconcileNativeReceipts(receipts: NativeReceipt[], chainId: number, escrow: string,
  canonicalBlocks: Set<string>) {
  const accepted = new Map<string, NativeReceipt>()
  const conflicts = new Set<string>()
  const review: NativeReceipt[] = []
  for (const receipt of receipts) {
    if (receipt.chainId !== chainId || receipt.escrow.toLowerCase() !== escrow.toLowerCase()) continue
    if (receipt.source !== 'NativePaid' || !receipt.success || receipt.amount <= 0n
      || !Number.isSafeInteger(receipt.logIndex) || receipt.logIndex < 0
      || !canonicalBlocks.has(receipt.blockHash.toLowerCase())) {
      review.push(receipt)
      continue
    }
    const key = `${chainId}:${receipt.transactionHash.toLowerCase()}:${receipt.logIndex}`
    const previous = accepted.get(key)
    if (previous && (previous.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase()
      || previous.payer.toLowerCase() !== receipt.payer.toLowerCase() || previous.amount !== receipt.amount)) {
      conflicts.add(key)
      review.push(previous, receipt)
    } else accepted.set(key, receipt)
  }
  for (const key of conflicts) accepted.delete(key)
  return { accepted: [...accepted.values()], review }
}
