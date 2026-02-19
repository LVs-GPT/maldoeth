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

const { app } = createApp({ db });

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
  console.log(`    GET  /x402/services/:capability     — x402 payment requirements`);
  console.log(`    POST /x402/services/:capability     — x402 paid request\n`);

  const hasRpc = config.sepoliaRpcUrl && config.sepoliaRpcUrl !== "https://sepolia.infura.io/v3/demo";

  if (hasRpc) {
    // Sync ERC-8004 agents from chain into local DB
    const identitySync = new IdentitySync(db);
    identitySync.sync().catch((err) => {
      console.error("[IdentitySync] Failed:", err.message);
      console.log("[IdentitySync] Server continues with local agents only.");
    });

    // Start escrow event listener
    const listener = new EscrowEventListener(db);
    listener.start().catch((err) => {
      console.error("[EventListener] Failed to start:", err.message);
      console.log("[EventListener] Server continues without live events — use API to manage deals.");
    });
  } else {
    console.log("  [Chain] Skipped — set SEPOLIA_RPC_URL to enable on-chain sync & event listening.\n");
  }
});
