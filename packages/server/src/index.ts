import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env — monorepo root (local dev) or server dir (standalone deploy)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });
dotenv.config({ path: resolve(__dirname, "../.env") });

// Prevent unhandled rejections from crashing the server
process.on("unhandledRejection", (err: any) => {
  console.error("[Server] Unhandled rejection (non-fatal):", err?.message || err);
});

import { createApp } from "./app.js";
import { getDb } from "./db/index.js";
import { EscrowEventListener } from "./listeners/escrowEvents.js";
import { IdentitySync } from "./listeners/identitySync.js";
import { config } from "./config.js";
import { isDbEmpty, seedDemoData } from "./seed.js";

const db = getDb();

// Auto-seed demo data if database is empty (e.g. fresh Render deploy)
if (isDbEmpty(db)) {
  console.log("[Seed] Empty database detected, seeding demo data...");
  seedDemoData(db);
}

const { app, webhookService } = createApp({ db });

app.listen(config.port, () => {
  console.log(`\n  Maldo API server running on port ${config.port}`);
  console.log(`  Health check: http://localhost:${config.port}/health`);
  console.log(`  Network: Sepolia\n`);
  console.log(`  Endpoints:`);
  console.log(`    POST /api/v1/services/register     — Register an agent`);
  console.log(`    GET  /api/v1/services/discover      — Discover agents by capability`);
  console.log(`    GET  /api/v1/principals/:addr/criteria — View criteria`);
  console.log(`    PUT  /api/v1/principals/:addr/criteria — Update criteria`);
  console.log(`    POST /api/v1/deals/create           — Create a deal`);
  console.log(`    GET  /api/v1/deals/:nonce/status     — Deal status`);
  console.log(`    POST /api/v1/agents/:id/rate        — Rate an agent`);
  console.log(`    GET  /api/v1/agents/:id/reputation  — Agent reputation`);
  console.log(`    POST /api/v1/deals/:nonce/deliver   — Agent delivers work result`);
  console.log(`    GET  /api/v1/deals/:nonce/delivery  — Check delivery status`);
  console.log(`    GET  /api/v1/deals/events           — SSE event stream`);
  console.log(`    POST /api/v1/deals/webhooks         — Register webhook`);
  console.log(`    GET  /x402/services/:capability     — x402 payment requirements`);
  console.log(`    POST /x402/services/:capability     — x402 paid request\n`);

  const hasRpc = config.sepoliaRpcUrl && config.sepoliaRpcUrl !== "https://sepolia.infura.io/v3/demo";

  // Manual re-sync endpoint (always available)
  // Runs sync in background — responds immediately so the HTTP request doesn't timeout.
  // Lock auto-expires after 5 minutes to prevent permanent "already in progress".
  let syncing = false;
  let syncStartedAt = 0;
  const SYNC_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  app.post("/api/v1/agents/sync", async (_req, res) => {
    if (!hasRpc) {
      res.status(503).json({
        status: "error",
        error: "No SEPOLIA_RPC_URL configured — set it in Render environment variables to enable chain sync",
      });
      return;
    }

    // Auto-expire stale lock
    if (syncing && Date.now() - syncStartedAt > SYNC_LOCK_TIMEOUT_MS) {
      console.warn("[IdentitySync] Lock expired after timeout, resetting.");
      syncing = false;
    }

    if (syncing) {
      const elapsed = Math.round((Date.now() - syncStartedAt) / 1000);
      res.json({ status: "already_running", message: `Sync in progress (${elapsed}s elapsed)` });
      return;
    }

    syncing = true;
    syncStartedAt = Date.now();

    // Respond immediately — sync runs in background
    res.json({
      status: "started",
      message: "Sync started — agents will appear as they are found. Refresh in ~30s.",
      rpcs: config.sepoliaRpcFallbacks.length,
    });

    // Fire-and-forget
    const identitySyncInstance = new IdentitySync(db);
    identitySyncInstance.sync()
      .then((count) => {
        console.log(`[IdentitySync] Manual sync complete: ${count} new agents.`);
      })
      .catch((err) => {
        console.error("[IdentitySync] Manual sync failed:", err.message);
      })
      .finally(() => {
        syncing = false;
      });
  });

  // GET endpoint to check sync status + DB agent count (debugging)
  app.get("/api/v1/agents/sync/status", (_req, res) => {
    const counts = db.prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN source = 'chain' THEN 1 ELSE 0 END) as chain,
              SUM(CASE WHEN source != 'chain' THEN 1 ELSE 0 END) as seed
       FROM agents`,
    ).get() as { total: number; chain: number; seed: number };

    if (syncing) {
      const elapsed = Math.round((Date.now() - syncStartedAt) / 1000);
      res.json({ syncing: true, elapsed, agents: counts });
    } else {
      res.json({ syncing: false, agents: counts });
    }
  });

  if (hasRpc) {
    // Sync ERC-8004 agents from chain into local DB on startup
    syncing = true;
    syncStartedAt = Date.now();
    const identitySync = new IdentitySync(db);
    identitySync.sync()
      .then((count) => console.log(`[IdentitySync] Startup sync complete: ${count} new agents.`))
      .catch((err) => {
        console.error("[IdentitySync] Failed:", err.message);
        console.log("[IdentitySync] Server continues with local agents only.");
      })
      .finally(() => { syncing = false; });

    // Start escrow event listener with webhook notifications
    const listener = new EscrowEventListener(db, {
      onDealFunded: (e) => webhookService.emit({
        type: "deal.funded", nonce: e.nonce, timestamp: new Date().toISOString(),
        data: { client: e.client, server: e.server, amount: Number(e.amount) },
      }),
      onDealCompleted: (e) => webhookService.emit({
        type: "deal.completed", nonce: e.nonce, timestamp: new Date().toISOString(),
        data: { server: e.server, amount: Number(e.amount) },
      }),
      onDisputeInitiated: (e) => webhookService.emit({
        type: "deal.disputed", nonce: e.nonce, timestamp: new Date().toISOString(),
        data: { client: e.client, server: e.server, amount: Number(e.amount) },
      }),
      onDisputeResolved: (e) => webhookService.emit({
        type: "deal.resolved", nonce: e.nonce, timestamp: new Date().toISOString(),
        data: { winner: e.winner, amount: Number(e.amount), ruling: Number(e.ruling) },
      }),
      onDealRefunded: (e) => webhookService.emit({
        type: "deal.refunded", nonce: e.nonce, timestamp: new Date().toISOString(),
        data: { client: e.client, amount: Number(e.amount) },
      }),
    });
    listener.start().catch((err) => {
      console.error("[EventListener] Failed to start:", err.message);
      console.log("[EventListener] Server continues without live events — use API to manage deals.");
    });
  } else {
    console.log("  [Chain] Skipped — set SEPOLIA_RPC_URL to enable on-chain sync & event listening.\n");
  }
});
