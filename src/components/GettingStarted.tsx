import { ConnectKitButton } from 'connectkit'

export function GettingStarted({ simulation, mainnet, connected, onSimulate }: {
  simulation: boolean; mainnet: boolean; connected: boolean; onSimulate: () => void
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${simulation ? 'bg-violet-100 text-violet-800' : mainnet ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
        {simulation ? 'Simulation · illustrative values · no transactions' : mainnet ? 'Mainnet · real USDC + real fees' : 'Testnet · test USDC + test fees'}
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">A shared budget. A fair way to finish.</h1>
        <p className="mt-2 text-sm text-slate-600">Plan a meetup or a small team purchase. Collect USDC together, approve the venue payment as a group, then return the unused budget to each contributor.</p>
      </div>
      {!simulation && <button onClick={onSimulate} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Try the meetup simulation — no wallet</button>}
      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold">First time? Start here</summary>
        <ol className="list-decimal pl-5 mt-3 space-y-2">
          <li>Try the simulation first. It uses fictional balances and never asks for a signature.</li>
          <li>For Testnet, use an EVM wallet with test USDC. Never enter a recovery phrase into this app.</li>
          <li>Open your organizer’s vault link. Check the network, participants, required approvals and deadlines before connecting.</li>
          <li>Use Contribute in the app: approve the exact amount, then deposit. These are two separate transactions.</li>
          <li>Wait for collection to end. Propose a payment, gather approvals, then execute it. Approval alone does not pay the recipient.</li>
          <li>After the spending deadline or approved early return, submit refunds to original contributor addresses, then Close.</li>
        </ol>
        {!simulation && !connected && <div className="mt-3"><ConnectKitButton /></div>}
      </details>
      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold">Money, fees & refund rules</summary>
        <ul className="list-disc pl-5 mt-3 space-y-2">
          <li>Network fees are paid separately in USDC and are not refunded. Review the maximum fee in your wallet for every transaction.</li>
          <li>Unused funds return in proportion to contributions, with exact rounding at 6 decimals. Refunds require transactions; there is no automatic keeper.</li>
          <li>A quorum can pay any allowed address, including its own. Choose people you trust. Settings and deadlines cannot be changed.</li>
          <li>The guardian can permanently pause new activity. Refunds become available after 24 hours or the spending deadline, whichever is earlier.</li>
          <li>Never transfer tokens or native USDC directly to the vault. Only deposit records contributions. Direct transfers may be permanently stranded, even after Close.</li>
          <li>The existing contract has no deposit cap. This interface limits Mainnet cumulative deposits to 0.10 USDC; other clients and simultaneous transactions can bypass that limit.</li>
          <li>Token freezes can block an individual refund and prevent Close. There is no alternate refund address.</li>
        </ul>
      </details>
      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold">Verified evidence — what has actually happened?</summary>
        <div className="mt-3 space-y-2">
          <p>Mainnet record, 2026-10-20: one contributor deposited 0.27 USDC; 2-of-3 early return; 0.27 refunded; Closed. Recipient payments: none. The original 0.10 principal limit was exceeded. Fees: 0.136070774 USDC across 14 transactions, including Factory deployment.</p>
          <a className="block underline text-blue-700" href="https://github.com/noboru59631/changeback/releases/tag/mainnet-demo-2026-10-20" target="_blank" rel="noopener noreferrer">Mainnet receipts, final accounting & walkthrough</a>
          <a className="block underline text-blue-700" href="https://explorer.arc.io/address/0x8073527729e7c9d1b4630C07f1E8ff48ad8640D0" target="_blank" rel="noopener noreferrer">Mainnet vault on Explorer</a>
          <p>A separate Testnet demonstration includes a 0.03 USDC payment. Testnet and simulation are not Mainnet payment evidence.</p>
          <a className="block underline text-blue-700" href="https://explorer.testnet.arc.io/tx/0x6b9bfade75229751e9480c0ab3142217d3eee73821cb8c43c8267ac0f1ee440e" target="_blank" rel="noopener noreferrer">Testnet payment on Explorer</a>
        </div>
      </details>
    </section>
  )
}
