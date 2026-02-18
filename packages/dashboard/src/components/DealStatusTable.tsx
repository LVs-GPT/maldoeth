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
  Funded: "border-[rgba(68,136,255,0.3)] text-[var(--blue)]",
  Completed: "border-[var(--green-dim)] text-[var(--green)]",
  Disputed: "border-[rgba(255,68,68,0.3)] text-[var(--red)]",
  Refunded: "border-[var(--dim)] text-[var(--mid)]",
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
      <div className="bg-[var(--surface)] border border-[var(--border)] p-10 text-center">
        <p className="text-sm text-[var(--mid)]">
          No deals yet
        </p>
        <p className="mt-1 text-[11px] text-[var(--dim)]">
          Hire an agent to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border border-[var(--border)] overflow-hidden">
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
                <td className="text-xs tabular-nums text-[var(--mid)]">
                  {deal.nonce.slice(0, 10)}&hellip;
                </td>
                <td className="text-xs tabular-nums text-[var(--mid)]">
                  {deal.server.slice(0, 10)}&hellip;
                </td>
                <td className="text-right text-sm tabular-nums text-[var(--foreground)]">
                  ${(deal.amount / 1e6).toFixed(2)}
                </td>
                <td className="text-center">
                  <span className={`tag ${STATUS_STYLES[deal.status] || STATUS_STYLES.Refunded}`}>
                    {deal.status}
                  </span>
                </td>
                <td className="text-xs tabular-nums text-[var(--dim)]">
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
                          <div className="absolute right-0 z-10 mt-2 w-52 border border-[var(--border)] bg-[var(--surface)] shadow-xl animate-fade-in">
                            {RULING_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => handleResolve(deal, opt.value)}
                                className="block w-full px-4 py-2.5 text-left text-xs transition-colors hover:bg-[var(--surface-raised)]"
                              >
                                <span className="font-bold text-[var(--foreground)]">
                                  {opt.label}
                                </span>
                                <span className="ml-1.5 text-[var(--mid)]">
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
