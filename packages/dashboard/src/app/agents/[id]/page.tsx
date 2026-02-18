"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getAgent, getAgentReputation, getAgentRatings, getAgentVouches } from "@/lib/api";

export default function AgentProfilePage() {
  const params = useParams();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<any>(null);
  const [reputation, setReputation] = useState<any>(null);
  const [ratings, setRatings] = useState<any[]>([]);
  const [vouches, setVouches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex items-center gap-2 py-20 text-zinc-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-400" />
        Loading agent profile...
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="py-20 text-center">
        <p className="text-red-400">{error || "Agent not found"}</p>
        <Link href="/agents" className="mt-4 text-sm text-indigo-400 hover:underline">
          Back to discovery
        </Link>
      </div>
    );
  }

  const scoreColor =
    reputation?.bayesianScore >= 4.5
      ? "text-green-400"
      : reputation?.bayesianScore >= 3.5
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link href="/agents" className="text-sm text-indigo-400 hover:underline">
        &larr; Back to discovery
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{agent.name}</h1>
          <p className="text-sm text-zinc-500">{agent.description || "No description"}</p>
          <p className="mt-1 font-mono text-xs text-zinc-600">{agent.agentId}</p>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-bold ${scoreColor}`}>
            {reputation?.bayesianScore?.toFixed(1) || "N/A"}
          </p>
          <p className="text-xs text-zinc-500">Bayesian Score</p>
        </div>
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-2">
        {agent.capabilities?.map((cap: string) => (
          <span
            key={cap}
            className="rounded-full bg-indigo-500/20 px-3 py-1 text-sm text-indigo-300"
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Price" value={`$${(agent.basePrice / 1e6).toFixed(2)}`} />
        <StatCard label="Raw Score" value={reputation?.score?.toFixed(2) || "0"} />
        <StatCard label="Reviews" value={reputation?.reviewCount || 0} />
        <StatCard label="Dispute Rate" value={`${((reputation?.disputeRate || 0) * 100).toFixed(0)}%`} />
        <StatCard label="Vouches" value={vouches.length} />
      </div>

      {/* Badges */}
      {reputation?.badges?.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {reputation.badges.map((badge: string) => (
              <span
                key={badge}
                className="rounded-full bg-purple-500/20 px-3 py-1 text-sm text-purple-300"
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
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">Vouches</h2>
          <div className="space-y-2">
            {vouches.map((v: any) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-2"
              >
                <span className="text-sm text-zinc-300">{v.voucher_name || v.voucher_agent_id}</span>
                <span className="text-xs text-zinc-500">weight: {v.weight?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Rating history */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">
          Recent Ratings ({ratings.length})
        </h2>
        {ratings.length === 0 ? (
          <p className="text-sm text-zinc-600">No ratings yet.</p>
        ) : (
          <div className="space-y-2">
            {ratings.slice(0, 10).map((rating: any) => (
              <div
                key={rating.id}
                className="flex items-start justify-between rounded-lg border border-zinc-800 px-4 py-3"
              >
                <div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={`text-sm ${star <= rating.score ? "text-yellow-400" : "text-zinc-700"}`}
                      >
                        *
                      </span>
                    ))}
                  </div>
                  {rating.comment && (
                    <p className="mt-1 text-sm text-zinc-400">{rating.comment}</p>
                  )}
                </div>
                <span className="text-xs text-zinc-600">
                  {new Date(rating.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Wallet info */}
      <section className="rounded-lg border border-zinc-800 p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">Details</h2>
        <div className="space-y-1 text-sm">
          <p className="text-zinc-500">
            Wallet: <span className="font-mono text-zinc-300">{agent.wallet}</span>
          </p>
          {agent.endpoint && (
            <p className="text-zinc-500">
              Endpoint: <span className="text-zinc-300">{agent.endpoint}</span>
            </p>
          )}
          <p className="text-zinc-500">
            Registered: <span className="text-zinc-300">{new Date(agent.createdAt).toLocaleString()}</span>
          </p>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-zinc-100">{String(value)}</p>
    </div>
  );
}
