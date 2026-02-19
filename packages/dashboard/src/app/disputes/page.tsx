"use client";

import { useEffect, useState, useCallback } from "react";
import { listDeals, resolveDispute } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";

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
  const [confirmRuling, setConfirmRuling] = useState<{ deal: Deal; ruling: number } | null>(null);

  const loadData = useCallback(async () => {
    // Only show loading spinner on initial load
    if (deals.length === 0) {
      setLoading(true);
    }
    try {
      const data = await listDeals();
      setDeals((data.deals || []).filter((d: Deal) => d.status === "Disputed"));
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [deals.length]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { toast } = useToast();

  const handleResolve = async (deal: Deal, ruling: number) => {
    setConfirmRuling(null);
    setResolving(deal.nonce);
    try {
      const label = RULING_OPTIONS.find((o) => o.value === ruling)?.label || "Unknown";
      const res = await resolveDispute(deal.nonce, ruling);
      setResolved((prev) => ({ ...prev, [deal.nonce]: label }));
      toast("success", `Dispute resolved: ${label}`, res?.txHash);
      setTimeout(() => loadData(), 1500);
    } catch (err: any) {
      toast("error", err.message || "Failed to resolve dispute");
    } finally {
      setResolving(null);
    }
  };

  const disputeCount = deals.length;

  return (
    <div className="space-y-8 pt-14 sm:space-y-10 sm:pt-16">
      {/* Header */}
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <div className="section-label" style={{ color: "var(--red)" }}>Dispute Resolution</div>
          <span className="tag border-[rgba(255,68,68,0.3)] text-[var(--red)] text-[10px] shrink-0">
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
              <div className="border-b border-[var(--border)] px-4 py-3 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="tag border-[rgba(255,68,68,0.3)] text-[var(--red)]">
                    DISPUTED
                  </span>
                  <span className="text-xs tabular-nums text-[var(--mid)] hidden sm:inline">
                    {deal.nonce.slice(0, 18)}&hellip;
                  </span>
                  <span className="text-xs tabular-nums text-[var(--mid)] sm:hidden">
                    {deal.nonce.slice(0, 10)}&hellip;
                  </span>
                </div>
                <span className="text-sm font-bold tabular-nums text-[var(--foreground)]">
                  ${(deal.amount / 1e6).toFixed(2)} USDC
                </span>
              </div>

              {/* Deal details */}
              <div className="px-4 py-4 sm:px-6 sm:py-5 grid grid-cols-2 gap-4 sm:gap-6 sm:grid-cols-4">
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
              <div className="border-t border-[var(--border)] px-4 py-3 sm:px-6 sm:py-4">
                {resolved[deal.nonce] ? (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <span className="status-dot bg-[var(--green)]" />
                    <span className="text-xs text-[var(--green)]">
                      Resolved: {resolved[deal.nonce]}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <span className="text-[11px] text-[var(--dim)]">Issue ruling:</span>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {RULING_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setConfirmRuling({ deal, ruling: opt.value })}
                          disabled={resolving === deal.nonce}
                          className="btn min-h-[44px] py-1.5 px-4 text-xs border transition-colors w-full sm:w-auto"
                          style={{
                            borderColor: `color-mix(in srgb, ${opt.color} 40%, transparent)`,
                            color: opt.color,
                          }}
                        >
                          {resolving === deal.nonce ? (
                            <Spinner size={14} />
                          ) : (
                            <>
                              {opt.label}
                              <span className="ml-1.5 text-[var(--dim)] hidden sm:inline">&mdash; {opt.description}</span>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ruling confirmation modal — replaces window.confirm() for mobile UX */}
      {confirmRuling && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmRuling(null)}>
          <div className="modal-content">
            <h2 className="text-base font-bold text-[var(--foreground)]">
              Confirm Ruling
            </h2>
            {(() => {
              const opt = RULING_OPTIONS.find((o) => o.value === confirmRuling.ruling);
              return (
                <>
                  <p className="mt-3 text-sm font-bold" style={{ color: opt?.color }}>
                    {opt?.label}
                  </p>
                  <p className="mt-1 text-xs text-[var(--mid)]">
                    {opt?.description}
                  </p>
                </>
              );
            })()}
            <p className="mt-3 text-[11px] text-[var(--dim)]">
              Deal: {confirmRuling.deal.nonce.slice(0, 14)}&hellip;
              &middot; ${(confirmRuling.deal.amount / 1e6).toFixed(2)} USDC
            </p>

            <hr className="section-rule my-5" />

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRuling(null)}
                className="btn btn-ghost flex-1 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResolve(confirmRuling.deal, confirmRuling.ruling)}
                className="btn btn-primary flex-1 min-h-[44px]"
              >
                Confirm
              </button>
            </div>
          </div>
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
