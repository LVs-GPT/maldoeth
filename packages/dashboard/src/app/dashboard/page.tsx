"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { PendingApprovalCard } from "@/components/PendingApprovalCard";
import { DealStatusTable } from "@/components/DealStatusTable";
import { getPendingApprovals, listDeals } from "@/lib/api";

export default function DashboardPage() {
  const { address, isConnected } = useWallet();
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
      const allDeals = dealsData.deals || [];
      // Filter to only show deals involving the connected wallet
      const myDeals = address
        ? allDeals.filter(
            (d: any) =>
              d.client?.toLowerCase() === address.toLowerCase() ||
              d.server?.toLowerCase() === address.toLowerCase(),
          )
        : allDeals;
      setDeals(myDeals);
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
        <div className="flex h-14 w-14 items-center justify-center border border-[var(--border)] bg-[var(--surface)]">
          <svg className="h-6 w-6 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="text-center">
          <h2 className="text-base font-bold text-[var(--foreground)]">Sign in to continue</h2>
          <p className="mt-2 text-xs text-[var(--mid)]">
            Sign in with Google, email, or a wallet to view your deals and manage agent criteria.
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
    <div className="space-y-8 pt-14 sm:space-y-12 sm:pt-16">
      {/* Header */}
      <header>
        <div className="section-label">My Dashboard</div>
        <p className="text-xs text-[var(--mid)]">
          {address?.slice(0, 6)}&hellip;{address?.slice(-4)}
        </p>
      </header>

      {/* Stats — landing-style grid with 1px gap */}
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
        <StatCell label="Total" value={totalDeals} />
        <StatCell label="Active" value={activeDeals} accent={activeDeals > 0} />
        <StatCell label="Completed" value={completedDeals} />
        <StatCell label="Disputed" value={disputedDeals} warn={disputedDeals > 0} />
      </div>

      {/* Disputes link */}
      {disputedDeals > 0 && (
        <Link
          href="/disputes"
          className="flex items-center gap-2 text-xs text-[var(--red)] hover:text-[var(--foreground)] transition-colors"
        >
          <span className="status-dot bg-[var(--red)]" style={{ boxShadow: '0 0 6px var(--red)' }} />
          {disputedDeals} active dispute{disputedDeals !== 1 ? "s" : ""} — Go to Juror Panel
        </Link>
      )}

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <section>
          <div className="section-label" style={{ color: 'var(--yellow)' }}>
            Pending Approvals ({pendingApprovals.length})
          </div>
          <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2">
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
        <div className="section-label">Deals</div>
        {loading ? (
          <div className="flex items-center gap-3 py-8 text-[var(--mid)]">
            <span className="cursor-blink" />
            <span className="text-xs">Loading&hellip;</span>
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
    <div className="bg-[var(--bg)] p-7">
      <p className="text-[11px] text-[var(--mid)] tracking-[0.05em]">{label}</p>
      <p
        className={`mt-2 text-[clamp(28px,4vw,42px)] font-bold tabular-nums leading-none tracking-tight ${
          warn
            ? "text-[var(--red)]"
            : accent
              ? "text-[var(--green)]"
              : "text-[var(--foreground)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
