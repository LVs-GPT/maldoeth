import type Database from "better-sqlite3";
import { ApiError } from "./registration.js";

export type CriteriaPreset = "Conservative" | "Balanced" | "Aggressive" | "Custom";

export interface CriteriaConfig {
  preset: CriteriaPreset;
  minReputation: number; // × 100 (e.g. 450 = 4.50 stars)
  minReviewCount: number;
  maxPriceUSDC: number; // atomic units (6 decimals)
  requireHumanApproval: boolean;
}

export interface EvaluationResult {
  autoApprove: boolean;
  failedChecks: string[];
  reasons: string[];
}

const PRESETS: Record<Exclude<CriteriaPreset, "Custom">, Omit<CriteriaConfig, "preset">> = {
  Conservative: {
    minReputation: 480,
    minReviewCount: 5,
    maxPriceUSDC: 50_000_000,
    requireHumanApproval: false,
  },
  Balanced: {
    minReputation: 450,
    minReviewCount: 3,
    maxPriceUSDC: 100_000_000,
    requireHumanApproval: false,
  },
  Aggressive: {
    minReputation: 400,
    minReviewCount: 1,
    maxPriceUSDC: 500_000_000,
    requireHumanApproval: false,
  },
};

const HIGH_VALUE_THRESHOLD = 100_000_000; // $100 USDC

export interface ReputationReader {
  getSummary(agentId: string): Promise<{ averageValue: number; feedbackCount: number }>;
}

export class CriteriaService {
  constructor(
    private db: Database.Database,
    private reputationReader?: ReputationReader,
  ) {}

  getCriteria(principal: string): CriteriaConfig {
    const row = this.db
      .prepare("SELECT * FROM criteria_config WHERE principal = ?")
      .get(principal.toLowerCase()) as CriteriaRow | undefined;

    if (!row) {
      return { preset: "Conservative", ...PRESETS.Conservative };
    }

    return {
      preset: row.preset as CriteriaPreset,
      minReputation: row.min_reputation,
      minReviewCount: row.min_review_count,
      maxPriceUSDC: row.max_price_usdc,
      requireHumanApproval: row.require_human_approval === 1,
    };
  }

  setCriteria(principal: string, update: Partial<CriteriaConfig> & { preset?: CriteriaPreset }): CriteriaConfig {
    let criteria: CriteriaConfig;

    if (update.preset && update.preset !== "Custom" && update.preset in PRESETS) {
      criteria = {
        preset: update.preset,
        ...PRESETS[update.preset as Exclude<CriteriaPreset, "Custom">],
      };
    } else {
      const current = this.getCriteria(principal);
      criteria = {
        preset: "Custom",
        minReputation: update.minReputation ?? current.minReputation,
        minReviewCount: update.minReviewCount ?? current.minReviewCount,
        maxPriceUSDC: update.maxPriceUSDC ?? current.maxPriceUSDC,
        requireHumanApproval: update.requireHumanApproval ?? current.requireHumanApproval,
      };
    }

    this.db
      .prepare(
        `INSERT INTO criteria_config (principal, preset, min_reputation, min_review_count, max_price_usdc, require_human_approval, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(principal) DO UPDATE SET
           preset = excluded.preset,
           min_reputation = excluded.min_reputation,
           min_review_count = excluded.min_review_count,
           max_price_usdc = excluded.max_price_usdc,
           require_human_approval = excluded.require_human_approval,
           updated_at = excluded.updated_at`,
      )
      .run(
        principal.toLowerCase(),
        criteria.preset,
        criteria.minReputation,
        criteria.minReviewCount,
        criteria.maxPriceUSDC,
        criteria.requireHumanApproval ? 1 : 0,
      );

    return criteria;
  }

  async evaluateDeal(
    principal: string,
    agentId: string,
    priceUSDC: number,
  ): Promise<EvaluationResult> {
    const criteria = this.getCriteria(principal);

    // Hard override
    if (criteria.requireHumanApproval) {
      return {
        autoApprove: false,
        failedChecks: ["HUMAN_APPROVAL_REQUIRED"],
        reasons: ["Principal requires human approval for all deals"],
      };
    }

    const failedChecks: string[] = [];
    const reasons: string[] = [];

    // Get reputation (from chain or mock)
    let averageValue = 0;
    let feedbackCount = 0;

    if (this.reputationReader) {
      try {
        const summary = await this.reputationReader.getSummary(agentId);
        averageValue = summary.averageValue;
        feedbackCount = summary.feedbackCount;
      } catch {
        // If reputation registry unreachable, treat as zero
      }
    }

    // Check reputation
    if (averageValue < criteria.minReputation) {
      failedChecks.push("INSUFFICIENT_REPUTATION");
      reasons.push(
        `Agent reputation ${averageValue / 100} < required ${criteria.minReputation / 100}`,
      );
    }

    // Check review count
    if (feedbackCount < criteria.minReviewCount) {
      failedChecks.push("INSUFFICIENT_REVIEWS");
      reasons.push(
        `Agent has ${feedbackCount} reviews < required ${criteria.minReviewCount}`,
      );
    }

    // Check price
    if (priceUSDC > criteria.maxPriceUSDC) {
      failedChecks.push("PRICE_EXCEEDS_LIMIT");
      reasons.push(
        `Price $${priceUSDC / 1_000_000} > max $${criteria.maxPriceUSDC / 1_000_000}`,
      );
    }

    // High value safeguard
    if (priceUSDC > HIGH_VALUE_THRESHOLD) {
      failedChecks.push("HIGH_VALUE_SAFEGUARD");
      reasons.push("Price > $100 requires explicit human confirmation");
    }

    return {
      autoApprove: failedChecks.length === 0,
      failedChecks,
      reasons,
    };
  }
}

interface CriteriaRow {
  principal: string;
  preset: string;
  min_reputation: number;
  min_review_count: number;
  max_price_usdc: number;
  require_human_approval: number;
  updated_at: string;
}
