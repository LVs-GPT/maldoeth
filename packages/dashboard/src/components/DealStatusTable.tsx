"use client";

import { useState } from "react";
import { completeDeal, disputeDeal, resolveDispute } from "@/lib/api";
import { RateAgentModal } from "./RateAgentModal";

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

const STATUS_STYLES: Record<string, string> = {
  Funded: "border-blue-900/40 bg-blue-500/5 text-blue-400",
  Completed: "border-maldo-800 bg-maldo-500/5 text-maldo-400",
  Disputed: "border-red-900/40 bg-red-500/5 text-red-400",
  Refunded: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-tertiary)]",
};

const RULING_OPTIONS = [
  { value: 1, label: "Buyer wins", description: "Refund USDC to client" },
  { value: 2, label: "Seller wins", description: "Release USDC to server" },
  { value: 0, label: "Split", description: "Split equally" },
];

interface Props {
  deals: Deal[];
  userAddress?: string;
  onUpdate?: () => void;
}

export function DealStatusTable({ deals, userAddress, onUpdate }: Props) {
  const [completing, setCompleting] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [showResolveMenu, setShowResolveMenu] = useState<string | null>(null);
  const [ratingDeal, setRatingDeal] = useState<Deal | null>(null);

  const handleComplete = async (deal: Deal) => {
    setCompleting(deal.nonce);
    try {
      await completeDeal(deal.nonce);
      setRatingDeal(deal);
      onUpdate?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCompleting(null);
    }
  };

  const handleDispute = async (deal: Deal) => {
    if (!confirm("Open a dispute for this deal? This will freeze the USDC and pay an arbitration fee.")) return;
    setDisputing(deal.nonce);
    try {
      await disputeDeal(deal.nonce);
      onUpdate?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDisputing(null);
    }
  };

  const handleResolve = async (deal: Deal, ruling: number) => {
    setShowResolveMenu(null);
    setResolving(deal.nonce);
    try {
      await resolveDispute(deal.nonce, ruling);
      onUpdate?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setResolving(null);
    }
  };

  if (deals.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="font-serif text-base text-[var(--text-tertiary)]">
          No deals yet
        </p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Hire an agent to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nonce</th>
              <th>Server</th>
              <th className="text-right">Amount</th>
              <th className="text-center">Status</th>
              <th>Date</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.nonce}>
                <td className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                  {deal.nonce.slice(0, 10)}&hellip;
                </td>
                <td className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                  {deal.server.slice(0, 10)}&hellip;
                </td>
                <td className="text-right font-mono text-sm tabular-nums text-[var(--text-primary)]">
                  ${(deal.amount / 1e6).toFixed(2)}
                </td>
                <td className="text-center">
                  <span className={`tag ${STATUS_STYLES[deal.status] || STATUS_STYLES.Refunded}`}>
                    {deal.status}
                  </span>
                </td>
                <td className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                  {new Date(deal.created_at).toLocaleDateString()}
                </td>
                <td className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    {deal.status === "Funded" && (
                      <>
                        <button
                          onClick={() => handleComplete(deal)}
                          disabled={completing === deal.nonce}
                          className="btn btn-success py-1 px-3 text-xs"
                        >
                          {completing === deal.nonce ? "\u2026" : "Complete"}
                        </button>
                        <button
                          onClick={() => handleDispute(deal)}
                          disabled={disputing === deal.nonce}
                          className="btn btn-danger py-1 px-3 text-xs"
                        >
                          {disputing === deal.nonce ? "\u2026" : "Dispute"}
                        </button>
                      </>
                    )}

                    {deal.status === "Disputed" && (
                      <div className="relative">
                        <button
                          onClick={() =>
                            setShowResolveMenu(
                              showResolveMenu === deal.nonce ? null : deal.nonce,
                            )
                          }
                          disabled={resolving === deal.nonce}
                          className="btn btn-warning py-1 px-3 text-xs"
                        >
                          {resolving === deal.nonce ? "\u2026" : "Resolve"}
                        </button>

                        {showResolveMenu === deal.nonce && (
                          <div className="absolute right-0 z-10 mt-2 w-52 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl animate-fade-in">
                            {RULING_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => handleResolve(deal, opt.value)}
                                className="block w-full px-4 py-2.5 text-left text-xs transition-colors hover:bg-[var(--surface-raised)] first:rounded-t-lg last:rounded-b-lg"
                              >
                                <span className="font-medium text-[var(--text-primary)]">
                                  {opt.label}
                                </span>
                                <span className="ml-1.5 text-[var(--text-tertiary)]">
                                  &mdash; {opt.description}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {deal.status === "Completed" && userAddress && (
                      <button
                        onClick={() => setRatingDeal(deal)}
                        className="btn btn-ghost py-1 px-3 text-xs"
                      >
                        Rate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ratingDeal && userAddress && (
        <RateAgentModal
          agentId={ratingDeal.server}
          agentName={ratingDeal.server.slice(0, 10) + "\u2026"}
          dealNonce={ratingDeal.nonce}
          raterAddress={userAddress}
          onSuccess={() => {
            setRatingDeal(null);
            onUpdate?.();
          }}
          onClose={() => setRatingDeal(null)}
        />
      )}
    </>
  );
}
