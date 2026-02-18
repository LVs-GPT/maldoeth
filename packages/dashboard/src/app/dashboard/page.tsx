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
      setPendingApprovals(pendingData.pendingApprovals || []);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="rounded-full bg-maldo-500/20 p-4">
          <svg className="h-8 w-8 text-maldo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-zinc-200">Connect your wallet</h2>
        <p className="text-sm text-zinc-500">
          Connect a Sepolia wallet to view your deals and manage agent criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="text-sm text-zinc-500">
          Principal: {address?.slice(0, 6)}...{address?.slice(-4)}
        </p>
      </div>

      {/* Pending Approvals — most prominent */}
      {pendingApprovals.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-amber-300">
            Pending Approvals ({pendingApprovals.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
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

      {/* Deals table */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-200">Deals</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-maldo-400" />
            Loading...
          </div>
        ) : (
          <DealStatusTable deals={deals} />
        )}
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Deals" value={deals.length} />
        <StatCard
          label="Active"
          value={deals.filter((d: any) => d.status === "Funded").length}
        />
        <StatCard
          label="Completed"
          value={deals.filter((d: any) => d.status === "Completed").length}
        />
        <StatCard
          label="Disputed"
          value={deals.filter((d: any) => d.status === "Disputed").length}
        />
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
    </div>
  );
}
