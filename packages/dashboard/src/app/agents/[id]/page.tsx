"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { getAgent, getAgentReputation, getAgentRatings, getAgentVouches } from "@/lib/api";
import { HireAgentModal } from "@/components/HireAgentModal";

export default function AgentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const { address, isConnected } = useAccount();

  const [agent, setAgent] = useState<any>(null);
  const [reputation, setReputation] = useState<any>(null);
  const [ratings, setRatings] = useState<any[]>([]);
  const [vouches, setVouches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHireModal, setShowHireModal] = useState(false);

  useEffect(() => {
    if (!agentId) return;

    Promise.all([
      getAgent(agentId),
      getAgentReputation(agentId),
      getAgentRatings(agentId).catch(() => ({ ratings: [] })),
      getAgentVouches(agentId).catch(() => ({ vouches: [], totalBonus: 0 })),
    ])
      .then(([agentData, repData, ratingsData, vouchData]) => {
        setAgent(agentData);
        setReputation(repData);
        setRatings(ratingsData.ratings || []);
        setVouches(vouchData.vouches || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-24 text-[var(--text-tertiary)]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-maldo-500" />
        <span className="text-sm">Loading agent profile&hellip;</span>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="py-24 text-center">
        <p className="font-serif text-base text-red-400">{error || "Agent not found"}</p>
        <Link href="/agents" className="mt-4 inline-block text-sm text-maldo-500 hover:text-maldo-400 transition-colors">
          &larr; Back to discovery
        </Link>
      </div>
    );
  }

  const scoreColor =
    reputation?.bayesianScore >= 4.5
      ? "text-maldo-400"
      : reputation?.bayesianScore >= 3.5
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="space-y-10">
      {/* Breadcrumb */}
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] transition-colors hover:text-maldo-500"
      >
        <span>&larr;</span>
        <span className="smallcaps">Back to discovery</span>
      </Link>

      {/* Header */}
      <header className="flex items-start justify-between gap-8">
        <div className="flex-1">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            {agent.name}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-tertiary)]">
            {agent.description || "No description"}
          </p>
          <p className="mt-2 font-mono text-2xs text-[var(--text-tertiary)] opacity-60">
            {agent.agentId}
          </p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="text-right">
            <p className={`font-mono text-4xl font-bold tabular-nums ${scoreColor}`}>
              {reputation?.bayesianScore?.toFixed(1) || "N/A"}
            </p>
            <p className="smallcaps mt-1 text-2xs text-[var(--text-tertiary)]">Bayesian Score</p>
          </div>
          {isConnected && (
            <button
              onClick={() => setShowHireModal(true)}
              className="btn btn-primary"
            >
              Hire Agent
            </button>
          )}
        </div>
      </header>

      {/* Hire Modal */}
      {showHireModal && address && (
        <HireAgentModal
          agentId={agent.agentId}
          agentName={agent.name}
          basePrice={agent.basePrice}
          clientAddress={address}
          onSuccess={() => {
            setShowHireModal(false);
            router.push("/dashboard");
          }}
          onClose={() => setShowHireModal(false)}
        />
      )}

      {/* Capabilities */}
      <div className="flex flex-wrap gap-2">
        {agent.capabilities?.map((cap: string) => (
          <span
            key={cap}
            className="tag border-maldo-800 bg-maldo-500/8 text-maldo-400"
          >
            {cap}
          </span>
        ))}
      </div>

      <hr className="section-rule" />

      {/* Stats */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] sm:grid-cols-5">
        <MetricCell label="Price" value={`$${(agent.basePrice / 1e6).toFixed(2)}`} />
        <MetricCell label="Raw Score" value={reputation?.score?.toFixed(2) || "0"} />
        <MetricCell label="Reviews" value={reputation?.reviewCount || 0} />
        <MetricCell label="Dispute Rate" value={`${((reputation?.disputeRate || 0) * 100).toFixed(0)}%`} />
        <MetricCell label="Vouches" value={vouches.length} />
      </section>

      {/* Badges */}
      {reputation?.badges?.length > 0 && (
        <section>
          <h2 className="section-header mb-4 text-base text-[var(--text-secondary)]">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {reputation.badges.map((badge: string) => (
              <span
                key={badge}
                className="tag border-purple-800 bg-purple-500/5 text-purple-400"
              >
                {badge}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Vouches */}
      {vouches.length > 0 && (
        <section>
          <h2 className="section-header mb-4 text-base text-[var(--text-secondary)]">Vouches</h2>
          <div className="space-y-1">
            {vouches.map((v: any) => (
              <div
                key={v.id}
                className="flex items-center justify-between border-b border-[var(--border-subtle)] py-2.5"
              >
                <span className="text-sm text-[var(--text-primary)]">
                  {v.voucher_name || v.voucher_agent_id}
                </span>
                <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                  weight: {v.weight?.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <hr className="section-rule" />

      {/* Ratings */}
      <section>
        <h2 className="section-header mb-5 text-base text-[var(--text-secondary)]">
          Recent Ratings
          <span className="ml-2 font-mono text-sm font-normal text-[var(--text-tertiary)]">
            ({ratings.length})
          </span>
        </h2>
        {ratings.length === 0 ? (
          <p className="text-sm italic text-[var(--text-tertiary)]">No ratings yet.</p>
        ) : (
          <div className="space-y-1">
            {ratings.slice(0, 10).map((rating: any) => (
              <div
                key={rating.id}
                className="flex items-start justify-between border-b border-[var(--border-subtle)] py-3"
              >
                <div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={`text-sm ${
                          star <= rating.score ? "text-maldo-400" : "text-[var(--border)]"
                        }`}
                      >
                        {star <= rating.score ? "\u2605" : "\u2606"}
                      </span>
                    ))}
                  </div>
                  {rating.comment && (
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-tertiary)]">
                      {rating.comment}
                    </p>
                  )}
                </div>
                <span className="ml-4 shrink-0 font-mono text-2xs tabular-nums text-[var(--text-tertiary)]">
                  {new Date(rating.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <hr className="section-rule" />

      {/* Details */}
      <section>
        <h2 className="section-header mb-4 text-base text-[var(--text-secondary)]">Details</h2>
        <div className="space-y-2 text-sm">
          <DetailRow label="Wallet" value={agent.wallet} mono />
          {agent.endpoint && <DetailRow label="Endpoint" value={agent.endpoint} />}
          <DetailRow label="Registered" value={new Date(agent.createdAt).toLocaleString()} />
        </div>
      </section>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--surface)] px-5 py-4">
      <p className="smallcaps text-2xs text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[var(--text-primary)]">
        {String(value)}
      </p>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-[var(--border-subtle)] pb-2">
      <span className="smallcaps w-24 shrink-0 text-xs text-[var(--text-tertiary)]">{label}</span>
      <span className={`text-sm text-[var(--text-secondary)] ${mono ? "font-mono text-xs break-all" : ""}`}>
        {value}
      </span>
    </div>
  );
}
