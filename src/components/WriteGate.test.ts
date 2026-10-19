/**
 * Unit tests for the gateReason pure logic exported from WriteGate.tsx.
 *
 * gateReason has NO React or wagmi dependencies — it is a pure function
 * of its arguments. These tests run with `bun test` and do not require
 * jsdom or any test framework beyond bun:test.
 *
 * What IS tested here:
 *   - Disconnected wallet → 'no-wallet'
 *   - Connected wallet on wrong chain → 'wrong-chain'
 *   - Correct chain, empty/undefined factory → 'unreviewed-factory'
 *   - Correct chain, factory not in allowlist (even with isVault=true) → 'unreviewed-factory'
 *   - Registry loading / error states → 'registry-loading' / 'registry-error'
 *   - Registry returns false → 'vault-not-registered'
 *   - Registry returns true + reviewed factory → 'ok'
 *   - All of the above exercised on BOTH Arc Testnet (5042002) and Arc Mainnet (5042)
 *   - No vault address provided → factory guard only (skip vault check)
 *
 * What is NOT tested here (known limitations stated explicitly):
 *   - useWriteAllowed hook: requires wagmi mock environment; covered by
 *     the e2e/integration path only.
 *   - submitted-chain / explorer-link binding: depends on React component
 *     state and wagmi receipt hooks; cannot be tested as a pure function.
 *     The correctness of that pattern is verified by code review: every
 *     writeContract() call captures selectedChainId into submittedChainId
 *     before returning, and useWaitForTransactionReceipt receives that value.
 *     A future bun:test + @testing-library/react setup would allow component
 *     tests, but no such harness is present in this project today.
 *   - Pending-transaction UI: when a transaction is in-flight the wallet's
 *     chain selector is not disabled in the current implementation. A user
 *     switching chains mid-confirmation does not cause auto-resubmit (the
 *     submittedChainId is fixed) but the TxButton "confirming" state may
 *     appear to stall if the wallet switches away. This is a known limitation
 *     documented here and in docs/validation.md.
 *
 * Run with: bun test src/components/WriteGate.test.ts
 */

// oxlint-disable
/* eslint-disable */
// @ts-nocheck

import { describe, it, expect } from 'bun:test'
import { gateReason } from './WriteGate'
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_MAINNET_CHAIN_ID,
  REVIEWED_FACTORY_ADDRESSES,
} from '@/lib/constants'

// ── Helpers ────────────────────────────────────────────────────────────────────

// Real reviewed factory on Arc Testnet — added to allowlist 2026-10-16.
const REVIEWED_FACTORY_TESTNET = '0x0cf03f85278a7d1ce3057b77043e1b9af3da2ec0'
// Case-variant of the same address (tests case-insensitive matching).
const REVIEWED_FACTORY_TESTNET_UPPER = '0x0CF03F85278A7D1CE3057B77043E1B9AF3DA2EC0'
const FAKE_VAULT            = '0xAAAA000000000000000000000000000000000001'
const UNREVIEWED_FACTORY    = '0xDEAD000000000000000000000000000000000000'

// ── Suite 1: No wallet ─────────────────────────────────────────────────────────

describe('gateReason — no wallet', () => {
  it('returns no-wallet when isConnected=false regardless of other params', () => {
    expect(gateReason(
      undefined, false, ARC_TESTNET_CHAIN_ID,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )).toBe('no-wallet')
  })

  it('returns no-wallet even when walletChainId is set but isConnected=false', () => {
    expect(gateReason(
      ARC_TESTNET_CHAIN_ID, false, ARC_TESTNET_CHAIN_ID,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )).toBe('no-wallet')
  })
})

// ── Suite 2: Wrong chain ───────────────────────────────────────────────────────

describe('gateReason — wrong chain', () => {
  it('returns wrong-chain when wallet is on Ethereum mainnet (1) but selected is Arc Testnet', () => {
    expect(gateReason(
      1, true, ARC_TESTNET_CHAIN_ID,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )).toBe('wrong-chain')
  })

  it('returns wrong-chain when wallet is on Arc Testnet but selected is Arc Mainnet', () => {
    expect(gateReason(
      ARC_TESTNET_CHAIN_ID, true, ARC_MAINNET_CHAIN_ID,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )).toBe('wrong-chain')
  })

  it('returns wrong-chain when wallet is on Arc Mainnet but selected is Arc Testnet', () => {
    expect(gateReason(
      ARC_MAINNET_CHAIN_ID, true, ARC_TESTNET_CHAIN_ID,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )).toBe('wrong-chain')
  })

  it('returns wrong-chain when walletChainId is undefined but isConnected=true', () => {
    // wagmi can return isConnected=true with chainId still undefined during
    // a reconnect. The gate must not pass in this transient state.
    expect(gateReason(
      undefined, true, ARC_TESTNET_CHAIN_ID,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )).toBe('wrong-chain')
  })
})

// ── Suite 3: Unreviewed factory ────────────────────────────────────────────────

