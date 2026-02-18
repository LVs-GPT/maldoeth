import type Database from "better-sqlite3";
import { ethers } from "ethers";
import { ApiError } from "./registration.js";

export interface SubmitVouchParams {
  voucherAgentId: string;
  voucheeAgentId: string;
  voucherWallet: string;
  signature: string; // EIP-712 signature
}

export interface VouchResult {
  id: number;
  voucherAgentId: string;
  voucheeAgentId: string;
  weight: number;
}

// EIP-712 domain for vouch signing
const VOUCH_DOMAIN = {
  name: "MaldoVouch",
  version: "1",
  chainId: 11155111, // Sepolia
};

const VOUCH_TYPES = {
  Vouch: [
    { name: "voucher", type: "string" },
    { name: "vouchee", type: "string" },
  ],
};

export class VouchService {
  constructor(private db: Database.Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vouches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_agent_id TEXT NOT NULL,
        vouchee_agent_id TEXT NOT NULL,
        voucher_wallet TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(voucher_agent_id, vouchee_agent_id)
      );
    `);
  }

  async submitVouch(params: SubmitVouchParams): Promise<VouchResult> {
    const { voucherAgentId, voucheeAgentId, voucherWallet, signature } = params;

    // No self-vouching
    if (voucherAgentId === voucheeAgentId) {
      throw new ApiError(400, "Self-vouching is not allowed");
    }

    // Validate voucher agent exists and wallet matches
    const voucher = this.db
      .prepare("SELECT * FROM agents WHERE agent_id = ?")
      .get(voucherAgentId) as any;
    if (!voucher) {
      throw new ApiError(404, "Voucher agent not found");
    }
    if (voucher.wallet !== voucherWallet.toLowerCase()) {
      throw new ApiError(403, "Wallet does not match voucher agent");
    }

    // Validate vouchee agent exists
    const vouchee = this.db
      .prepare("SELECT * FROM agents WHERE agent_id = ?")
      .get(voucheeAgentId) as any;
    if (!vouchee) {
      throw new ApiError(404, "Vouchee agent not found");
    }

    // Verify EIP-712 signature
    const message = { voucher: voucherAgentId, vouchee: voucheeAgentId };
    try {
      const recovered = ethers.verifyTypedData(VOUCH_DOMAIN, VOUCH_TYPES, message, signature);
      if (recovered.toLowerCase() !== voucherWallet.toLowerCase()) {
        throw new ApiError(403, "Invalid signature — signer does not match voucher wallet");
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(400, "Invalid EIP-712 signature");
    }

    // Check duplicate
    const existing = this.db
      .prepare("SELECT id FROM vouches WHERE voucher_agent_id = ? AND vouchee_agent_id = ?")
      .get(voucherAgentId, voucheeAgentId);
    if (existing) {
      throw new ApiError(409, "Vouch already exists");
    }

    // Calculate weight: voucher's Bayesian score × 0.2, capped at 1.0
    const voucherReputation = this.getAgentBayesianScore(voucherAgentId);
    const weight = Math.min(voucherReputation * 0.2, 1.0);

    // Persist
    const result = this.db
      .prepare(
        `INSERT INTO vouches (voucher_agent_id, vouchee_agent_id, voucher_wallet, weight)
         VALUES (?, ?, ?, ?)`,
      )
      .run(voucherAgentId, voucheeAgentId, voucherWallet.toLowerCase(), weight);

    return {
      id: Number(result.lastInsertRowid),
      voucherAgentId,
      voucheeAgentId,
      weight: Math.round(weight * 100) / 100,
    };
  }

  withdrawVouch(voucherAgentId: string, voucheeAgentId: string): void {
    const result = this.db
      .prepare("DELETE FROM vouches WHERE voucher_agent_id = ? AND vouchee_agent_id = ?")
      .run(voucherAgentId, voucheeAgentId);

    if (result.changes === 0) {
      throw new ApiError(404, "Vouch not found");
    }
  }

  getVouchesFor(agentId: string) {
    return this.db
      .prepare(
        `SELECT v.*, a.name as voucher_name
         FROM vouches v
         JOIN agents a ON a.agent_id = v.voucher_agent_id
         WHERE v.vouchee_agent_id = ?
         ORDER BY v.weight DESC`,
      )
      .all(agentId);
  }

  getVouchesBy(agentId: string) {
    return this.db
      .prepare(
        `SELECT v.*, a.name as vouchee_name
         FROM vouches v
         JOIN agents a ON a.agent_id = v.vouchee_agent_id
         WHERE v.voucher_agent_id = ?
         ORDER BY v.created_at DESC`,
      )
      .all(agentId);
  }

  /**
   * Total vouch bonus for an agent (sum of weights, capped at 2.0)
   */
  getVouchBonus(agentId: string): number {
    const result = this.db
      .prepare("SELECT COALESCE(SUM(weight), 0) as total FROM vouches WHERE vouchee_agent_id = ?")
      .get(agentId) as any;
    return Math.min(result.total, 2.0);
  }

  private getAgentBayesianScore(agentId: string): number {
    const stats = this.db
      .prepare(
        `SELECT COUNT(*) as review_count, AVG(score) as avg_score
         FROM ratings WHERE ratee_agent_id = ?`,
      )
      .get(agentId) as any;

    const reviewCount = stats?.review_count || 0;
    const avgScore = stats?.avg_score || 0;
    const C = 3.5;
    const m = 10;
    return (reviewCount / (reviewCount + m)) * avgScore + (m / (reviewCount + m)) * C;
  }
}
