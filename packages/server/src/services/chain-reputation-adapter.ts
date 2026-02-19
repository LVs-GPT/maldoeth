import { ethers } from "ethers";
import type { ReputationData, ReputationAdapter } from "./discovery.js";
import type { ReputationReader } from "./criteria.js";
import { ERC8004_REPUTATION_ABI } from "../chain/abis.js";
import { config } from "../config.js";

/**
 * On-chain reputation adapter — reads from the ERC-8004 Reputation Registry on Sepolia.
 * Implements both DiscoveryService.ReputationAdapter and CriteriaService.ReputationReader.
 */
export class ChainReputationAdapter implements ReputationAdapter, ReputationReader {
  private contract: ethers.Contract;

  constructor(provider?: ethers.JsonRpcProvider) {
    const rpc = provider ?? new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
    this.contract = new ethers.Contract(config.reputationRegistry, ERC8004_REPUTATION_ABI, rpc);
  }

  async getReputation(agentId: string): Promise<ReputationData> {
    try {
      const summary = await this.contract.getSummary(agentId);
      const averageValue = Number(summary.averageValue); // e.g. 482 = 4.82
      const feedbackCount = Number(summary.feedbackCount);

      return {
        score: averageValue / 100, // Convert to 0-5 scale
        reviewCount: feedbackCount,
        disputeRate: 0, // On-chain reputation doesn't track dispute rate separately
        badges: [],
      };
    } catch {
      return { score: 0, reviewCount: 0, disputeRate: 0, badges: [] };
    }
  }

  async getSummary(agentId: string): Promise<{ averageValue: number; feedbackCount: number }> {
    try {
      const summary = await this.contract.getSummary(agentId);
      return {
        averageValue: Number(summary.averageValue),
        feedbackCount: Number(summary.feedbackCount),
      };
    } catch {
      return { averageValue: 0, feedbackCount: 0 };
    }
  }
}
