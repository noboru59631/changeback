/**
 * ChangeBack — application constants.
 *
 * Supports both Arc Testnet (chainId 5042002) and Arc Mainnet (chainId 5042).
 * All write operations are disabled until the user's connected chain matches a
 * verified deployment configuration. Reviewed factories are listed below;
 * vault and factory addresses are entered at runtime.
 *
 * Mainnet writes require explicit reviewed deployment config (factory address +
 * chain confirmation) and are never unlocked by merely connecting to mainnet.
 *
 * Gas on Arc uses 18 decimals (native); USDC ERC-20 uses 6 decimals.
 * These are the same pool of funds — never double-count them.
 */

import { getUsdc, requireChain } from '@/onchain-facts'

// ─── Chain IDs ────────────────────────────────────────────────────────────────

export const ARC_TESTNET_CHAIN_ID  = 5042002
export const ARC_MAINNET_CHAIN_ID  = 5042

export const SUPPORTED_CHAIN_IDS: readonly number[] = [
  ARC_TESTNET_CHAIN_ID,
  ARC_MAINNET_CHAIN_ID,
]

// ─── Per-chain config ─────────────────────────────────────────────────────────

interface ChainConfig {
  readonly chainId:       number
  readonly label:         string
  readonly explorerBase:  string
  readonly isTestnet:     boolean
  /** USDC ERC-20 address on this chain (6 dp). */
  readonly usdcAddress:   `0x${string}`
  /** USDC ERC-20 decimals (always 6 on Arc). */
  readonly usdcDecimals:  number
  /** Native gas token decimals (18 on Arc). */
  readonly gasDecimals:   number
}

function buildChainConfig(chainId: number, label: string, isTestnet: boolean): ChainConfig {
  const chain = requireChain(chainId)
  const usdc  = getUsdc(chainId)
  if (!usdc) throw new Error(`USDC not found for chain ${chainId} in onchain-facts`)
  return {
    chainId,
    label,
    explorerBase:  chain.explorerBase,
    isTestnet,
    usdcAddress:   usdc.address as `0x${string}`,
    usdcDecimals:  usdc.decimals,
    gasDecimals:   chain.nativeCurrency.decimals,
  }
}

export const CHAIN_CONFIG: Record<number, ChainConfig> = {
  [ARC_TESTNET_CHAIN_ID]: buildChainConfig(ARC_TESTNET_CHAIN_ID, 'Arc Testnet', true),
  [ARC_MAINNET_CHAIN_ID]: buildChainConfig(ARC_MAINNET_CHAIN_ID, 'Arc Mainnet', false),
}

/**
 * Returns the config for the given chainId, or undefined if not supported.
 * UI must treat undefined as "wrong network" and show a chain-switch prompt.
 */
export function getChainConfig(chainId: number | undefined): ChainConfig | undefined {
  if (chainId === undefined) return undefined
  return CHAIN_CONFIG[chainId]
}

// ─── Fallback (Arc Testnet) for non-chain-specific utilities ─────────────────

const testnetConfig = CHAIN_CONFIG[ARC_TESTNET_CHAIN_ID]

/** Arc Testnet chain ID. Components use this as the default read chain. */
export const TARGET_CHAIN_ID = ARC_TESTNET_CHAIN_ID

/** @deprecated Prefer getChainConfig(chainId).usdcAddress */
export const USDC_ADDRESS   = testnetConfig.usdcAddress
/** @deprecated Prefer getChainConfig(chainId).usdcDecimals */
export const USDC_DECIMALS  = testnetConfig.usdcDecimals

// ─── Reviewed factory registry ───────────────────────────────────────────────
//
// Allowlist of factory addresses that have been independently reviewed and
// approved for each chain.
//
// Arc Testnet entry added 2026-10-16 after explicit user approval:
//   "TestnetへのFactory配備のみ許可" — Factory deployment on Testnet only.
//   Deployed factory address verified against SHA256
//   2B93EFF082DB65ED3A9726EAA56A2169408DEC68AA295FA570CCF5A1D9095E42
//   and confirmed via read-only getters (USDC_ADDRESS, ARC_TESTNET_CHAIN_ID,
//   ARC_MAINNET_CHAIN_ID, vaultCount). Receipt data supplied by user/coordinator.
//
// Arc Mainnet deployment approved and runtime verified on 2026-10-19.
//
// INVARIANT: write operations are disabled unless the user-provided factory
// address appears in this list for the selected chain. Runtime user-pasted
// addresses and a passing factory.isVault() call alone do NOT unlock writes.

export const REVIEWED_FACTORY_ADDRESSES: Readonly<Record<number, readonly `0x${string}`[]>> = {
  [ARC_TESTNET_CHAIN_ID]: [
    '0x0cf03f85278a7d1ce3057b77043e1b9af3da2ec0',  // ChangeBackFactory — deployed 2026-10-16
  ],
  [ARC_MAINNET_CHAIN_ID]: ['0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb'],
}

/**
 * Returns true only when `factoryAddress` appears in the reviewed allowlist
 * for `chainId`. False for unknown chains, missing addresses, loading states,
 * or any runtime-pasted address not in the allowlist.
 */
export function isReviewedFactory(
  chainId: number | undefined,
  factoryAddress: string,
): boolean {
  if (!chainId) return false
  const allowed = REVIEWED_FACTORY_ADDRESSES[chainId]
  if (!allowed) return false
  return allowed.some(a => a.toLowerCase() === factoryAddress.toLowerCase())
}

// ─── Phase enum ───────────────────────────────────────────────────────────────

/** Phase enum values matching Solidity Phase enum (index order). */
export const Phase = {
  Collecting: 0,
  Active:     1,
  Returning:  2,
  Closed:     3,
} as const
export type PhaseValue = (typeof Phase)[keyof typeof Phase]

export const PHASE_LABELS: Record<number, string> = {
  [Phase.Collecting]: 'Collecting',
  [Phase.Active]:     'Active',
  [Phase.Returning]:  'Returning',
  [Phase.Closed]:     'Closed',
}

export const STEP_LABELS = ['Create', 'Collect', 'Approve', 'Spend', 'Return', 'Close']
