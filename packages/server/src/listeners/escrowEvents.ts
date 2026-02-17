import { ethers } from "ethers";
import type Database from "better-sqlite3";
import { MALDO_ESCROW_ABI } from "../chain/abis.js";
import { config } from "../config.js";

export interface EventHandlers {
  onDealFunded?: (event: DealFundedEvent) => void | Promise<void>;
  onDealCompleted?: (event: DealCompletedEvent) => void | Promise<void>;
  onDisputeInitiated?: (event: DisputeInitiatedEvent) => void | Promise<void>;
  onDisputeResolved?: (event: DisputeResolvedEvent) => void | Promise<void>;
  onDealRefunded?: (event: DealRefundedEvent) => void | Promise<void>;
}

export interface DealFundedEvent {
  nonce: string;
  dealId: bigint;
  client: string;
  server: string;
  amount: bigint;
  fee: bigint;
}

export interface DealCompletedEvent {
  nonce: string;
  dealId: bigint;
  server: string;
  amount: bigint;
}

export interface DisputeInitiatedEvent {
  nonce: string;
  dealId: bigint;
  arbitratorDisputeId: bigint;
  client: string;
  server: string;
  amount: bigint;
}

export interface DisputeResolvedEvent {
  nonce: string;
  dealId: bigint;
  winner: string;
  amount: bigint;
  ruling: bigint;
}

export interface DealRefundedEvent {
  nonce: string;
  dealId: bigint;
  client: string;
  amount: bigint;
}

/**
 * Subscribes to MaldoEscrowX402 events on Sepolia.
 * Updates the local DB cache and calls optional handlers.
 */
export class EscrowEventListener {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private running = false;

  constructor(
    private db: Database.Database,
    private handlers: EventHandlers = {},
    provider?: ethers.JsonRpcProvider,
  ) {
    this.provider = provider ?? new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
    this.contract = new ethers.Contract(config.escrowAddress, MALDO_ESCROW_ABI, this.provider);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log("[EventListener] Starting escrow event listener...");
    console.log(`[EventListener] Escrow: ${config.escrowAddress}`);

    // Replay recent blocks on startup to catch missed events
    await this.replayRecentBlocks(500);

    // Subscribe to live events
    this.contract.on("DealFunded", async (nonce, dealId, client, server, amount, fee) => {
      const event: DealFundedEvent = { nonce, dealId, client, server, amount, fee };
      console.log(`[Event] DealFunded: nonce=${nonce.slice(0, 10)}... dealId=${dealId}`);
      this.upsertDeal(nonce, Number(dealId), client, server, Number(amount), "Funded");
      await this.handlers.onDealFunded?.(event);
    });

    this.contract.on("DealCompleted", async (nonce, dealId, server, amount) => {
      const event: DealCompletedEvent = { nonce, dealId, server, amount };
      console.log(`[Event] DealCompleted: nonce=${nonce.slice(0, 10)}... dealId=${dealId}`);
      this.updateDealStatus(nonce, "Completed");
      await this.handlers.onDealCompleted?.(event);
    });

    this.contract.on("DisputeInitiated", async (nonce, dealId, arbitratorDisputeId, client, server, amount) => {
      const event: DisputeInitiatedEvent = { nonce, dealId, arbitratorDisputeId, client, server, amount };
      console.log(`[Event] DisputeInitiated: nonce=${nonce.slice(0, 10)}... disputeId=${arbitratorDisputeId}`);
      this.updateDealStatus(nonce, "Disputed");
      await this.handlers.onDisputeInitiated?.(event);
    });

    this.contract.on("DisputeResolved", async (nonce, dealId, winner, amount, ruling) => {
      const event: DisputeResolvedEvent = { nonce, dealId, winner, amount, ruling };
      const rulingLabel = ruling === 1n ? "buyer-wins" : ruling === 2n ? "seller-wins" : "split";
      console.log(`[Event] DisputeResolved: nonce=${nonce.slice(0, 10)}... ruling=${rulingLabel}`);
      this.updateDealStatus(nonce, "Completed");
      await this.handlers.onDisputeResolved?.(event);
    });

    this.contract.on("DealRefunded", async (nonce, dealId, client, amount) => {
      const event: DealRefundedEvent = { nonce, dealId, client, amount };
      console.log(`[Event] DealRefunded: nonce=${nonce.slice(0, 10)}...`);
      this.updateDealStatus(nonce, "Refunded");
      await this.handlers.onDealRefunded?.(event);
    });

    console.log("[EventListener] Listening for events...");
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.contract.removeAllListeners();
    console.log("[EventListener] Stopped.");
  }

  private async replayRecentBlocks(blockCount: number): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - blockCount);
      console.log(`[EventListener] Replaying events from block ${fromBlock} to ${currentBlock}...`);

      const fundedFilter = this.contract.filters.DealFunded();
      const events = await this.contract.queryFilter(fundedFilter, fromBlock, currentBlock);

      for (const event of events) {
        if ("args" in event && event.args) {
          const [nonce, dealId, client, server, amount] = event.args;
          this.upsertDeal(nonce, Number(dealId), client, server, Number(amount), "Funded");
        }
      }

      console.log(`[EventListener] Replayed ${events.length} DealFunded events.`);
    } catch (err) {
      console.error("[EventListener] Replay failed:", err);
    }
  }

  private upsertDeal(nonce: string, dealId: number, client: string, server: string, amount: number, status: string): void {
    this.db
      .prepare(
        `INSERT INTO deals (nonce, deal_id, client, server, amount, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(nonce) DO UPDATE SET
           deal_id = excluded.deal_id,
           client = excluded.client,
           server = excluded.server,
           amount = excluded.amount,
           status = excluded.status`,
      )
      .run(nonce, dealId, client.toLowerCase(), server.toLowerCase(), amount, status);
  }

  private updateDealStatus(nonce: string, status: string): void {
    this.db.prepare("UPDATE deals SET status = ? WHERE nonce = ?").run(status, nonce);
  }
}
