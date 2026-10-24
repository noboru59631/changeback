import { parseAbi } from 'viem'

export const meetupAbi = parseAbi([
  'function organizer() view returns (address)',
  'function createdAtBlock() view returns (uint256)',
  'function terms() view returns (bytes32 metadataHash,uint256 fee,uint256 capacity,uint256 collectUntil,uint256 spendUntil,bool showStaffAmounts)',
  'function participantCount() view returns (uint256)',
  'function participants(uint256) view returns (address)',
  'function members(address) view returns (address refundTo,bytes32 nameHash,uint256 paid,uint256 entitlement,bool claimed)',
  'function budgetCount() view returns (uint256)',
  'function budgets(uint256) view returns (address recipient,uint256 cap,uint8 category,uint256 payAfter,bool automatic)',
  'function budgetSpent(uint256) view returns (uint256)',
  'function totalCollected() view returns (uint256)',
  'function totalSpent() view returns (uint256)',
  'function totalRefunded() view returns (uint256)',
  'function remainingLiability() view returns (uint256)',
  'function unaccountedBalance() view returns (uint256)',
  'function finalized() view returns (bool)',
  'function register(bytes32,address)',
  'function pay(uint256)',
  'function payWithAuthorization(address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)',
  'function spend(uint256,uint256,bytes32)',
  'function executeScheduled(uint256)',
  'function finalize()',
  'function refundFor(address)',
  'function setRefundDestination(address)',
  'function refundBatch(address[])',
  'event Paid(address indexed payer,uint256 amount,uint256 cumulative)',
  'event RefundFailed(address indexed payer,bytes32 reasonHash)',
])

export const factoryAbi = parseAbi([
  'function isEvent(address) view returns (bool)',
  'function createEvent((bytes32 metadataHash,uint256 fee,uint256 capacity,uint256 collectUntil,uint256 spendUntil,bool showStaffAmounts),(address recipient,uint256 cap,uint8 category,uint256 payAfter,bool automatic)[]) returns (address)',
  'event EventCreated(address indexed escrow,address indexed organizer,bytes32 indexed metadataHash)',
])

export const ARC_TESTNET_ID = 5042002
export const USDC = '0x3600000000000000000000000000000000000000'

export function requireSafeNetwork(chainId: number, rpc: string) {
  const local = chainId === 31337 && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(rpc).hostname)
  if (chainId !== ARC_TESTNET_ID && !local) throw new Error('Only Arc Testnet or loopback Anvil is allowed')
}