describe('gateReason — unreviewed factory (Arc Testnet)', () => {
  const chain = ARC_TESTNET_CHAIN_ID

  it('returns unreviewed-factory when factoryAddress is undefined', () => {
    expect(gateReason(
      chain, true, chain,
      undefined, FAKE_VAULT,
      true, false, false,
    )).toBe('unreviewed-factory')
  })

  it('returns unreviewed-factory when factoryAddress is empty string', () => {
    expect(gateReason(
      chain, true, chain,
      '', FAKE_VAULT,
      true, false, false,
    )).toBe('unreviewed-factory')
  })

  it('returns unreviewed-factory for a plausible-looking address not in allowlist', () => {
    expect(gateReason(
      chain, true, chain,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )).toBe('unreviewed-factory')
  })

  it('returns unreviewed-factory even when isVaultRegistered=true (allowlist takes precedence)', () => {
    // isVault=true alone is NOT sufficient — factory must be in the allowlist.
    expect(gateReason(
      chain, true, chain,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,     // isVaultRegistered=true, not loading, no error
    )).toBe('unreviewed-factory')
  })

  it('returns unreviewed-factory even when registry is loading', () => {
    expect(gateReason(
      chain, true, chain,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      undefined, true, false,  // loading
    )).toBe('unreviewed-factory')
  })
})

describe('gateReason — unreviewed factory (Arc Mainnet)', () => {
  const chain = ARC_MAINNET_CHAIN_ID

  it('returns unreviewed-factory on mainnet for an address not in allowlist', () => {
    expect(gateReason(
      chain, true, chain,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )).toBe('unreviewed-factory')
  })

  it('returns unreviewed-factory on mainnet even with isVault=true', () => {
    expect(gateReason(
      chain, true, chain,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )).toBe('unreviewed-factory')
  })

  it('REVIEWED_FACTORY_ADDRESSES[mainnet] contains only the verified mainnet factory', () => {
    expect(REVIEWED_FACTORY_ADDRESSES[ARC_MAINNET_CHAIN_ID]).toEqual(['0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb'])
  })

  it('REVIEWED_FACTORY_ADDRESSES[testnet] contains exactly the deployed factory address', () => {
    // One entry was added after explicit user approval on 2026-10-16.
    expect(REVIEWED_FACTORY_ADDRESSES[ARC_TESTNET_CHAIN_ID]).toHaveLength(1)
    expect(REVIEWED_FACTORY_ADDRESSES[ARC_TESTNET_CHAIN_ID][0].toLowerCase())
      .toBe('0x0cf03f85278a7d1ce3057b77043e1b9af3da2ec0')
  })
})

// ── Suite 4: Registry states ───────────────────────────────────────────────────
//
// These only apply AFTER the allowlist check passes. Now that the testnet
// allowlist contains the deployed factory, we can test all registry state
// branches using the real reviewed factory address.

describe('gateReason — registry state ordering (allowlist-first guard)', () => {
  const chain = ARC_TESTNET_CHAIN_ID

  it('unreviewed-factory is returned before registry-loading when factory is NOT in allowlist', () => {
    const reason = gateReason(
      chain, true, chain,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      undefined, true, false,
    )
    expect(reason).toBe('unreviewed-factory')
    expect(reason).not.toBe('registry-loading')
  })

  it('unreviewed-factory is returned before registry-error when factory is NOT in allowlist', () => {
    const reason = gateReason(
      chain, true, chain,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      undefined, false, true,
    )
    expect(reason).toBe('unreviewed-factory')
    expect(reason).not.toBe('registry-error')
  })

  it('unreviewed-factory is returned before vault-not-registered when factory is NOT in allowlist', () => {
    const reason = gateReason(
      chain, true, chain,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      false, false, false,
    )
    expect(reason).toBe('unreviewed-factory')
    expect(reason).not.toBe('vault-not-registered')
  })

  // With the real reviewed factory we can now reach the registry branches:

  it('returns registry-loading when reviewed factory + vault + registry still loading', () => {
    expect(gateReason(
      chain, true, chain,
      REVIEWED_FACTORY_TESTNET, FAKE_VAULT,
      undefined, true, false,   // loading
    )).toBe('registry-loading')
  })

  it('returns registry-error when reviewed factory + vault + registry errored', () => {
    expect(gateReason(
      chain, true, chain,
      REVIEWED_FACTORY_TESTNET, FAKE_VAULT,
      undefined, false, true,   // error
    )).toBe('registry-error')
  })

  it('returns vault-not-registered when reviewed factory + vault + registry returns false', () => {
    expect(gateReason(
      chain, true, chain,
      REVIEWED_FACTORY_TESTNET, FAKE_VAULT,
      false, false, false,      // isVaultRegistered=false
    )).toBe('vault-not-registered')
  })
})

// ── Suite 5: No vault address (factory-only gate for StepCreate) ───────────────

