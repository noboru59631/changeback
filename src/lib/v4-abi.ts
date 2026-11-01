import { parseAbi } from 'viem'

export const v4Abi = parseAbi([
  'function contractVersion() view returns (uint256)',
  'function organizer() view returns (address)',
  'function metadataHash() view returns (bytes32)',
  'function fee() view returns (uint256)',
  'function capacity() view returns (uint256)',
  'function collectUntil() view returns (uint256)',
  'function expenseUntil() view returns (uint256)',
  'function refundClaimDeadline() view returns (uint256)',
  'function participantCount() view returns (uint256)',
  'function participants(uint256) view returns (address)',
  'function members(address) view returns (bytes32 nameHash, uint256 paid, uint256 refund, bool claimed)',
  'function expenseCount() view returns (uint256)',
  'function expenses(uint256) view returns (address recipient, uint256 cap, uint256 approvedAmount, uint256 paidAmount, bytes32 receiptHash)',
  'function totalCollected() view returns (uint256)',
  'function totalApprovedExpenses() view returns (uint256)',
  'function totalSpent() view returns (uint256)',
  'function totalRefunded() view returns (uint256)',
  'function remainingLiability() view returns (uint256)',
  'function finalized() view returns (bool)',
  'function approveParticipant(address participant, bytes32 nameHash)',
  'function join(bytes32 nameHash) payable',
  'function approveExpense(uint256 expenseId, uint256 amount, bytes32 receiptHash)',
  'function cancelExpenseApproval(uint256 expenseId)',
  'function payApprovedExpense(uint256 expenseId)',
  'function finalize()',
  'function claimRefund(address participant)',
])

export const v4FactoryAbi = parseAbi([
  'function contractVersion() view returns (uint256)',
  'function isEvent(address) view returns (bool)',
  'function createEvent(bytes32 metadataHash, uint256 fee, uint256 capacity, uint256 collectDuration, uint256 expenseDuration, uint256 refundGrace, (address recipient, uint256 cap, uint256 approvedAmount, uint256 paidAmount, bytes32 receiptHash)[] expenseSpecs) returns (address eventAddress)',
  'event EventCreated(address indexed eventAddress, address indexed organizer, bytes32 indexed metadataHash)',
])

