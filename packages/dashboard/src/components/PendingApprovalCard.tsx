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
    <div className="card border-amber-900/40 p-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="status-dot bg-amber-400 status-dot-live" />
          <span className="smallcaps text-xs font-medium text-amber-400">Pending Approval</span>
        </div>
        <span className="font-mono text-2xs tabular-nums text-[var(--text-tertiary)]">
          {new Date(approval.created_at).toLocaleString()}
        </span>
      </div>

      {/* Details */}
      <div className="mb-4 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--text-primary)]">
            {approval.agent_name || approval.agent_id}
          </span>
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            ${(approval.price_usdc / 1e6).toFixed(2)}
          </span>
        </div>
        {approval.task_description && (
          <p className="text-xs leading-relaxed text-[var(--text-tertiary)] line-clamp-2">
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
              className="tag border-red-900/40 bg-red-500/5 text-red-400"
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
