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

const BADGE_CONFIG: Record<string, { label: string; color: string }> = {
  "50-deals": { label: "50+ deals", color: "border-[rgba(168,85,247,0.3)] text-[#a855f7]" },
  "100-deals": { label: "100+ deals", color: "border-[var(--green-dim)] text-[var(--green)]" },
  "zero-disputes-streak": { label: "0 disputes", color: "border-[rgba(16,185,129,0.3)] text-[#10b981]" },
  "top-rated": { label: "Top rated", color: "border-[rgba(255,204,0,0.3)] text-[var(--yellow)]" },
};

function Stars({ score }: { score: number }) {
  const fullStars = Math.floor(score);
  const hasHalf = score - fullStars >= 0.25 && score - fullStars < 0.75;
  const extraFull = score - fullStars >= 0.75;

  return (
    <span className="inline-flex gap-[2px]" aria-label={`${score.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < fullStars || (i === fullStars && extraFull);
        const half = !filled && i === fullStars && hasHalf;
        return (
          <svg
            key={i}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill={filled ? "currentColor" : half ? "url(#half)" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
            className={filled || half ? "text-[var(--green)]" : "text-[var(--dim)]"}
          >
            {half && (
              <defs>
                <linearGradient id="half">
                  <stop offset="50%" stopColor="currentColor" />
                  <stop offset="50%" stopColor="transparent" />
                </linearGradient>
              </defs>
            )}
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        );
      })}
    </span>
  );
}

export function AgentCard({ agent }: { agent: AgentProps }) {
  const reputation = agent.reputation;
  const score = reputation?.bayesianScore ?? 0;
  const reviewCount = reputation?.reviewCount ?? 0;
  const disputeRate = reputation?.disputeRate ?? 0;
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
      {/* Header: name + score */}
      <div className="mb-1 flex items-start justify-between">
        <h3 className="text-[13px] font-bold text-[var(--foreground)] group-hover:text-[var(--green)] transition-colors">
          {agent.name}
        </h3>
        <div className="text-right">
          <span className={`text-lg font-bold tabular-nums ${scoreColor}`}>
            {score > 0 ? score.toFixed(1) : "\u2014"}
          </span>
        </div>
      </div>

      {/* Stars + review count */}
      <div className="mb-4 flex items-center gap-2">
        {score > 0 ? (
          <>
            <Stars score={score} />
            <span className="text-[10px] text-[var(--mid)]">
              ({reviewCount})
            </span>
          </>
        ) : (
          <span className="text-[10px] text-[var(--dim)]">No ratings yet</span>
        )}
        {disputeRate === 0 && reviewCount > 0 && (
          <span className="text-[10px] text-[#10b981]">
            clean record
          </span>
        )}
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

      {/* Badges */}
      {badges.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {badges.map((badge) => {
            const config = BADGE_CONFIG[badge];
            return (
              <span
                key={badge}
                className={`tag ${config?.color || "border-[var(--dim)] text-[var(--mid)]"}`}
              >
                {config?.label || badge}
              </span>
            );
          })}
        </div>
      )}

      {/* Footer: price */}
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
    </Link>
  );
}
