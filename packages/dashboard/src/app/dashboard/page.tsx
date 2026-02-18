"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { PendingApprovalCard } from "@/components/PendingApprovalCard";
import { DealStatusTable } from "@/components/DealStatusTable";
import { getPendingApprovals, listDeals } from "@/lib/api";

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dealsData, pendingData] = await Promise.all([
        listDeals().catch(() => ({ deals: [] })),
        address
          ? getPendingApprovals(address).catch(() => ({ pendingApprovals: [] }))
          : { pendingApprovals: [] },
      ]);
      setDeals(dealsData.deals || []);
      setPendingApprovals(pendingData.approvals || pendingData.pendingApprovals || []);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-24">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
          <svg className="h-6 w-6 text-maldo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="text-center">
          <h2 className="font-serif text-xl font-semibold text-[var(--text-primary)]">Connect your wallet</h2>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">
            Connect a Sepolia wallet to view your deals and manage agent criteria.
          </p>
        </div>
      </div>
    );
  }

  const totalDeals = deals.length;
  const activeDeals = deals.filter((d: any) => d.status === "Funded").length;
  const completedDeals = deals.filter((d: any) => d.status === "Completed").length;
  const disputedDeals = deals.filter((d: any) => d.status === "Disputed").length;

  return (
    <div className="space-y-12">
      {/* Header */}
      <header>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
          Dashboard
        </h1>
        <p className="mt-2 font-mono text-xs text-[var(--text-tertiary)]">
          {address?.slice(0, 6)}&hellip;{address?.slice(-4)}
        </p>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
        <StatCell label="Total" value={totalDeals} />
        <StatCell label="Active" value={activeDeals} accent={activeDeals > 0} />
        <StatCell label="Completed" value={completedDeals} />
        <StatCell label="Disputed" value={disputedDeals} warn={disputedDeals > 0} />
      </section>

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <section>
          <h2 className="section-header mb-5 text-lg text-amber-400">
            Pending Approvals
            <span className="ml-2 font-mono text-sm font-normal text-[var(--text-tertiary)]">
              ({pendingApprovals.length})
            </span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {pendingApprovals.map((approval: any) => (
              <PendingApprovalCard
                key={approval.id}
                approval={approval}
                onAction={loadData}
              />
            ))}
          </div>
        </section>
      )}

      <hr className="section-rule" />

      {/* Deals table */}
      <section>
        <h2 className="section-header mb-5 text-lg text-[var(--text-primary)]">Deals</h2>
        {loading ? (
          <div className="flex items-center gap-3 py-8 text-[var(--text-tertiary)]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-maldo-500" />
            <span className="text-sm">Loading&hellip;</span>
          </div>
        ) : (
          <DealStatusTable deals={deals} userAddress={address} onUpdate={loadData} />
        )}
      </section>
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="bg-[var(--surface)] px-5 py-4">
      <p className="smallcaps text-2xs text-[var(--text-tertiary)]">{label}</p>
      <p
        className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
          warn
            ? "text-red-400"
            : accent
              ? "text-maldo-400"
              : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
