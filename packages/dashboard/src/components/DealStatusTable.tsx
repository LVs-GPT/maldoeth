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

const STATUS_COLORS: Record<string, string> = {
  Funded: "bg-blue-500/20 text-blue-400",
  Completed: "bg-green-500/20 text-green-400",
  Disputed: "bg-red-500/20 text-red-400",
  Refunded: "bg-zinc-500/20 text-zinc-400",
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
      // Show rate modal after completing
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
      <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
        No deals yet. Hire an agent to get started.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Nonce</th>
              <th className="px-4 py-2 text-left font-medium">Server</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="px-4 py-2 text-center font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-center font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {deals.map((deal) => (
              <tr key={deal.nonce} className="hover:bg-zinc-900/50">
                <td className="px-4 py-2 font-mono text-xs text-zinc-300">
                  {deal.nonce.slice(0, 10)}...
                </td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-300">
                  {deal.server.slice(0, 10)}...
                </td>
                <td className="px-4 py-2 text-right text-zinc-200">
                  ${(deal.amount / 1e6).toFixed(2)}
                </td>
                <td className="px-4 py-2 text-center">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[deal.status] || "bg-zinc-500/20 text-zinc-400"}`}
                  >
                    {deal.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-zinc-500">
                  {new Date(deal.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {/* Funded deals: Complete or Dispute */}
                    {deal.status === "Funded" && (
                      <>
                        <button
                          onClick={() => handleComplete(deal)}
                          disabled={completing === deal.nonce}
                          className="rounded bg-green-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50"
                        >
                          {completing === deal.nonce ? "..." : "Complete"}
                        </button>
                        <button
                          onClick={() => handleDispute(deal)}
                          disabled={disputing === deal.nonce}
                          className="rounded bg-red-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          {disputing === deal.nonce ? "..." : "Dispute"}
                        </button>
                      </>
                    )}

                    {/* Disputed deals: Resolve with ruling options */}
                    {deal.status === "Disputed" && (
                      <div className="relative">
                        <button
                          onClick={() =>
                            setShowResolveMenu(
                              showResolveMenu === deal.nonce ? null : deal.nonce,
                            )
                          }
                          disabled={resolving === deal.nonce}
                          className="rounded bg-amber-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                        >
                          {resolving === deal.nonce ? "..." : "Resolve"}
                        </button>

                        {/* Ruling dropdown */}
                        {showResolveMenu === deal.nonce && (
                          <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg">
                            {RULING_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => handleResolve(deal, opt.value)}
                                className="block w-full px-4 py-2 text-left text-xs hover:bg-zinc-800 first:rounded-t-lg last:rounded-b-lg"
                              >
                                <span className="font-medium text-zinc-200">
                                  {opt.label}
                                </span>
                                <span className="ml-1 text-zinc-500">
                                  — {opt.description}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Completed deals: Rate */}
                    {deal.status === "Completed" && userAddress && (
                      <button
                        onClick={() => setRatingDeal(deal)}
                        className="rounded bg-yellow-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-500"
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

      {/* Rate modal */}
      {ratingDeal && userAddress && (
        <RateAgentModal
          agentId={ratingDeal.server}
          agentName={ratingDeal.server.slice(0, 10) + "..."}
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
