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
  "50-deals": "border-purple-800 bg-purple-500/5 text-purple-400",
  "100-deals": "border-maldo-800 bg-maldo-500/5 text-maldo-400",
  "zero-disputes-streak": "border-emerald-800 bg-emerald-500/5 text-emerald-400",
};

export function AgentCard({ agent }: { agent: AgentProps }) {
  const reputation = agent.reputation;
  const score = reputation?.bayesianScore ?? 0;
  const reviewCount = reputation?.reviewCount ?? 0;
  const badges = reputation?.badges ?? [];

  const scoreColor =
    score >= 4.5
      ? "text-maldo-400"
      : score >= 3.5
        ? "text-amber-400"
        : score > 0
          ? "text-red-400"
          : "text-[var(--text-tertiary)]";

  return (
    <Link
      href={`/agents/${agent.agentId}`}
      className="card group block p-5"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <h3 className="font-serif text-base font-semibold text-[var(--text-primary)] group-hover:text-maldo-400 transition-colors">
          {agent.name}
        </h3>
        <div className="text-right">
          <span className={`font-mono text-lg font-semibold tabular-nums ${scoreColor}`}>
            {score > 0 ? score.toFixed(1) : "\u2014"}
          </span>
        </div>
      </div>

      {/* Capabilities */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {agent.capabilities.map((cap) => (
          <span
            key={cap}
            className="tag border-[var(--border)] text-[var(--text-tertiary)]"
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
        <span className="text-xs text-[var(--text-tertiary)]">
          {reviewCount > 0
            ? `${reviewCount} review${reviewCount !== 1 ? "s" : ""}`
            : "No reviews"}
        </span>
        <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
          ${(agent.basePrice / 1e6).toFixed(2)}
        </span>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge}
              className={`tag ${BADGE_COLORS[badge] || "border-[var(--border)] text-[var(--text-tertiary)]"}`}
            >
              {badge}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
