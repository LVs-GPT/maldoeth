import type Database from "better-sqlite3";
import { ApiError } from "./registration.js";

export interface SubmitRatingParams {
  dealNonce: string;
  raterAddress: string;
  rateeAgentId: string;
  score: number; // 1-5
  comment?: string;
}

export interface RatingResult {
  id: number;
  score: number;
  txHash: string | null;
}

export interface ReputationChainAdapter {
  postFeedback(agentId: string, value: number, tags: string[]): Promise<string>;
}

export class RatingService {
  constructor(
    private db: Database.Database,
    private chain?: ReputationChainAdapter,
  ) {
    // Create ratings table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_nonce TEXT NOT NULL,
        rater_address TEXT NOT NULL,
        ratee_agent_id TEXT NOT NULL,
        score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
        comment TEXT DEFAULT '',
        tx_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(deal_nonce, rater_address)
      );
    `);
  }

  async submitRating(params: SubmitRatingParams): Promise<RatingResult> {
    // Validate score range
    if (params.score < 1 || params.score > 5) {
      throw new ApiError(400, "Score must be between 1 and 5");
    }

    // Validate deal exists and is completed or resolved
    const deal = this.db
      .prepare("SELECT * FROM deals WHERE nonce = ?")
      .get(params.dealNonce) as any;

    if (!deal) {
      throw new ApiError(404, "Deal not found");
    }
    if (deal.status !== "Completed") {
      throw new ApiError(400, "Can only rate completed deals");
    }

    // Validate rater was a participant
    const raterLower = params.raterAddress.toLowerCase();
    if (raterLower !== deal.client && raterLower !== deal.server) {
      throw new ApiError(403, "Only deal participants can submit ratings");
    }

    // Check for duplicate rating
    const existing = this.db
      .prepare("SELECT id FROM ratings WHERE deal_nonce = ? AND rater_address = ?")
      .get(params.dealNonce, raterLower);

    if (existing) {
      throw new ApiError(409, "Rating already submitted for this deal");
    }

    // Post to ERC-8004 on-chain (if chain adapter available)
    let txHash: string | null = null;
    if (this.chain) {
      try {
        const value = params.score * 100; // 500 = 5.00 stars
        const tags = [`deal-completed`, `rating-${params.score}`];
        txHash = await this.chain.postFeedback(params.rateeAgentId, value, tags);
      } catch (err) {
        console.error("[Rating] On-chain posting failed:", err);
        // Continue — rating is still valid off-chain
      }
    }

    // Persist rating
    const result = this.db
      .prepare(
        `INSERT INTO ratings (deal_nonce, rater_address, ratee_agent_id, score, comment, tx_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.dealNonce,
        raterLower,
        params.rateeAgentId,
        params.score,
        params.comment || "",
        txHash,
      );

    return {
      id: Number(result.lastInsertRowid),
      score: params.score,
      txHash,
    };
  }

  getAgentRatings(agentId: string) {
    return this.db
      .prepare(
        `SELECT * FROM ratings WHERE ratee_agent_id = ? ORDER BY created_at DESC`,
      )
      .all(agentId);
  }

  getAgentReputation(agentId: string) {
    const stats = this.db
      .prepare(
        `SELECT
           COUNT(*) as review_count,
           AVG(score) as avg_score,
           SUM(CASE WHEN score <= 2 THEN 1 ELSE 0 END) as negative_count
         FROM ratings WHERE ratee_agent_id = ?`,
      )
      .get(agentId) as any;

    const reviewCount = stats.review_count || 0;
    const avgScore = stats.avg_score || 0;

    // Bayesian score: (v/(v+m))*R + (m/(v+m))*C
    const C = 3.5;
    const m = 10;
    const bayesian = (reviewCount / (reviewCount + m)) * avgScore + (m / (reviewCount + m)) * C;

    // Dispute rate approximation from negative ratings
    const disputeRate = reviewCount > 0 ? (stats.negative_count || 0) / reviewCount : 0;

    // Badges
    const badges: string[] = [];
    if (reviewCount >= 50) badges.push("50-deals");
    if (reviewCount >= 100) badges.push("100-deals");
    if (disputeRate === 0 && reviewCount >= 20) badges.push("zero-disputes-streak");

    return {
      agentId,
      score: Math.round(avgScore * 100) / 100,
      bayesianScore: Math.round(bayesian * 100) / 100,
      reviewCount,
      disputeRate: Math.round(disputeRate * 100) / 100,
      badges,
    };
  }
}
