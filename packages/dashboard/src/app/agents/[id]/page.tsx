"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { getAgent, getAgentReputation, getAgentRatings, getAgentVouches } from "@/lib/api";
import { HireAgentModal } from "@/components/HireAgentModal";

interface AgentData {
  agentId: string;
  name: string;
  description: string;
  capabilities: string[];
  basePrice: number;
  wallet: string;
  endpoint: string;
  createdAt: string;
}

interface ReputationData {
  bayesianScore: number;
  score: number;
  reviewCount: number;
  disputeRate: number;
  badges: string[];
}

interface VouchData {
  id: number;
  voucher_name: string;
  voucher_agent_id: string;
  weight: number;
}

interface RatingData {
  id: number;
  score: number;
  comment: string;
  created_at: string;
}

export default function AgentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const { address, isConnected } = useWallet();

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [ratings, setRatings] = useState<RatingData[]>([]);
  const [vouches, setVouches] = useState<VouchData[]>([]);
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
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load agent"))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-24 text-[var(--mid)]">
        <span className="cursor-blink" />
        <span className="text-xs">Loading agent profile&hellip;</span>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-[var(--red)]">{error || "Agent not found"}</p>
        <Link href="/agents" className="mt-4 inline-block text-xs text-[var(--green)] hover:text-[var(--foreground)] transition-colors">
          &larr; Back to discovery
        </Link>
      </div>
    );
  }

  const bayesian = reputation?.bayesianScore ?? 0;
  const scoreColor =
    bayesian >= 4.5
      ? "text-[var(--green)]"
      : bayesian >= 3.5
        ? "text-[var(--yellow)]"
        : "text-[var(--red)]";

  return (
    <div className="space-y-8 pt-14 sm:space-y-10 sm:pt-16">
      {/* Breadcrumb */}
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-[11px] text-[var(--mid)] transition-colors hover:text-[var(--green)] tracking-[0.05em]"
      >
        <span>&larr;</span>
        <span>BACK TO DISCOVERY</span>
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="flex-1 min-w-0">
          <h1 className="text-[clamp(22px,3vw,32px)] font-bold tracking-tight text-[var(--foreground)]">
            {agent.name}
          </h1>
          <p className="mt-2 text-[13px] leading-[1.7] text-[var(--mid)]">
            {agent.description || "No description"}
          </p>
          <p className="mt-2 text-[11px] text-[var(--dim)] break-all">
            {agent.agentId}
          </p>
        </div>

        <div className="flex items-center gap-6 sm:flex-col sm:items-end sm:gap-3">
          <div className="sm:text-right">
            <p className={`text-[clamp(28px,4vw,42px)] font-bold tabular-nums leading-none ${scoreColor}`}>
              {reputation?.bayesianScore?.toFixed(1) || "N/A"}
            </p>
            <p className="mt-1 text-[11px] text-[var(--mid)] tracking-[0.05em]">Bayesian Score</p>
          </div>
          {isConnected && (
            <button
              onClick={() => setShowHireModal(true)}
              className="btn btn-primary shrink-0"
            >
              Hire Agent &rarr;
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
            className="tag border-[var(--green-dim)] text-[var(--green)]"
          >
            {cap}
          </span>
        ))}
      </div>

      <hr className="section-rule" />

      {/* Stats — landing-style grid */}
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3 lg:grid-cols-5">
        <MetricCell label="Price" value={`$${(agent.basePrice / 1e6).toFixed(2)}`} />
        <MetricCell label="Raw Score" value={reputation?.score?.toFixed(2) || "0"} />
        <MetricCell label="Reviews" value={reputation?.reviewCount || 0} />
        <MetricCell label="Dispute Rate" value={`${((reputation?.disputeRate || 0) * 100).toFixed(0)}%`} />
        <MetricCell label="Vouches" value={vouches.length} />
      </div>

      {/* Badges */}
      {reputation?.badges && reputation.badges.length > 0 && (
        <section>
          <div className="section-label">Badges</div>
          <div className="flex flex-wrap gap-2">
            {reputation.badges.map((badge) => (
              <span
                key={badge}
                className="tag border-[rgba(168,85,247,0.3)] text-[#a855f7]"
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
          <div className="section-label">Vouches</div>
          <div className="flex flex-col gap-px bg-[var(--border)]">
            {vouches.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between bg-[var(--bg)] p-5 hover:bg-[var(--bg2)] transition-colors"
              >
                <span className="text-[13px] text-[var(--foreground)]">
                  {v.voucher_name || v.voucher_agent_id}
                </span>
                <span className="text-[11px] tabular-nums text-[var(--mid)]">
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
        <div className="section-label">
          Recent Ratings ({ratings.length})
        </div>
        {ratings.length === 0 ? (
          <p className="text-xs text-[var(--mid)]">No ratings yet.</p>
        ) : (
          <div className="flex flex-col gap-px bg-[var(--border)]">
            {ratings.slice(0, 10).map((rating) => (
              <div
                key={rating.id}
                className="flex items-start justify-between bg-[var(--bg)] p-5 hover:bg-[var(--bg2)] transition-colors"
              >
                <div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={`text-sm ${
                          star <= rating.score ? "text-[var(--green)]" : "text-[var(--dim)]"
                        }`}
                      >
                        {star <= rating.score ? "\u2605" : "\u2606"}
                      </span>
                    ))}
                  </div>
                  {rating.comment && (
                    <p className="mt-2 text-xs leading-[1.7] text-[var(--mid)]">
                      {rating.comment}
                    </p>
                  )}
                </div>
                <span className="ml-4 shrink-0 text-[11px] tabular-nums text-[var(--dim)]">
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
        <div className="section-label">Details</div>
        <div className="flex flex-col gap-px bg-[var(--border)]">
          <DetailRow label="Wallet" value={agent.wallet} />
          {agent.endpoint && <DetailRow label="Endpoint" value={agent.endpoint} />}
          <DetailRow label="Registered" value={new Date(agent.createdAt).toLocaleString()} />
        </div>
      </section>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--bg)] p-4 sm:p-7">
      <p className="text-[11px] text-[var(--mid)] tracking-[0.05em]">{label}</p>
      <p className="mt-1 sm:mt-2 text-lg font-bold tabular-nums text-[var(--foreground)]">
        {String(value)}
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-[var(--bg)] p-4 sm:p-5 sm:flex-row sm:items-baseline sm:gap-6 hover:bg-[var(--bg2)] transition-colors">
      <span className="w-24 shrink-0 text-[11px] text-[var(--mid)] tracking-[0.05em] uppercase">{label}</span>
      <span className="text-xs text-[var(--foreground)] break-all">
        {value}
      </span>
    </div>
  );
}
