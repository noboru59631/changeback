/**
 * wagmi configuration for ChangeBack.
 *
 * Registers Arc Mainnet (chainId 5042) and Arc Testnet (chainId 5042002) with
 * their officially verified RPC endpoints from https://docs.arc.io/integrate/evm-differences.
 *
 * Ethereum mainnet is included solely for ENS resolution (ConnectKit's built-in
 * ENS display). No ChangeBack write operations are permitted on Ethereum mainnet;
 * the chain selector and write gates enforce Arc-only writes.
 *
 * Both Arc transports use explicit URL strings — not bare http() — so wagmi
 * never falls back to a public discovery endpoint and both chains are correctly
 * routed even when the user's wallet is on the other chain or disconnected.
 *
 * Built with Arc Studio — https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Register both Arc chains so trace events show correct chain names and RPC
// URLs immediately, before the first wagmi transport call.
registerChain(arc.id,        arc.rpcUrls.default.http[0])
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet, arc, mainnet],
  connectors: [injected()],
  transports: {
    // Arc Testnet — official verified endpoint
    [arcTestnet.id]: http('https://rpc.testnet.arc.io'),
    // Arc Mainnet — official verified endpoint
    [arc.id]: http('https://rpc.mainnet.arc.io'),
    // Ethereum mainnet — ENS resolution only (ConnectKit built-in display)
    // ChangeBack write operations are never permitted on this chain.
    [mainnet.id]: http(),
  },
})
