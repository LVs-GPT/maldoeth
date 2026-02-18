/**
 * Example 03: Dispute flow
 *
 * Demonstrates: create deal → simulate dispute → check status
 *
 * Usage:
 *   npx tsx examples/03-dispute.ts
 *
 * Requires: Maldo server running on localhost:3000
 */

import { MaldoClient } from "../src/index.js";

const maldo = new MaldoClient({ apiUrl: "http://localhost:3000" });

const CLIENT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

async function main() {
  // Register a test agent
  const agent = await maldo.agents.register({
    name: "flaky-agent",
    capabilities: ["data-collection"],
    basePrice: 25_000_000, // $25
    wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  });

  console.log(`Registered agent: ${agent.agentId}`);

  // Set lenient criteria
  await maldo.criteria.applyPreset(CLIENT, "Aggressive");

  // Create deal
  const deal = await maldo.deals.create({
    agentId: agent.agentId,
    clientAddress: CLIENT,
    priceUSDC: 25_000_000,
    taskDescription: "Collect social media sentiment data for crypto tokens",
    principal: CLIENT,
  });

  console.log(`Deal created (approval required: ${deal.requiresHumanApproval})`);

  if (deal.requiresHumanApproval) {
    await maldo.deals.approve(deal.pendingApprovalId);
    console.log("Approved.");
  }

  // In production, the dispute would go through:
  // 1. escrow.dispute(nonce) → MockKleros.createDispute()
  // 2. MockKleros.giveRuling(disputeId, ruling)
  // 3. MaldoEscrowX402.rule(disputeId, ruling) → distributes funds
  //
  // For PoC, the server tracks dispute status locally

  console.log("\n--- Dispute Flow (on-chain) ---");
  console.log("1. Client calls escrow.dispute(nonce)");
  console.log("2. MockKleros creates dispute, assigns disputeId");
  console.log("3. Both parties submit evidence via MockKleros.submitEvidence()");
  console.log("4. Owner calls MockKleros.giveRuling(disputeId, 1=buyer, 2=seller)");
  console.log("5. MockKleros calls escrow.rule() → funds distributed");
  console.log("6. Event listener updates DB + posts ERC-8004 reputation feedback");
}

main().catch(console.error);
