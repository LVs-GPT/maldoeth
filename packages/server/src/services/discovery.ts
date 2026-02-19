import type Database from "better-sqlite3";

export interface DiscoverParams {
  capability?: string;
  minReputation?: number;
  limit?: number;
}

export interface ReputationData {
  score: number;
  reviewCount: number;
  disputeRate: number;
  badges: string[];
}

export interface ReputationAdapter {
  getReputation(agentId: string): Promise<ReputationData>;
}

/**
 * Bayesian score formula:
 *   bayesianScore = (v / (v + m)) * R + (m / (v + m)) * C
 * Where C=3.5 (global prior), m=10 (minimum reviews for confidence)
 */
function bayesianScore(averageRating: number, reviewCount: number): number {
  const C = 3.5;
  const m = 10;
  const v = reviewCount;
  const R = averageRating;
  return (v / (v + m)) * R + (m / (v + m)) * C;
}

/**
 * Rank score for discovery sorting:
 *   rankScore = bayesian × volumeWeight × (1 - disputeRate) × vouchBonus
 */
function rankScore(rep: ReputationData): number {
  const base = bayesianScore(rep.score, rep.reviewCount);
  const volumeWeight = Math.min(rep.reviewCount / 100, 1);
  const disputePenalty = 1 - rep.disputeRate;
  // vouchBonus would come from subgraph — 1.0 for now
  return base * volumeWeight * disputePenalty;
}

function computeBadges(rep: ReputationData & { completedDeals?: number; registeredDays?: number }): string[] {
  const badges: string[] = [];
  const completed = rep.completedDeals ?? rep.reviewCount;
  if (completed >= 50) badges.push("50-deals");
  if (completed >= 100) badges.push("100-deals");
  if (rep.disputeRate === 0 && completed >= 5) badges.push("zero-disputes-streak");
  if (rep.score >= 4.5 && completed >= 5) badges.push("top-rated");
  if ((rep.registeredDays ?? 0) >= 180) badges.push("veteran");
  return badges;
}

interface AgentRow {
  agent_id: string;
  name: string;
  description: string;
  capabilities: string;
  base_price: number;
  endpoint: string;
  wallet: string;
  source: string;
  created_at: string;
}

export class DiscoveryService {
  constructor(
    private db: Database.Database,
    private reputation?: ReputationAdapter,
  ) {}

  async discover(params: DiscoverParams) {
    const limit = params.limit;

    // Query agents from DB
    let rows: AgentRow[];
    if (params.capability) {
      // SQLite JSON search — capabilities is a JSON array stored as text
      rows = this.db
        .prepare(
          `SELECT * FROM agents
           WHERE capabilities LIKE ?
           ORDER BY created_at DESC`,
        )
        .all(`%"${params.capability}"%`) as AgentRow[];
    } else {
      rows = this.db
        .prepare("SELECT * FROM agents ORDER BY created_at DESC")
        .all() as AgentRow[];
    }

    // Enrich with reputation data
    const agents = await Promise.all(
      rows.map(async (row) => {
        let rep: ReputationData = {
          score: 0,
          reviewCount: 0,
          disputeRate: 0,
          badges: [],
        };

        if (this.reputation) {
          try {
            rep = await this.reputation.getReputation(row.agent_id);
          } catch {
            // Fallback to zero reputation
          }
        }

        const rank = rankScore(rep);
        const badges = computeBadges(rep);

        return {
          agentId: row.agent_id,
          name: row.name,
          description: row.description,
          capabilities: JSON.parse(row.capabilities),
          basePrice: row.base_price,
          endpoint: row.endpoint,
          source: row.source || "seed",
          reputation: {
            score: rep.score,
            reviewCount: rep.reviewCount,
            disputeRate: rep.disputeRate,
            badges,
            bayesianScore: bayesianScore(rep.score, rep.reviewCount),
          },
          rankScore: rank,
        };
      }),
    );

    // Filter by min reputation if specified
    let filtered = agents;
    if (params.minReputation !== undefined) {
      filtered = agents.filter(
        (a) => a.reputation.bayesianScore >= params.minReputation!,
      );
    }

    // Sort by rank score descending (established agents first)
    filtered.sort((a, b) => b.rankScore - a.rankScore);

    return limit ? filtered.slice(0, limit) : filtered;
  }
}
