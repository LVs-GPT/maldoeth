import { createApp } from "./app.js";
import { getDb } from "./db/index.js";
import { EscrowEventListener } from "./listeners/escrowEvents.js";
import { config } from "./config.js";

const db = getDb();
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

  // Start event listener (non-blocking — won't crash server if RPC is unavailable)
  if (config.sepoliaRpcUrl && config.sepoliaRpcUrl !== "https://sepolia.infura.io/v3/demo") {
    const listener = new EscrowEventListener(db);
    listener.start().catch((err) => {
      console.error("[EventListener] Failed to start:", err.message);
      console.log("[EventListener] Server continues without live events — use API to manage deals.");
    });
  } else {
    console.log("  [EventListener] Skipped — set SEPOLIA_RPC_URL to enable live event listening.\n");
  }
});
