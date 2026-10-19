/**
 * Mechanically generates src/lib/abi.ts from compiled Foundry artifacts.
 * Run after `forge build`:  bun run scripts/generate-abi.ts
 *
 * Reads:
 *   contracts/out/ChangeBackVault.sol/ChangeBackVault.json
 *   contracts/out/ChangeBackFactory.sol/ChangeBackFactory.json
 *
 * Writes:
 *   src/lib/abi.ts
 *
 * The ERC20_APPROVE_ABI is a well-known two-entry fragment appended verbatim
 * since it is not part of the ChangeBack contracts.
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readArtifact(path: string): unknown[] {
  const raw = readFileSync(resolve(ROOT, path), 'utf8')
  const artifact = JSON.parse(raw) as { abi: unknown[] }
  if (!Array.isArray(artifact.abi)) {
    throw new Error(`No abi array in ${path}`)
  }
  return artifact.abi
}

// ─── Read compiled artifacts ──────────────────────────────────────────────────

const vaultAbi   = readArtifact('contracts/out/ChangeBackVault.sol/ChangeBackVault.json')
const factoryAbi = readArtifact('contracts/out/ChangeBackFactory.sol/ChangeBackFactory.json')

// ─── ERC-20 approve fragment (standard, not from our contracts) ───────────────

const erc20ApproveAbi = [
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs:  [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs:  [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
]

// ─── Emit TypeScript ──────────────────────────────────────────────────────────

const vaultJson   = JSON.stringify(vaultAbi,   null, 2)
const factoryJson = JSON.stringify(factoryAbi, null, 2)
const erc20Json   = JSON.stringify(erc20ApproveAbi, null, 2)

const banner = `/**
 * Mechanically generated from Foundry artifacts.
 * DO NOT EDIT by hand — run: bun run scripts/generate-abi.ts
 * Source artifacts:
 *   contracts/out/ChangeBackVault.sol/ChangeBackVault.json
 *   contracts/out/ChangeBackFactory.sol/ChangeBackFactory.json
 * ERC20_APPROVE_ABI is the standard ERC-20 approve/allowance fragment.
 */
`

const output = `${banner}
export const VAULT_ABI = ${vaultJson} as const

export const FACTORY_ABI = ${factoryJson} as const

export const ERC20_APPROVE_ABI = ${erc20Json} as const
`

const outPath = resolve(ROOT, 'src/lib/abi.ts')
writeFileSync(outPath, output, 'utf8')
console.log(`Written: ${outPath}`)
console.log(`  VAULT_ABI:   ${vaultAbi.length} entries`)
console.log(`  FACTORY_ABI: ${factoryAbi.length} entries`)
