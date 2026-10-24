import { parseAbi } from 'viem'

export const nativeMeetupAbi = parseAbi([
  'function organizer() view returns (address)',
  'function createdAtBlock() view returns (uint256)',
  'function terms() view returns (bytes32 metadataHash,uint256 fee,uint256 capacity,uint256 collectUntil,uint256 spendUntil,bool showStaffAmounts)',
  'function participantCount() view returns (uint256)',
  'function participants(uint256) view returns (address)',
  'function members(address) view returns (bytes32 nameHash,uint256 paid,uint256 entitlement,uint256 transfers,uint256 approvalUntil,bool claimed)',
  'function budgetCount() view returns (uint256)',
  'function budgets(uint256) view returns (address recipient,uint256 cap,uint8 category,uint256 payAfter,bool automatic)',
  'function budgetSpent(uint256) view returns (uint256)',
  'function totalCollected() view returns (uint256)',
  'function totalSpent() view returns (uint256)',
  'function totalRefunded() view returns (uint256)',
  'function remainingLiability() view returns (uint256)',
  'function unaccountedBalance() view returns (uint256)',
  'function finalized() view returns (bool)',
  'function approveApplicant(address,bytes32,uint256)',
  'function revokeUnpaid(address)',
  'function executeScheduled(uint256)',
  'function spend(uint256,uint256,bytes32)',
  'function finalize()',
  'function refundFor(address)',
  'function refundBatch(address[])',
  'event NativePaid(address indexed payer,uint256 amount,uint256 cumulative)',
  'event Approved(address indexed payer,bytes32 nameHash,uint256 approvalUntil)',
])

export const nativeFactoryAbi = parseAbi([
  'function isEvent(address) view returns (bool)',
  'function createEvent((bytes32 metadataHash,uint256 fee,uint256 capacity,uint256 collectUntil,uint256 spendUntil,bool showStaffAmounts),(address recipient,uint256 cap,uint8 category,uint256 payAfter,bool automatic)[]) returns (address)',
  'event EventCreated(address indexed escrow,address indexed organizer,bytes32 indexed metadataHash)',
])
