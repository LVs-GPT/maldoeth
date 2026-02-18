"use client";

import Link from "next/link";

interface AgentReputation {
  bayesianScore: number;
  reviewCount: number;
  disputeRate: number;
  badges: string[];
}

interface AgentProps {
  agentId: string;
  name: string;
  capabilities: string[];
  basePrice: number;
  reputation?: AgentReputation;
}

const BADGE_COLORS: Record<string, string> = {
  "50-deals": "bg-purple-500/20 text-purple-400",
  "100-deals": "bg-maldo-500/20 text-maldo-400",
  "zero-disputes-streak": "bg-green-500/20 text-green-400",
};

export function AgentCard({ agent }: { agent: AgentProps }) {
  const reputation = agent.reputation;
  const score = reputation?.bayesianScore ?? 0;
  const reviewCount = reputation?.reviewCount ?? 0;
  const badges = reputation?.badges ?? [];

  const scoreColor =
    score >= 4.5
      ? "text-green-400"
      : score >= 3.5
        ? "text-yellow-400"
        : score > 0
          ? "text-red-400"
          : "text-zinc-600";

  return (
    <Link
      href={`/agents/${agent.agentId}`}
      className="block rounded-lg border border-zinc-800 p-4 transition-colors hover:border-maldo-500/40 hover:bg-zinc-900/50"
    >
      <div className="mb-2 flex items-start justify-between">
        <h3 className="font-medium text-zinc-100">{agent.name}</h3>
        <span className={`text-lg font-bold ${scoreColor}`}>
          {score > 0 ? score.toFixed(1) : "—"}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {agent.capabilities.map((cap) => (
          <span
            key={cap}
            className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
          >
            {cap}
          </span>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-zinc-500">
          {reviewCount > 0
            ? `${reviewCount} review${reviewCount !== 1 ? "s" : ""}`
            : "No reviews yet"}
        </span>
        <span className="text-zinc-300">${(agent.basePrice / 1e6).toFixed(2)}</span>
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((badge) => (
            <span
              key={badge}
              className={`rounded-full px-2 py-0.5 text-xs ${BADGE_COLORS[badge] || "bg-zinc-700 text-zinc-300"}`}
            >
              {badge}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
