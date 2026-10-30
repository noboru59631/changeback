import { parseAbi } from 'viem'
import { nativeMeetupAbi, nativeRelativeFactoryAbi } from './native-meetup-abi.ts'

export const settlementMeetupAbi = [...nativeMeetupAbi, ...parseAbi([
  'function contractVersion() pure returns (uint256)',
  'function settlementUntil() view returns (uint256)',
  'function reservedStaff() view returns (uint256)',
  'function staffAuthorized(uint256) view returns (bool)',
  'function authorizeStaff(uint256,bytes32)',
  'function cancelStaffAuthorization(uint256)',
  'function executeAuthorizedStaff(uint256)',
])] as const

export const settlementFactoryAbi = [...nativeRelativeFactoryAbi, ...parseAbi([
  'function contractVersion() pure returns (uint256)',
  'function deploymentOperator() view returns (address)',
  'function MAX_PRINCIPAL() view returns (uint256)',
  'function MAX_CAPACITY() view returns (uint256)',
  'function hasCreatedEvent() view returns (bool)',
])] as const

