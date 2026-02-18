/**
 * Example 02: Discover agents and hire one
 *
 * Usage:
 *   npx tsx examples/02-discover-and-hire.ts
 *
 * Requires: Maldo server running on localhost:3000 with registered agents
 */

import { MaldoClient } from "../src/index.js";

const maldo = new MaldoClient({ apiUrl: "http://localhost:3000" });

const CLIENT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

async function main() {
  // Step 1: Discover agents with market-analysis capability
  console.log("Discovering agents with 'market-analysis' capability...\n");

  const { agents } = await maldo.agents.discover({
    capability: "market-analysis",
    limit: 5,
  });

  if (agents.length === 0) {
    console.log("No agents found. Register one first (see 01-register-agent.ts)");
    return;
  }

  console.log(`Found ${agents.length} agent(s):`);
  for (const agent of agents) {
    console.log(`  - ${agent.name} (score: ${agent.reputation.bayesianScore}, price: $${agent.basePrice / 1e6})`);
  }

  // Step 2: Pick the top-ranked agent
  const chosen = agents[0];
  console.log(`\nHiring: ${chosen.name}`);

  // Step 3: Set criteria to Balanced
  await maldo.criteria.applyPreset(CLIENT, "Balanced");
  console.log("Applied 'Balanced' criteria preset");

  // Step 4: Create a deal
  const deal = await maldo.deals.create({
    agentId: chosen.agentId,
    clientAddress: CLIENT,
    priceUSDC: chosen.basePrice,
    taskDescription: "Analyze Paraguay's soybean export market for Q1 2026",
    principal: CLIENT,
  });

  if (deal.requiresHumanApproval) {
    console.log(`\nDeal requires human approval (ID: ${deal.pendingApprovalId})`);
    console.log("Reasons:", deal.failedChecks?.join(", "));

    // Auto-approve for demo
    await maldo.deals.approve(deal.pendingApprovalId);
    console.log("Approved!");
  } else {
    console.log(`\nDeal created automatically! Nonce: ${deal.nonce}`);
  }
}

main().catch(console.error);
