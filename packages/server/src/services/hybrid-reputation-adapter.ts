import type { ReputationData, ReputationAdapter } from "./discovery.js";
import type { ReputationReader } from "./criteria.js";
import type { ChainReputationAdapter } from "./chain-reputation-adapter.js";
import type { DbReputationAdapter } from "./db-reputation-adapter.js";

/**
 * Hybrid reputation adapter — tries on-chain first, falls back to DB
 * when the chain returns 0 reviews (e.g. demo/seed agents not registered on-chain).
 */
export class HybridReputationAdapter implements ReputationAdapter, ReputationReader {
  constructor(
    private chain: ChainReputationAdapter,
    private db: DbReputationAdapter,
  ) {}

  async getReputation(agentId: string): Promise<ReputationData> {
    const chainRep = await this.chain.getReputation(agentId);
    if (chainRep.reviewCount > 0) return chainRep;
    return this.db.getReputation(agentId);
  }

  async getSummary(agentId: string): Promise<{ averageValue: number; feedbackCount: number }> {
    const chainSummary = await this.chain.getSummary(agentId);
    if (chainSummary.feedbackCount > 0) return chainSummary;
    return this.db.getSummary(agentId);
  }
}
