export type PaymentStatus = 'paid' | 'unpaid' | 'short' | 'duplicate' | 'review'

export interface Attendee {
  wallet: string
  name: string
  verified: boolean
}

export interface PaymentEvidence {
  chainId: number
  token: string
  escrow: string
  payer: string
  amount: bigint
  timestamp: bigint
  transactionHash: string
  logIndex: number
  confirmed: boolean
  kind: 'accounted' | 'direct'
}

export interface AccountingTerms {
  chainId: number
  token: string
  escrow: string
  fee: bigint
  deadline: bigint
}

export function reconcilePayments(attendees: Attendee[], evidence: PaymentEvidence[], terms: AccountingTerms) {
  if (terms.fee <= 0n) throw new Error('Invalid fee')
  const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase()
  const unique = new Map<string, PaymentEvidence>()
  const conflicts = new Set<string>()
  for (const payment of evidence) {
    if (payment.chainId !== terms.chainId || !same(payment.token, terms.token) || !same(payment.escrow, terms.escrow)) continue
    const key = `${payment.chainId}:${payment.transactionHash.toLowerCase()}:${payment.logIndex}`
    const previous = unique.get(key)
    if (previous && (previous.amount !== payment.amount || !same(previous.payer, payment.payer)
      || previous.kind !== payment.kind || previous.timestamp !== payment.timestamp
      || previous.confirmed !== payment.confirmed)) conflicts.add(key)
    else unique.set(key, payment)
  }
  const payments = [...unique.entries()]
  const rows = attendees.map(attendee => {
    const own = payments.filter(([, payment]) => same(payment.payer, attendee.wallet))
    const accepted = own.filter(([key, payment]) => !conflicts.has(key) && payment.confirmed
      && payment.kind === 'accounted' && payment.timestamp < terms.deadline && payment.amount > 0n)
    const received = accepted.reduce((total, [, payment]) => total + payment.amount, 0n)
    const requiresReview = !attendee.verified || attendees.filter(other => same(other.wallet, attendee.wallet)).length !== 1
      || own.length !== accepted.length
    const status: PaymentStatus = requiresReview ? 'review' : received > terms.fee ? 'duplicate'
      : received === terms.fee ? 'paid' : received > 0n ? 'short' : 'unpaid'
    return { ...attendee, received, missing: received < terms.fee ? terms.fee - received : 0n, status }
  })
  const unmatched = payments.filter(([key, payment]) => conflicts.has(key)
    || !attendees.some(attendee => same(attendee.wallet, payment.payer))).map(([, payment]) => payment)
  return { rows, unmatched }
}

export function distributeRefunds(paid: bigint[], fee: bigint, spent: bigint) {
  if (fee <= 0n || paid.some(amount => amount < 0n || amount > fee)) throw new Error('Invalid payments')
  const count = BigInt(paid.filter(amount => amount === fee).length)
  if (spent < 0n || spent > count * fee) throw new Error('Partial payments are reserved')
  const pool = count * fee - spent
  let index = 0n
  let previous = 0n
  return paid.map(amount => {
    if (amount !== fee) return amount
    index++
    const current = pool * index / count
    const refund = current - previous
    previous = current
    return refund
  })
}

export function formatUsdc(amount: bigint) {
  const whole = amount / 1_000_000n
  const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}
