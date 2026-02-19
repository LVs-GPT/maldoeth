"use client";

import { useState } from "react";
import { approveDeal, rejectDeal } from "@/lib/api";
import { Spinner } from "./Spinner";
import { useToast } from "./Toast";

interface PendingApproval {
  id: number;
  agent_id: string;
  agent_name: string;
  price_usdc: number;
  task_description: string;
  failed_checks: string;
  status: string;
  created_at: string;
}

export function PendingApprovalCard({
  approval,
  onAction,
}: {
  approval: PendingApproval;
  onAction: () => void;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const failedChecks: string[] = JSON.parse(approval.failed_checks || "[]");

  const handleApprove = async () => {
    setLoading("approve");
    setError(null);
    try {
      await approveDeal(approval.id);
      toast("success", "Deal approved. Escrow funded.");
      onAction();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval failed";
      setError(msg);
      toast("error", msg);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading("reject");
    setError(null);
    try {
      await rejectDeal(approval.id);
      toast("info", "Deal rejected.");
      onAction();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rejection failed";
      setError(msg);
      toast("error", msg);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-[var(--bg)] p-6 hover:bg-[var(--bg2)] transition-colors">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="status-dot bg-[var(--yellow)]" style={{ boxShadow: '0 0 6px var(--yellow)' }} />
          <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-[var(--yellow)]">Pending</span>
        </div>
        <span className="text-[11px] tabular-nums text-[var(--dim)]">
          {new Date(approval.created_at).toLocaleString()}
        </span>
      </div>

      {/* Details */}
      <div className="mb-4 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-[var(--foreground)]">
            {approval.agent_name || approval.agent_id}
          </span>
          <span className="text-[13px] tabular-nums text-[var(--foreground)]">
            ${(approval.price_usdc / 1e6).toFixed(2)}
          </span>
        </div>
        {approval.task_description && (
          <p className="text-[11px] leading-[1.7] text-[var(--mid)] line-clamp-2">
            {approval.task_description}
          </p>
        )}
      </div>

      {/* Failed checks */}
      {failedChecks.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {failedChecks.map((check) => (
            <span
              key={check}
              className="tag border-[rgba(255,68,68,0.3)] text-[var(--red)]"
            >
              {check}
            </span>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded border border-[rgba(255,68,68,0.3)] bg-[rgba(255,68,68,0.08)] px-3 py-2">
          <p className="text-[11px] text-[var(--red)]">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleApprove} disabled={!!loading} className="btn btn-success">
          {loading === "approve" ? <><Spinner size={12} className="inline mr-1" />Approving&hellip;</> : "Approve"}
        </button>
        <button onClick={handleReject} disabled={!!loading} className="btn btn-ghost">
          {loading === "reject" ? <><Spinner size={12} className="inline mr-1" />Rejecting&hellip;</> : "Reject"}
        </button>
      </div>
    </div>
  );
}
