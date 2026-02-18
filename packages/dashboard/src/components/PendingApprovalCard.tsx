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
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          <span className="text-sm font-medium text-amber-300">Pending Approval</span>
        </div>
        <span className="text-xs text-zinc-500">{new Date(approval.created_at).toLocaleString()}</span>
      </div>

      <div className="mb-3 space-y-1">
        <p className="text-sm text-zinc-200">
          <span className="text-zinc-500">Agent:</span> {approval.agent_name || approval.agent_id}
        </p>
        <p className="text-sm text-zinc-200">
          <span className="text-zinc-500">Price:</span> ${(approval.price_usdc / 1e6).toFixed(2)} USDC
        </p>
        {approval.task_description && (
          <p className="text-sm text-zinc-400 line-clamp-2">{approval.task_description}</p>
        )}
      </div>

      {failedChecks.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {failedChecks.map((check) => (
            <span
              key={check}
              className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400"
            >
              {check}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="rounded-md bg-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
