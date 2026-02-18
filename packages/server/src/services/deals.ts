import type Database from "better-sqlite3";
import { ethers } from "ethers";
import { ApiError } from "./registration.js";
import type { CriteriaService } from "./criteria.js";

export interface CreateDealParams {
  serviceId?: string;
  agentId: string;
  clientAddress: string;
  priceUSDC: number;
  taskDescription: string;
  principal?: string; // If different from client
}

export interface DealResult {
  requiresHumanApproval: boolean;
  nonce?: string;
  dealId?: number;
  pendingApprovalId?: number;
  failedChecks?: string[];
  reasons?: string[];
}

export interface EscrowAdapter {
  getDeal(nonce: string): Promise<{
    dealId: number;
    client: string;
    server: string;
    amount: number;
    fee: number;
    status: number;
    createdAt: number;
  }>;
}

const DEAL_STATUS_MAP: Record<number, string> = {
  0: "Funded",
  1: "Completed",
  2: "Disputed",
  3: "Refunded",
};

export class DealService {
  constructor(
    private db: Database.Database,
    private criteriaService: CriteriaService,
    private escrow?: EscrowAdapter,
  ) {}

  async createDeal(params: CreateDealParams): Promise<DealResult> {
    if (!params.agentId) throw new ApiError(400, "agentId is required");
    if (!params.clientAddress) throw new ApiError(400, "clientAddress is required");
    if (!params.priceUSDC || params.priceUSDC <= 0) throw new ApiError(400, "priceUSDC must be positive");

    const principal = params.principal || params.clientAddress;

    // Evaluate criteria
    const evaluation = await this.criteriaService.evaluateDeal(
      principal,
      params.agentId,
      params.priceUSDC,
    );

    if (!evaluation.autoApprove) {
      // Store as pending approval
      const result = this.db
        .prepare(
          `INSERT INTO pending_approvals (principal, agent_id, price_usdc, task_description, failed_checks)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          principal.toLowerCase(),
          params.agentId,
          params.priceUSDC,
          params.taskDescription || "",
          JSON.stringify(evaluation.failedChecks),
        );

      return {
        requiresHumanApproval: true,
        pendingApprovalId: Number(result.lastInsertRowid),
        failedChecks: evaluation.failedChecks,
        reasons: evaluation.reasons,
      };
    }

    // Auto-approved: create deal
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    // Store in local DB (in production, the on-chain event listener updates this)
    this.db
      .prepare(
        `INSERT INTO deals (nonce, client, server, amount, status, task_description)
         VALUES (?, ?, ?, ?, 'Funded', ?)`,
      )
      .run(
        nonce,
        params.clientAddress.toLowerCase(),
        params.agentId,
        params.priceUSDC,
        params.taskDescription || "",
      );

    return {
      requiresHumanApproval: false,
      nonce,
    };
  }

  async getDealStatus(nonce: string) {
    // Try chain first if adapter available
    if (this.escrow) {
      try {
        const deal = await this.escrow.getDeal(nonce);
        if (deal.createdAt > 0) {
          return {
            nonce,
            dealId: deal.dealId,
            client: deal.client,
            server: deal.server,
            amount: deal.amount,
            fee: deal.fee,
            status: DEAL_STATUS_MAP[deal.status] || "Unknown",
            createdAt: deal.createdAt,
          };
        }
      } catch {
        // Fall through to DB
      }
    }

    // Fallback to DB
    const row = this.db
      .prepare("SELECT * FROM deals WHERE nonce = ?")
      .get(nonce) as DealRow | undefined;

    if (!row) throw new ApiError(404, "Deal not found");

    return {
      nonce: row.nonce,
      dealId: row.deal_id,
      client: row.client,
      server: row.server,
      amount: row.amount,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  listDeals(clientAddress?: string) {
    if (clientAddress) {
      return this.db
        .prepare("SELECT * FROM deals WHERE client = ? ORDER BY created_at DESC")
        .all(clientAddress.toLowerCase()) as DealRow[];
    }
    return this.db
      .prepare("SELECT * FROM deals ORDER BY created_at DESC")
      .all() as DealRow[];
  }

  getPendingApprovals(principal: string) {
    return this.db
      .prepare(
        "SELECT * FROM pending_approvals WHERE principal = ? AND status = 'pending' ORDER BY created_at DESC",
      )
      .all(principal.toLowerCase());
  }

  completeDeal(nonce: string) {
    const row = this.db
      .prepare("SELECT * FROM deals WHERE nonce = ?")
      .get(nonce) as DealRow | undefined;
    if (!row) throw new ApiError(404, "Deal not found");
    if (row.status !== "Funded") throw new ApiError(400, `Deal is already ${row.status}`);

    this.db.prepare("UPDATE deals SET status = 'Completed' WHERE nonce = ?").run(nonce);
    return { nonce, status: "Completed" };
  }

  approveOrReject(approvalId: number, decision: "approved" | "rejected") {
    // Fetch the pending approval first
    const approval = this.db
      .prepare("SELECT * FROM pending_approvals WHERE id = ? AND status = 'pending'")
      .get(approvalId) as PendingApprovalRow | undefined;

    if (!approval) throw new ApiError(404, "Pending approval not found or already processed");

    this.db
      .prepare("UPDATE pending_approvals SET status = ? WHERE id = ?")
      .run(decision, approvalId);

    // When approved, create the deal so it appears in the deals table
    if (decision === "approved") {
      const nonce = ethers.hexlify(ethers.randomBytes(32));

      this.db
        .prepare(
          `INSERT INTO deals (nonce, client, server, amount, status, task_description)
           VALUES (?, ?, ?, ?, 'Funded', ?)`,
        )
        .run(
          nonce,
          approval.principal,
          approval.agent_id,
          approval.price_usdc,
          approval.task_description || "",
        );

      return { id: approvalId, status: decision, nonce };
    }

    return { id: approvalId, status: decision };
  }
}

interface DealRow {
  nonce: string;
  deal_id: number | null;
  client: string;
  server: string;
  amount: number;
  status: string;
  task_description: string | null;
  created_at: string;
}

interface PendingApprovalRow {
  id: number;
  principal: string;
  agent_id: string;
  agent_name: string | null;
  price_usdc: number;
  task_description: string | null;
  failed_checks: string;
  status: string;
  created_at: string;
}
