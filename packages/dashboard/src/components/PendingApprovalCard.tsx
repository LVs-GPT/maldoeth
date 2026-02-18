"use client";

import { useState } from "react";
import { approveDeal, rejectDeal } from "@/lib/api";

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
  const [loading, setLoading] = useState(false);
  const failedChecks: string[] = JSON.parse(approval.failed_checks || "[]");

  const handleApprove = async () => {
    setLoading(true);
    try {
      await approveDeal(approval.id);
      onAction();
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await rejectDeal(approval.id);
      onAction();
    } finally {
      setLoading(false);
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

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleApprove} disabled={loading} className="btn btn-success">
          Approve
        </button>
        <button onClick={handleReject} disabled={loading} className="btn btn-ghost">
          Reject
        </button>
      </div>
    </div>
  );
}
