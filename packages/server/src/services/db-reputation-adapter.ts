import type Database from "better-sqlite3";
import type { ReputationData, ReputationAdapter } from "./discovery.js";
import type { ReputationReader } from "./criteria.js";

/**
 * DB-based reputation adapter — reads from the local ratings table.
 * Used in PoC mode (no on-chain reputation registry).
 * Implements both DiscoveryService.ReputationAdapter and CriteriaService.ReputationReader.
 */
export class DbReputationAdapter implements ReputationAdapter, ReputationReader {
  constructor(private db: Database.Database) {}

  async getReputation(agentId: string): Promise<ReputationData> {
    const stats = this.db
      .prepare(
        `SELECT
           COUNT(*) as review_count,
           COALESCE(AVG(score), 0) as avg_score,
           SUM(CASE WHEN score <= 2 THEN 1 ELSE 0 END) as negative_count
         FROM ratings WHERE ratee_agent_id = ?`,
      )
      .get(agentId) as any;

    return {
      score: stats.avg_score || 0,
      reviewCount: stats.review_count || 0,
      disputeRate:
        stats.review_count > 0
          ? (stats.negative_count || 0) / stats.review_count
          : 0,
      badges: [],
    };
  }

  async getSummary(agentId: string): Promise<{ averageValue: number; feedbackCount: number }> {
    const stats = this.db
      .prepare(
        `SELECT COUNT(*) as cnt, COALESCE(AVG(score), 0) as avg
         FROM ratings WHERE ratee_agent_id = ?`,
      )
      .get(agentId) as any;

    return {
      // CriteriaService expects averageValue in ×100 format (450 = 4.50★)
      averageValue: Math.round((stats.avg || 0) * 100),
      feedbackCount: stats.cnt || 0,
    };
  }
}
