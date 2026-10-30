import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import './proof.css'

const links = {
  studio: 'https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710',
  github: 'https://github.com/noboru59631/changeback',
  dorahacks: 'https://dorahacks.io/build/50059',
  factory: 'https://explorer.arc.io/address/0xAEE87C6fcB12023BAEE096e2B01d8667626f8a36',
  event: 'https://explorer.arc.io/address/0xfaA58b67BF24Bc9AB92959339105F6e59901d323',
  staff: 'https://explorer.arc.io/tx/0xb8f6aa0445d70c3f02d9e866e6fba09b4be9ba522ba0edbb9d5851c50812995c',
  finalize: 'https://explorer.arc.io/tx/0xeb1ecd0bf3edbb37d3eeb8653b5c3f31a3a7c8ed3958d12cbd87fefab1584747',
  refunds: 'https://explorer.arc.io/tx/0x42a04254eed02d6313b9b11f70eede4a3b34ab7892d1e39acbcb57dbb5f9bbe1',
  legacy: 'https://changeback-arc.crypto5555111.chatgpt.site/?chainId=5042&factory=0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb&vault=0x8073527729e7c9d1b4630C07f1E8ff48ad8640D0',
  video: '/ChangeBack-v3-Arc-Mainnet-proof-demo-2026-10-31.mp4',
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer">{children}<span aria-hidden="true"> ↗</span></a>
}

function App() {
  return <main>
    <nav aria-label="Evidence links">
      <span className="brand"><span className="mark">CB</span> ChangeBack</span>
      <div className="navlinks"><ExternalLink href={links.video}>42s video</ExternalLink><ExternalLink href={links.studio}>Arc Studio</ExternalLink><ExternalLink href={links.github}>GitHub</ExternalLink><ExternalLink href={links.dorahacks}>DoraHacks</ExternalLink></div>
    </nav>

    <header className="hero">
      <div className="eyebrow"><span className="pulse" /> ARC MAINNET · VERIFIED PROOF</div>
      <h1>Every unused unit<br />returned.</h1>
      <p className="lead">ChangeBack v3 settled a bounded small-event budget on Arc Mainnet: two participant deposits, one preauthorized staff payment, finalization, and exact refunds to the original senders.</p>
      <div className="equation"><strong>0.020</strong><span>USDC collected</span><b>=</b><strong>0.002</strong><span>paid</span><b>+</b><strong>0.018</strong><span>refunded</span></div>
      <p className="jp">参加者の初回入金後、事前ルールに従いスタッフ支払と残額返金を完了。最終残高・未返金債務はいずれも0です。</p>
    </header>

    <section className="stats" aria-label="Final accounting">
      <article><span>PARTICIPANT A</span><strong>0.009</strong><small>USDC refunded</small></article>
      <article><span>PARTICIPANT B</span><strong>0.009</strong><small>USDC refunded</small></article>
      <article><span>ESCROW BALANCE</span><strong>0</strong><small>USDC remaining</small></article>
      <article><span>REFUND LIABILITY</span><strong>0</strong><small>USDC outstanding</small></article>
    </section>

    <section className="evidence">
      <div>
        <p className="kicker">ONCHAIN EVIDENCE</p>
        <h2>Receipts, not promises.</h2>
        <p>Factory and Event independently report <code>contractVersion=3</code>. Both participant records report <code>claimed=true</code>.</p>
      </div>
      <ol>
        <li><span>01</span><div><strong>Staff settlement · 0.002 USDC</strong><ExternalLink href={links.staff}>View transaction</ExternalLink></div></li>
        <li><span>02</span><div><strong>Event finalized</strong><ExternalLink href={links.finalize}>View transaction</ExternalLink></div></li>
        <li><span>03</span><div><strong>Final refunds · 0.018 USDC</strong><ExternalLink href={links.refunds}>View transaction</ExternalLink></div></li>
      </ol>
    </section>

    <section className="contracts">
      <div><span>V3 FACTORY</span><code>0xAEE87C6fcB12023BAEE096e2B01d8667626f8a36</code><ExternalLink href={links.factory}>Inspect contract</ExternalLink></div>
      <div><span>DEMONSTRATION EVENT</span><code>0xfaA58b67BF24Bc9AB92959339105F6e59901d323</code><ExternalLink href={links.event}>Inspect contract</ExternalLink></div>
    </section>

    <section className="scope">
      <div><p className="kicker coral">HONEST SCOPE</p><h2>What this proof does — and does not — show.</h2></div>
      <ul>
        <li className="yes">Demonstrated: deposits, bounded staff settlement, finalization, and original-sender refunds.</li>
        <li className="no">Not demonstrated: the scheduled venue payment; its configured time window had passed.</li>
        <li className="no">Not claimed: fully unattended production service, hosted keeper SLA, or independent audit.</li>
      </ul>
    </section>

    <footer><p>This is a read-only evidence page. It cannot request a wallet signature or move funds.</p><p><ExternalLink href={links.video}>Watch the 42-second evidence video</ExternalLink> · <ExternalLink href={links.legacy}>Preserved historical UI</ExternalLink> · Built with <ExternalLink href={links.studio}>Arc Studio</ExternalLink></p></footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)

