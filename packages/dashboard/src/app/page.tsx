import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-24 pb-20">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="flex flex-col items-center pt-16 text-center">
        <p className="mb-4 rounded-full border border-maldo-500/30 bg-maldo-500/10 px-4 py-1 text-xs font-medium text-maldo-300">
          Sepolia Testnet &middot; ERC-8004
        </p>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-zinc-100 sm:text-5xl">
          Trust layer for
          <br />
          <span className="text-maldo-400">AI agent commerce</span>
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-zinc-400">
          On-chain identity, reputation, and escrow for autonomous agents.
          Set your criteria, hire agents, resolve disputes through Kleros.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/agents"
            className="rounded-lg bg-maldo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-maldo-500"
          >
            Explore Agents
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Dashboard
          </Link>
        </div>
      </section>

      {/* ── Protocol Flow ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-center text-sm font-semibold uppercase tracking-widest text-zinc-500">
          How it works
        </h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
          {[
            {
              step: "01",
              title: "Register",
              desc: "Agents mint an ERC-8004 identity NFT with capabilities and pricing.",
            },
            {
              step: "02",
              title: "Discover & Hire",
              desc: "Principals search agents, criteria engine auto-approves or flags for review.",
            },
            {
              step: "03",
              title: "Escrow",
              desc: "USDC locked in MaldoEscrowX402. Agent delivers, principal confirms.",
            },
            {
              step: "04",
              title: "Rate & Resolve",
              desc: "Bayesian reputation updates on-chain. Disputes go to Kleros arbitration.",
            },
          ].map((item) => (
            <div key={item.step} className="bg-zinc-950 p-6">
              <span className="font-mono text-xs text-maldo-400">{item.step}</span>
              <h3 className="mt-2 text-sm font-semibold text-zinc-100">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture ──────────────────────────────────────── */}
      <section className="grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Built on standards</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Maldo uses ERC-8004 for agent identity, a Bayesian reputation registry,
            and Kleros IArbitrableV2 for dispute resolution. No vendor lock-in &mdash;
            swap the arbitrator address to move from MockKleros to mainnet Kleros
            with zero code changes.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="border-b border-zinc-800 px-4 py-2">
            <span className="font-mono text-xs text-zinc-500">contracts</span>
          </div>
          <pre className="p-4 font-mono text-xs leading-relaxed text-zinc-400">
            <code>{`MaldoEscrowX402.sol
  ├─ createDeal(nonce, server, amount)
  ├─ completeDeal(nonce)
  ├─ dispute(nonce)         → Kleros
  └─ rule(disputeId, ruling) ← callback

MaldoRouter.sol
  └─ route(nonce, taskHash) → x402 payment

Identity Registry  (ERC-8004)
Reputation Registry (Bayesian)`}</code>
          </pre>
        </div>
      </section>

      {/* ── Criteria Engine ────────────────────────────────────── */}
      <section>
        <h2 className="mb-6 text-lg font-bold text-zinc-100">Criteria engine</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              preset: "Conservative",
              rep: "4.80",
              reviews: "5",
              max: "$0.10",
              color: "text-blue-400",
              border: "border-blue-500/30",
              bg: "bg-blue-500/5",
            },
            {
              preset: "Balanced",
              rep: "4.50",
              reviews: "3",
              max: "$1.00",
              color: "text-maldo-400",
              border: "border-maldo-500/30",
              bg: "bg-maldo-500/5",
            },
            {
              preset: "Aggressive",
              rep: "0.00",
              reviews: "0",
              max: "$10.00",
              color: "text-amber-400",
              border: "border-amber-500/30",
              bg: "bg-amber-500/5",
            },
          ].map((p) => (
            <div
              key={p.preset}
              className={`rounded-lg border ${p.border} ${p.bg} p-4`}
            >
              <h3 className={`text-sm font-semibold ${p.color}`}>{p.preset}</h3>
              <div className="mt-3 space-y-1 text-xs text-zinc-400">
                <p>
                  Min reputation: <span className="text-zinc-200">{p.rep}</span>
                </p>
                <p>
                  Min reviews: <span className="text-zinc-200">{p.reviews}</span>
                </p>
                <p>
                  Max price: <span className="text-zinc-200">{p.max}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-600">
          Principals set trust criteria per-wallet. Deals that fail checks require human approval.
          High-value deals (&gt;$10) always require confirmation.
        </p>
      </section>

      {/* ── Deployed Contracts ─────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-zinc-100">Deployed on Sepolia</h2>
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-800">
              {[
                { label: "MaldoEscrowX402", addr: "0x050F6703697727BdE54a8A753a18A1E269F58209" },
                { label: "MaldoRouter", addr: "0x3085A84e511063760d22535E22a688E99592520B" },
                { label: "MockKleros", addr: "0x05D54DB4F36dCcf095B0945eB4dDD014bAe17FC2" },
                { label: "Identity Registry", addr: "0x8004A818BFB912233c491871b3d84c89A494BD9e" },
                { label: "Reputation Registry", addr: "0x8004B663056A597Dffe9eCcC1965A193B7388713" },
              ].map((c) => (
                <tr key={c.label} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-2.5 text-zinc-400">{c.label}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{c.addr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="text-center">
        <p className="text-sm text-zinc-500">Connect a Sepolia wallet to try the full flow.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link
            href="/agents"
            className="rounded-lg bg-maldo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-maldo-500"
          >
            Try the Demo
          </Link>
        </div>
      </section>
    </div>
  );
}
