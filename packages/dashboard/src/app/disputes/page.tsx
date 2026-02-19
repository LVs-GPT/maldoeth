"use client";

import { useEffect, useState, useCallback } from "react";
import { listDeals, resolveDispute } from "@/lib/api";

interface Deal {
  nonce: string;
  deal_id: number;
  client: string;
  server: string;
  amount: number;
  status: string;
  task_description?: string;
  created_at: string;
}

const RULING_OPTIONS = [
  { value: 1, label: "Buyer wins", description: "Refund USDC to client", color: "var(--blue)" },
  { value: 2, label: "Seller wins", description: "Release USDC to server", color: "var(--green)" },
  { value: 0, label: "Split 50/50", description: "Split equally between parties", color: "var(--yellow)" },
];

export default function DisputesPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listDeals();
      setDeals((data.deals || []).filter((d: Deal) => d.status === "Disputed"));
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleResolve = async (deal: Deal, ruling: number) => {
    const label = RULING_OPTIONS.find((o) => o.value === ruling)?.label || "Unknown";
    if (!confirm(`Confirm ruling: "${label}" for deal ${deal.nonce.slice(0, 10)}...?`)) return;

    setResolving(deal.nonce);
    try {
      await resolveDispute(deal.nonce, ruling);
      setResolved((prev) => ({ ...prev, [deal.nonce]: label }));
      setTimeout(() => loadData(), 1500);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setResolving(null);
    }
  };

  const disputeCount = deals.length;

  return (
    <div className="space-y-10 pt-16">
      {/* Header */}
      <header>
        <div className="flex items-center gap-3">
          <div className="section-label" style={{ color: "var(--red)" }}>Dispute Resolution</div>
          <span className="tag border-[rgba(255,68,68,0.3)] text-[var(--red)] text-[10px]">
            JUROR PANEL
          </span>
        </div>
        <p className="mt-2 text-[13px] text-[var(--mid)] leading-[1.7] max-w-[580px]">
          Review disputed deals and issue rulings. In production this is handled by Kleros
          jurors. For the demo, you act as the arbitrator.
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3">
        <div className="bg-[var(--bg)] p-7">
          <p className="text-[11px] text-[var(--mid)] tracking-[0.05em]">Open Disputes</p>
          <p className={`mt-2 text-[clamp(28px,4vw,42px)] font-bold tabular-nums leading-none tracking-tight ${
            disputeCount > 0 ? "text-[var(--red)]" : "text-[var(--foreground)]"
          }`}>
            {disputeCount}
          </p>
        </div>
        <div className="bg-[var(--bg)] p-7">
          <p className="text-[11px] text-[var(--mid)] tracking-[0.05em]">Arbitrator</p>
          <p className="mt-2 text-sm font-bold text-[var(--foreground)]">MockKleros</p>
        </div>
        <div className="bg-[var(--bg)] p-7">
          <p className="text-[11px] text-[var(--mid)] tracking-[0.05em]">Network</p>
          <p className="mt-2 text-sm font-bold text-[var(--green)]">Sepolia</p>
        </div>
      </div>

      <hr className="section-rule" />

      {/* Disputes list */}
      {loading ? (
        <div className="flex items-center gap-3 py-8 text-[var(--mid)]">
          <span className="cursor-blink" />
          <span className="text-xs">Loading disputes&hellip;</span>
        </div>
      ) : deals.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] p-10 text-center">
          <p className="text-sm text-[var(--mid)]">No open disputes</p>
          <p className="mt-1 text-[11px] text-[var(--dim)]">
            Disputes will appear here when a client opens one from their dashboard.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {deals.map((deal) => (
            <div
              key={deal.nonce}
              className="border border-[var(--border)] bg-[var(--bg)] overflow-hidden"
            >
              {/* Deal header */}
              <div className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="tag border-[rgba(255,68,68,0.3)] text-[var(--red)]">
                    DISPUTED
                  </span>
                  <span className="text-xs tabular-nums text-[var(--mid)]">
                    {deal.nonce.slice(0, 18)}&hellip;
                  </span>
                </div>
                <span className="text-sm font-bold tabular-nums text-[var(--foreground)]">
                  ${(deal.amount / 1e6).toFixed(2)} USDC
                </span>
              </div>

              {/* Deal details */}
              <div className="px-6 py-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] text-[var(--dim)] tracking-[0.1em] mb-1">CLIENT (BUYER)</p>
                  <p className="text-xs tabular-nums text-[var(--mid)]">
                    {deal.client.slice(0, 6)}&hellip;{deal.client.slice(-4)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--dim)] tracking-[0.1em] mb-1">SERVER (SELLER)</p>
                  <p className="text-xs tabular-nums text-[var(--mid)]">
                    {deal.server.slice(0, 6)}&hellip;{deal.server.slice(-4)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--dim)] tracking-[0.1em] mb-1">DATE</p>
                  <p className="text-xs tabular-nums text-[var(--mid)]">
                    {new Date(deal.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--dim)] tracking-[0.1em] mb-1">TASK</p>
                  <p className="text-xs text-[var(--mid)] truncate">
                    {deal.task_description || "No description"}
                  </p>
                </div>
              </div>

              {/* Ruling actions */}
              <div className="border-t border-[var(--border)] px-6 py-4">
                {resolved[deal.nonce] ? (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <span className="status-dot bg-[var(--green)]" />
                    <span className="text-xs text-[var(--green)]">
                      Resolved: {resolved[deal.nonce]}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] text-[var(--dim)] mr-2">Issue ruling:</span>
                    {RULING_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleResolve(deal, opt.value)}
                        disabled={resolving === deal.nonce}
                        className="btn py-1.5 px-4 text-xs border transition-colors"
                        style={{
                          borderColor: `color-mix(in srgb, ${opt.color} 40%, transparent)`,
                          color: opt.color,
                        }}
                      >
                        {resolving === deal.nonce ? "\u2026" : opt.label}
                        <span className="ml-1.5 text-[var(--dim)]">&mdash; {opt.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <section className="bg-[var(--surface)] border border-[var(--border)] p-7">
        <div className="section-label" style={{ color: "var(--mid)" }}>How disputes work</div>
        <div className="mt-3 space-y-2 text-[13px] text-[var(--mid)] leading-[1.7]">
          <p>1. Client opens a dispute from their dashboard, freezing the escrowed USDC.</p>
          <p>2. Both parties submit evidence (in production, via IPFS URIs for Kleros jurors).</p>
          <p>3. The juror (you, in this demo) reviews the case and issues a ruling.</p>
          <p>4. The smart contract distributes funds according to the ruling.</p>
        </div>
      </section>
    </div>
  );
}
