"use client";

import { useState } from "react";
import { completeDeal, disputeDeal } from "@/lib/api";
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

interface Props {
  deals: Deal[];
  userAddress?: string;
  onUpdate?: () => void;
}

export function DealStatusTable({ deals, userAddress, onUpdate }: Props) {
  const [completing, setCompleting] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);
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
      {/* Desktop table */}
      <div className="hidden md:block border border-[var(--border)] overflow-hidden">
        <table className="data-table" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "22%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-center">Nonce</th>
              <th className="text-center">Server</th>
              <th className="text-center">Amount</th>
              <th className="text-center">Status</th>
              <th className="text-center">Date</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.nonce}>
                <td className="text-center text-xs tabular-nums text-[var(--mid)]">
                  {deal.nonce.slice(0, 10)}&hellip;
                </td>
                <td className="text-center text-xs tabular-nums text-[var(--mid)]">
                  {deal.server.slice(0, 10)}&hellip;
                </td>
                <td className="text-center text-sm tabular-nums text-[var(--foreground)]">
                  ${(deal.amount / 1e6).toFixed(2)}
                </td>
                <td className="text-center">
                  <span className={`tag ${STATUS_STYLES[deal.status] || STATUS_STYLES.Refunded}`}>
                    {deal.status}
                  </span>
                </td>
                <td className="text-center text-xs tabular-nums text-[var(--dim)]">
                  {new Date(deal.created_at).toLocaleDateString()}
                </td>
                <td className="text-center">
                  <DealActions
                    deal={deal}
                    userAddress={userAddress}
                    completing={completing}
                    disputing={disputing}
                    onComplete={handleComplete}
                    onDispute={handleDispute}
                    onRate={setRatingDeal}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {deals.map((deal) => (
          <div
            key={deal.nonce}
            className="border border-[var(--border)] bg-[var(--bg)] overflow-hidden"
          >
            {/* Card header: status + amount */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <span className={`tag ${STATUS_STYLES[deal.status] || STATUS_STYLES.Refunded}`}>
                {deal.status}
              </span>
              <span className="text-sm font-bold tabular-nums text-[var(--foreground)]">
                ${(deal.amount / 1e6).toFixed(2)} USDC
              </span>
            </div>

            {/* Card body: details */}
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-[var(--dim)] tracking-[0.1em]">NONCE</span>
                <span className="text-xs tabular-nums text-[var(--mid)]">
                  {deal.nonce.slice(0, 14)}&hellip;
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-[var(--dim)] tracking-[0.1em]">SERVER</span>
                <span className="text-xs tabular-nums text-[var(--mid)]">
                  {deal.server.slice(0, 6)}&hellip;{deal.server.slice(-4)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-[var(--dim)] tracking-[0.1em]">DATE</span>
                <span className="text-xs tabular-nums text-[var(--mid)]">
                  {new Date(deal.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Card footer: actions */}
            <div className="px-4 py-3 border-t border-[var(--border)]">
              <DealActions
                deal={deal}
                userAddress={userAddress}
                completing={completing}
                disputing={disputing}
                onComplete={handleComplete}
                onDispute={handleDispute}
                onRate={setRatingDeal}
              />
            </div>
          </div>
        ))}
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

function DealActions({
  deal,
  userAddress,
  completing,
  disputing,
  onComplete,
  onDispute,
  onRate,
}: {
  deal: Deal;
  userAddress?: string;
  completing: string | null;
  disputing: string | null;
  onComplete: (deal: Deal) => void;
  onDispute: (deal: Deal) => void;
  onRate: (deal: Deal) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {deal.status === "Funded" && (
        <>
          <button
            onClick={() => onComplete(deal)}
            disabled={completing === deal.nonce}
            className="btn btn-success py-1 px-3 text-xs"
          >
            {completing === deal.nonce ? "\u2026" : "Complete"}
          </button>
          <button
            onClick={() => onDispute(deal)}
            disabled={disputing === deal.nonce}
            className="btn btn-danger py-1 px-3 text-xs"
          >
            {disputing === deal.nonce ? "\u2026" : "Dispute"}
          </button>
        </>
      )}

      {deal.status === "Disputed" && (
        <span className="text-[11px] text-[var(--mid)]">
          Awaiting juror ruling
        </span>
      )}

      {deal.status === "Completed" && userAddress && (
        <button
          onClick={() => onRate(deal)}
          className="btn btn-ghost py-1 px-3 text-xs"
        >
          Rate
        </button>
      )}
    </div>
  );
}
