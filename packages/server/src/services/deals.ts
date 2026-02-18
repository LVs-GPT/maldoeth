import type Database from "better-sqlite3";
import { ethers } from "ethers";
import { ApiError } from "./registration.js";
import type { CriteriaService } from "./criteria.js";
import { getEscrow, getMockKleros, getSigner, getUsdc } from "../chain/provider.js";
import { config } from "../config.js";

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
  txHash?: string;
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

  /**
   * Create a deal on-chain. The server wallet acts as x402 facilitator:
   * 1. Evaluate agentic criteria
   * 2. Approve USDC spend to escrow
   * 3. Transfer USDC to escrow
   * 4. Call escrow.receivePayment()
   * The EventListener will update the local DB when DealFunded fires.
   */
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

    // Auto-approved: create deal on-chain
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const totalAmount = BigInt(params.priceUSDC);

    // Look up the server agent's wallet address
    const agent = this.db
      .prepare("SELECT wallet FROM agents WHERE agent_id = ?")
      .get(params.agentId) as { wallet: string } | undefined;
    const serverAddress = agent?.wallet || params.agentId;

    const txHash = await this.fundDealOnChain(
      nonce,
      params.clientAddress,
      serverAddress,
      totalAmount,
    );

    // Store in local DB immediately (EventListener will update with dealId)
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
      txHash,
    };
  }

  /**
   * On-chain: approve USDC + transfer to escrow + call receivePayment.
   * The server wallet is the facilitator (set in escrow constructor).
   */
  private async fundDealOnChain(
    nonce: string,
    clientAddress: string,
    serverAddress: string,
    totalAmount: bigint,
  ): Promise<string> {
    const usdc = getUsdc();
    const escrow = getEscrow();

    // 1. Approve escrow to spend USDC (or transfer directly)
    const approveTx = await usdc.approve(config.escrowAddress, totalAmount);
    await approveTx.wait();

    // 2. Transfer USDC to escrow contract
    const transferTx = await usdc.transfer(config.escrowAddress, totalAmount);
    await transferTx.wait();

    // 3. Call receivePayment as facilitator
    const paymentTx = await escrow.receivePayment(
      nonce,
      clientAddress,
      serverAddress,
      totalAmount,
    );
    const receipt = await paymentTx.wait();

    return receipt.hash;
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

  /**
   * Complete a deal on-chain. Calls escrow.completeDeal().
   * Note: only deal.client can call this on the contract.
   * The server wallet must be the client (facilitator mode for PoC).
   */
  async completeDeal(nonce: string) {
    const row = this.db
      .prepare("SELECT * FROM deals WHERE nonce = ?")
      .get(nonce) as DealRow | undefined;
    if (!row) throw new ApiError(404, "Deal not found");
    if (row.status !== "Funded") throw new ApiError(400, `Deal is already ${row.status}`);

    const escrow = getEscrow();
    const tx = await escrow.completeDeal(nonce);
    const receipt = await tx.wait();

    // EventListener will update status, but set it here for immediate response
    this.db.prepare("UPDATE deals SET status = 'Completed' WHERE nonce = ?").run(nonce);

    return { nonce, status: "Completed", txHash: receipt.hash };
  }

  /**
   * Dispute a deal on-chain. Calls escrow.dispute() with ETH for arbitration fee.
   * Note: only deal.client can call this on the contract.
   */
  async disputeDeal(nonce: string) {
    const row = this.db
      .prepare("SELECT * FROM deals WHERE nonce = ?")
      .get(nonce) as DealRow | undefined;
    if (!row) throw new ApiError(404, "Deal not found");
    if (row.status !== "Funded") throw new ApiError(400, `Deal is already ${row.status}`);

    const escrow = getEscrow();

    // Get arbitration cost from escrow (reads from MockKleros)
    const arbitrationCost = await escrow.getArbitrationCost();

    const tx = await escrow.dispute(nonce, { value: arbitrationCost });
    const receipt = await tx.wait();

    // EventListener will update status
    this.db.prepare("UPDATE deals SET status = 'Disputed' WHERE nonce = ?").run(nonce);

    return { nonce, status: "Disputed", txHash: receipt.hash, arbitrationCost: arbitrationCost.toString() };
  }

  /**
   * Resolve a dispute via MockKleros. Calls mockKleros.giveRuling().
   * Only MockKleros owner (= deployer = server wallet) can call this.
   * Ruling: 0 = split, 1 = buyer wins (refund), 2 = seller wins (release)
   */
  async resolveDispute(nonce: string, ruling: number) {
    if (ruling < 0 || ruling > 2) throw new ApiError(400, "Ruling must be 0, 1, or 2");

    const row = this.db
      .prepare("SELECT * FROM deals WHERE nonce = ?")
      .get(nonce) as DealRow | undefined;
    if (!row) throw new ApiError(404, "Deal not found");
    if (row.status !== "Disputed") throw new ApiError(400, `Deal is not disputed (status: ${row.status})`);

    // Get the arbitratorDisputeId from on-chain deal data
    const escrow = getEscrow();
    const deal = await escrow.getDeal(nonce);
    const arbitratorDisputeId = deal.arbitratorDisputeId;

    if (arbitratorDisputeId === 0n) {
      throw new ApiError(400, "No dispute found on-chain for this deal");
    }

    const mockKleros = getMockKleros();
    const tx = await mockKleros.giveRuling(arbitratorDisputeId, ruling);
    const receipt = await tx.wait();

    const rulingLabel = ruling === 1 ? "buyer-wins" : ruling === 2 ? "seller-wins" : "split";

    // EventListener will update status via DisputeResolved event
    this.db.prepare("UPDATE deals SET status = 'Completed' WHERE nonce = ?").run(nonce);

    return {
      nonce,
      status: "Resolved",
      ruling: rulingLabel,
      txHash: receipt.hash,
      arbitratorDisputeId: arbitratorDisputeId.toString(),
    };
  }

  approveOrReject(approvalId: number, decision: "approved" | "rejected") {
    const approval = this.db
      .prepare("SELECT * FROM pending_approvals WHERE id = ? AND status = 'pending'")
      .get(approvalId) as PendingApprovalRow | undefined;

    if (!approval) throw new ApiError(404, "Pending approval not found or already processed");

    this.db
      .prepare("UPDATE pending_approvals SET status = ? WHERE id = ?")
      .run(decision, approvalId);

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