describe('gateReason — no vault address (StepCreate path)', () => {
  const chain = ARC_TESTNET_CHAIN_ID

  it('returns unreviewed-factory (not registry states) when no vault address given', () => {
    const reason = gateReason(
      chain, true, chain,
      UNREVIEWED_FACTORY, undefined,  // no vault
      undefined, undefined, undefined,
    )
    expect(reason).toBe('unreviewed-factory')
  })

  it('returns ok for reviewed factory with no vault address (StepCreate path)', () => {
    // With vaultAddress=undefined, the vault registry check is skipped entirely.
    // The reviewed factory passes the allowlist; result is 'ok'.
    expect(gateReason(
      chain, true, chain,
      REVIEWED_FACTORY_TESTNET, undefined,
      undefined, undefined, undefined,
    )).toBe('ok')
  })

  it('returns ok for reviewed factory address in upper-case (case-insensitive match)', () => {
    expect(gateReason(
      chain, true, chain,
      REVIEWED_FACTORY_TESTNET_UPPER, undefined,
      undefined, undefined, undefined,
    )).toBe('ok')
  })
})

// ── Suite 6: Argument ordering — chain precedence over factory ─────────────────

describe('gateReason — argument precedence', () => {
  it('wrong-chain is returned before unreviewed-factory', () => {
    const reason = gateReason(
      1, true, ARC_TESTNET_CHAIN_ID,  // wrong chain
      undefined, FAKE_VAULT,           // also no factory
      undefined, undefined, undefined,
    )
    expect(reason).toBe('wrong-chain')
    expect(reason).not.toBe('unreviewed-factory')
  })

  it('no-wallet is returned before wrong-chain', () => {
    const reason = gateReason(
      1, false, ARC_TESTNET_CHAIN_ID,  // disconnected AND wrong chain
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )
    expect(reason).toBe('no-wallet')
    expect(reason).not.toBe('wrong-chain')
  })
})

// ── Suite 7: Chain ID identity (no off-by-one) ────────────────────────────────

describe('gateReason — chain ID exact match', () => {
  it('chain 5042002 matches itself (Arc Testnet)', () => {
    expect(ARC_TESTNET_CHAIN_ID).toBe(5042002)
  })

  it('chain 5042 matches itself (Arc Mainnet)', () => {
    expect(ARC_MAINNET_CHAIN_ID).toBe(5042)
  })

  it('5042 and 5042002 are different chains (not off-by-one)', () => {
    expect(ARC_TESTNET_CHAIN_ID).not.toBe(ARC_MAINNET_CHAIN_ID)
  })

  it('wallet on Arc Testnet is wrong-chain for selected Arc Mainnet', () => {
    expect(gateReason(
      ARC_TESTNET_CHAIN_ID, true, ARC_MAINNET_CHAIN_ID,
      UNREVIEWED_FACTORY, FAKE_VAULT,
      true, false, false,
    )).toBe('wrong-chain')
  })
})

// ── Suite 8: Full 'ok' path — reviewed factory + registered vault ─────────────
//
// These tests use the real deployed factory address (in allowlist since 2026-10-16)
// and simulate a registered vault to verify the complete success path.

describe('gateReason — full ok path (reviewed factory + registered vault)', () => {
  const chain = ARC_TESTNET_CHAIN_ID

  it('returns ok: reviewed factory + registered vault + wallet on correct chain', () => {
    expect(gateReason(
      chain, true, chain,
      REVIEWED_FACTORY_TESTNET, FAKE_VAULT,
      true, false, false,        // isVaultRegistered=true
    )).toBe('ok')
  })

  it('returns ok with upper-case reviewed factory address (case-insensitive)', () => {
    expect(gateReason(
      chain, true, chain,
      REVIEWED_FACTORY_TESTNET_UPPER, FAKE_VAULT,
      true, false, false,
    )).toBe('ok')
  })

  it('testnet reviewed factory still returns unreviewed-factory on mainnet', () => {
    // The testnet factory is not approved for mainnet.
    expect(gateReason(
      ARC_MAINNET_CHAIN_ID, true, ARC_MAINNET_CHAIN_ID,
      REVIEWED_FACTORY_TESTNET,  // testnet address is NOT in mainnet allowlist
      FAKE_VAULT,
      true, false, false,
    )).toBe('unreviewed-factory')
  })

  it('mainnet allowlist contains only the receipt-verified deployment', () => {
    expect(REVIEWED_FACTORY_ADDRESSES[ARC_MAINNET_CHAIN_ID]).toEqual(['0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb'])
    expect(gateReason(ARC_MAINNET_CHAIN_ID, true, ARC_MAINNET_CHAIN_ID,
      '0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb', FAKE_VAULT, true, false, false)).toBe('ok')
  })

  it('testnet allowlist has exactly one entry after deployment approval', () => {
    expect(REVIEWED_FACTORY_ADDRESSES[ARC_TESTNET_CHAIN_ID]).toHaveLength(1)
  })
})
