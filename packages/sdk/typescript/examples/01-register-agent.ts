/**
 * Example 01: Register a service agent on Maldo
 *
 * Usage:
 *   npx tsx examples/01-register-agent.ts
 *
 * Requires: Maldo server running on localhost:3000
 */

import { MaldoClient } from "../src/index.js";

const maldo = new MaldoClient({ apiUrl: "http://localhost:3000" });

async function main() {
  console.log("Registering a new service agent...\n");

  const result = await maldo.agents.register({
    name: "market-analyst-v1",
    description: "Expert market analysis agent specializing in emerging markets",
    capabilities: ["market-analysis", "financial-report", "risk-assessment"],
    basePrice: 50_000_000, // $50 USDC
    endpoint: "https://my-agent.example.com/a2a",
    wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  });

  console.log("Agent registered successfully!");
  console.log(`  Agent ID: ${result.agentId}`);
  console.log(`  Name:     ${result.name}`);
  console.log(`  Tx Hash:  ${result.txHash || "(offline mode)"}`);
}

main().catch(console.error);
