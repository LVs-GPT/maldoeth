/**
 * Example 04: Fully autonomous agent flow
 *
 * Demonstrates: discover → evaluate criteria → auto-approve → rate → check reputation
 * This is the "autonomous agent" scenario where the human sets criteria once
 * and then agents operate within those boundaries.
 *
 * Usage:
 *   npx tsx examples/04-autonomous.ts
 *
 * Requires: Maldo server running on localhost:3000
 */

import { MaldoClient } from "../src/index.js";

const maldo = new MaldoClient({ apiUrl: "http://localhost:3000" });

const PRINCIPAL = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

async function main() {
  console.log("=== Autonomous Agent Flow ===\n");

  // Step 1: Human sets criteria once (this is the "trust boundary")
  console.log("1. Principal sets criteria to 'Balanced'...");
  const criteria = await maldo.criteria.applyPreset(PRINCIPAL, "Balanced");
  console.log(`   Criteria: minRep=${criteria.minReputation}, maxPrice=$${criteria.maxPriceUSDC / 1e6}\n`);

  // Step 2: Agent discovers available services
  console.log("2. Agent discovers market-analysis services...");
  const { agents } = await maldo.agents.discover({ capability: "market-analysis" });

  if (agents.length === 0) {
    console.log("   No agents found. Registering a test agent...");
    await maldo.agents.register({
      name: "top-analyst",
      capabilities: ["market-analysis"],
      basePrice: 30_000_000,
      wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    });
    console.log("   Registered. Re-discovering...");
  }

  const discovery = await maldo.agents.discover({ capability: "market-analysis" });
  const agent = discovery.agents[0];
  console.log(`   Found: ${agent.name} (score: ${agent.reputation.bayesianScore})\n`);

  // Step 3: Evaluate against criteria
  console.log("3. Evaluating deal against criteria...");
  const evaluation = await maldo.criteria.evaluate(PRINCIPAL, agent.agentId, agent.basePrice);
  console.log(`   Auto-approve: ${evaluation.autoApprove}`);
  if (evaluation.failedChecks?.length) {
    console.log(`   Failed checks: ${evaluation.failedChecks.join(", ")}`);
  }

  // Step 4: Create deal (system decides if human approval needed)
  console.log("\n4. Creating deal...");
  const deal = await maldo.deals.create({
    agentId: agent.agentId,
    clientAddress: PRINCIPAL,
    priceUSDC: agent.basePrice,
    taskDescription: "Q1 2026 LATAM market analysis",
    principal: PRINCIPAL,
  });

  if (deal.requiresHumanApproval) {
    console.log(`   Requires human approval (ID: ${deal.pendingApprovalId})`);
    console.log(`   Reason: ${deal.failedChecks?.join(", ")}`);
    // In production, this would trigger a notification to the principal's dashboard
    // For demo, we auto-approve:
    await maldo.deals.approve(deal.pendingApprovalId);
    console.log("   (Auto-approved for demo)");
  } else {
    console.log(`   Deal auto-approved! Nonce: ${deal.nonce}`);
  }

  // Step 5: Check reputation
  console.log("\n5. Checking agent reputation...");
  const rep = await maldo.agents.reputation(agent.agentId);
  console.log(`   Score: ${rep.score}`);
  console.log(`   Bayesian: ${rep.bayesianScore}`);
  console.log(`   Reviews: ${rep.reviewCount}`);
  console.log(`   Badges: ${rep.badges.length > 0 ? rep.badges.join(", ") : "(none yet)"}`);

  console.log("\n=== Flow complete ===");
}

main().catch(console.error);
