import { ethers } from "ethers";
import type Database from "better-sqlite3";
import { MALDO_ESCROW_ABI } from "../chain/abis.js";
import { config } from "../config.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  private adaptiveChunkSize = 2_000; // auto-reduces on RPC range errors

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

    // On fresh DB: full replay from escrow deploy block so deals survive redeploys.
    // Otherwise: replay recent 500 blocks to catch missed events.
    const dealsCount = (this.db.prepare("SELECT COUNT(*) as cnt FROM deals").get() as { cnt: number }).cnt;
    if (dealsCount === 0) {
      await this.replayAllEvents();
    } else {
      await this.replayRecentBlocks(500);
    }

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

  /**
   * Full replay from escrow deployment block — used on fresh DB so deals survive redeploys.
   * Uses adaptive chunk sizing to stay within public RPC limits (some free tiers only allow 10 blocks).
   */
  private async replayAllEvents(): Promise<void> {
    try {
      const fromBlock = config.escrowStartBlock;
      const currentBlock = await this.provider.getBlockNumber();

      console.log(`[EventListener] Full replay from block ${fromBlock} to ${currentBlock}...`);

      const allEvents: ethers.EventLog[] = [];
      let chunkSize = this.adaptiveChunkSize;

      for (let from = fromBlock; from <= currentBlock; ) {
        const to = Math.min(from + chunkSize - 1, currentBlock);
        try {
          const [funded, completed, disputed, resolved, refunded] = await Promise.all([
            this.contract.queryFilter(this.contract.filters.DealFunded(), from, to),
            this.contract.queryFilter(this.contract.filters.DealCompleted(), from, to),
            this.contract.queryFilter(this.contract.filters.DisputeInitiated(), from, to),
            this.contract.queryFilter(this.contract.filters.DisputeResolved(), from, to),
            this.contract.queryFilter(this.contract.filters.DealRefunded(), from, to),
          ]);
          for (const e of [...funded, ...completed, ...disputed, ...resolved, ...refunded]) {
            if ("args" in e) allEvents.push(e as ethers.EventLog);
          }
          from += chunkSize;
        } catch (err) {
          const msg = (err as Error).message || "";
          if (chunkSize > 10 && (msg.includes("block range") || msg.includes("-32600") || msg.includes("10 block"))) {
            chunkSize = Math.max(10, Math.floor(chunkSize / 4));
            this.adaptiveChunkSize = chunkSize;
            console.warn(`[EventListener] RPC range limit hit — reducing chunk to ${chunkSize} blocks`);
            continue; // retry same `from` with smaller chunk
          }
          console.warn(`[EventListener] Chunk ${from}-${to} failed: ${msg.slice(0, 120)}`);
          from += chunkSize; // skip on non-range errors
        }
        if (from <= currentBlock) await sleep(200);
      }

      allEvents.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

      for (const event of allEvents) {
        if (!event.args) continue;
        const name = event.eventName;
        switch (name) {
          case "DealFunded": {
            const [nonce, dealId, client, server, amount] = event.args;
            this.upsertDeal(nonce, Number(dealId), client, server, Number(amount), "Funded");
            break;
          }
          case "DealCompleted": {
            const [nonce] = event.args;
            this.updateDealStatus(nonce, "Completed");
            break;
          }
          case "DisputeInitiated": {
            const [nonce] = event.args;
            this.updateDealStatus(nonce, "Disputed");
            break;
          }
          case "DisputeResolved": {
            const [nonce] = event.args;
            this.updateDealStatus(nonce, "Completed");
            break;
          }
          case "DealRefunded": {
            const [nonce] = event.args;
            this.updateDealStatus(nonce, "Refunded");
            break;
          }
        }
      }

      console.log(`[EventListener] Full replay done — recovered ${allEvents.length} events.`);
    } catch (err) {
      console.error("[EventListener] Full replay failed:", err);
      // Fall back to recent blocks
      await this.replayRecentBlocks(500);
    }
  }

  private async replayRecentBlocks(blockCount: number): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const startBlock = Math.max(0, currentBlock - blockCount);
      console.log(`[EventListener] Replaying events from block ${startBlock} to ${currentBlock}...`);

      const allEvents: (ethers.EventLog | ethers.Log)[] = [];
      let chunkSize = this.adaptiveChunkSize;

      for (let from = startBlock; from <= currentBlock; ) {
        const to = Math.min(from + chunkSize - 1, currentBlock);
        try {
          const [funded, completed, disputed, resolved, refunded] = await Promise.all([
            this.contract.queryFilter(this.contract.filters.DealFunded(), from, to),
            this.contract.queryFilter(this.contract.filters.DealCompleted(), from, to),
            this.contract.queryFilter(this.contract.filters.DisputeInitiated(), from, to),
            this.contract.queryFilter(this.contract.filters.DisputeResolved(), from, to),
            this.contract.queryFilter(this.contract.filters.DealRefunded(), from, to),
          ]);
          allEvents.push(...funded, ...completed, ...disputed, ...resolved, ...refunded);
          from += chunkSize;
        } catch (err) {
          const msg = (err as Error).message || "";
          if (chunkSize > 10 && (msg.includes("block range") || msg.includes("-32600") || msg.includes("10 block"))) {
            chunkSize = Math.max(10, Math.floor(chunkSize / 4));
            this.adaptiveChunkSize = chunkSize;
            console.warn(`[EventListener] RPC range limit hit — reducing chunk to ${chunkSize} blocks`);
            continue;
          }
          console.warn(`[EventListener] Replay chunk ${from}-${to} failed: ${msg.slice(0, 120)}`);
          from += chunkSize;
        }
        if (from <= currentBlock) await sleep(200);
      }

      allEvents.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

      for (const event of allEvents) {
        if (!("args" in event) || !event.args) continue;
        const name = (event as ethers.EventLog).eventName;

        switch (name) {
          case "DealFunded": {
            const [nonce, dealId, client, server, amount] = event.args;
            this.upsertDeal(nonce, Number(dealId), client, server, Number(amount), "Funded");
            break;
          }
          case "DealCompleted": {
            const [nonce] = event.args;
            this.updateDealStatus(nonce, "Completed");
            break;
          }
          case "DisputeInitiated": {
            const [nonce] = event.args;
            this.updateDealStatus(nonce, "Disputed");
            break;
          }
          case "DisputeResolved": {
            const [nonce] = event.args;
            this.updateDealStatus(nonce, "Completed");
            break;
          }
          case "DealRefunded": {
            const [nonce] = event.args;
            this.updateDealStatus(nonce, "Refunded");
            break;
          }
        }
      }

      console.log(`[EventListener] Replayed ${allEvents.length} events.`);
    } catch (err) {
      console.error("[EventListener] Replay failed:", err);
    }
  }

  private upsertDeal(nonce: string, dealId: number, client: string, server: string, amount: number, status: string): void {
    // On conflict: only update deal_id and status.
    // Preserve client/server/amount from the API handler (real addresses vs on-chain facilitator).
    this.db
      .prepare(
        `INSERT INTO deals (nonce, deal_id, client, server, amount, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(nonce) DO UPDATE SET
           deal_id = excluded.deal_id,
           status = excluded.status`,
      )
      .run(nonce, dealId, client.toLowerCase(), server.toLowerCase(), amount, status);
  }

  private updateDealStatus(nonce: string, status: string): void {
    this.db.prepare("UPDATE deals SET status = ? WHERE nonce = ?").run(status, nonce);
  }
}
