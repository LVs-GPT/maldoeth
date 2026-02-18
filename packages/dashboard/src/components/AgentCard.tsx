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
  "50-deals": "border-[rgba(168,85,247,0.3)] text-[#a855f7]",
  "100-deals": "border-[var(--green-dim)] text-[var(--green)]",
  "zero-disputes-streak": "border-[rgba(16,185,129,0.3)] text-[#10b981]",
};

export function AgentCard({ agent }: { agent: AgentProps }) {
  const reputation = agent.reputation;
  const score = reputation?.bayesianScore ?? 0;
  const reviewCount = reputation?.reviewCount ?? 0;
  const badges = reputation?.badges ?? [];

  const scoreColor =
    score >= 4.5
      ? "text-[var(--green)]"
      : score >= 3.5
        ? "text-[var(--yellow)]"
        : score > 0
          ? "text-[var(--red)]"
          : "text-[var(--dim)]";

  return (
    <Link
      href={`/agents/${agent.agentId}`}
      className="group block bg-[var(--bg)] p-6 transition-colors hover:bg-[var(--bg2)]"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-[13px] font-bold text-[var(--foreground)] group-hover:text-[var(--green)] transition-colors">
          {agent.name}
        </h3>
        <div className="text-right">
          <span className={`text-lg font-bold tabular-nums ${scoreColor}`}>
            {score > 0 ? score.toFixed(1) : "\u2014"}
          </span>
        </div>
      </div>

      {/* Capabilities */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {agent.capabilities.map((cap) => (
          <span
            key={cap}
            className="tag border-[var(--dim)] text-[var(--mid)]"
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
        <span className="text-[11px] text-[var(--mid)]">
          {reviewCount > 0
            ? `${reviewCount} review${reviewCount !== 1 ? "s" : ""}`
            : "No reviews"}
        </span>
        <span className="text-sm tabular-nums text-[var(--foreground)]">
          ${(agent.basePrice / 1e6).toFixed(2)}
        </span>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge}
              className={`tag ${BADGE_COLORS[badge] || "border-[var(--dim)] text-[var(--mid)]"}`}
            >
              {badge}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
