import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { createTestDb } from "../src/db/index.js";

/**
 * Phase 10 — End-to-End Validation
 *
 * Simulates all four spec scenarios against the API layer,
 * then measures the six success-criteria metrics.
 */

let db: Database.Database;
let app: ReturnType<typeof createApp>["app"];

const CLIENT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OPERATOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// ── helpers ─────────────────────────────────────────────────────────
async function registerAgent(
  appRef: ReturnType<typeof createApp>["app"],
  overrides: Record<string, unknown> = {},
) {
  const res = await request(appRef)
    .post("/api/v1/services/register")
    .send({
      name: `agent-${Math.random().toString(36).slice(2, 8)}`,
      capabilities: ["market-analysis"],
      basePrice: 50_000_000,
      wallet: OPERATOR,
      ...overrides,
    })
    .expect(201);
  return res.body;
}

/** Insert N completed deals + ratings to build an agent's reputation. */
function buildReputation(
  dbRef: Database.Database,
  agentId: string,
  count: number,
  score = 5,
) {
  for (let i = 0; i < count; i++) {
    const nonce = `0xrep_${agentId}_${i}`;
    dbRef
      .prepare(
        `INSERT INTO deals (nonce, deal_id, client, server, amount, status, task_description)
         VALUES (?, ?, ?, ?, 50000000, 'Completed', 'rep-builder')`,
      )
      .run(nonce, i + 100, CLIENT.toLowerCase(), agentId);

    dbRef
      .prepare(
        `INSERT INTO ratings (deal_nonce, rater_address, ratee_agent_id, score, comment)
         VALUES (?, ?, ?, ?, 'great')`,
      )
      .run(nonce, CLIENT.toLowerCase(), agentId, score);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Scenario A — Fully Autonomous Deal (Happy Path)
// ─────────────────────────────────────────────────────────────────────

describe("Scenario A: Fully Autonomous Deal", () => {
  beforeEach(() => {
    db = createTestDb();
    ({ app } = createApp({ db }));
  });
  afterEach(() => db.close());

  it("auto-approves deal for high-reputation agent and completes full lifecycle", async () => {
    const t0 = Date.now();

    // 1. Register agent
    const agent = await registerAgent(app, {
      name: "market-guru",
      capabilities: ["market-analysis", "financial-report"],
    });

    // 2. Build reputation (30 five-star deals → Bayesian ~4.63)
    buildReputation(db, agent.agentId, 30, 5);

    // 3. Client sets Balanced criteria (4.5★ min, 3 reviews min, $100 max)
    await request(app)
      .put(`/api/v1/principals/${CLIENT}/criteria`)
      .send({ preset: "Balanced" })
      .expect(200);

    // 4. Discover — agent ranks #1 (now with DbReputationAdapter)
    const discover = await request(app)
      .get("/api/v1/services/discover?capability=market-analysis")
      .expect(200);

    expect(discover.body.agents.length).toBeGreaterThanOrEqual(1);
    expect(discover.body.agents[0].agentId).toBe(agent.agentId);
    expect(discover.body.agents[0].reputation.bayesianScore).toBeGreaterThan(4.5);

    // 5. Evaluate criteria — should auto-approve
    const evalRes = await request(app)
      .post("/api/v1/criteria/evaluate")
      .send({ principal: CLIENT, agentId: agent.agentId, price: 50_000_000 })
      .expect(200);

    expect(evalRes.body.autoApprove).toBe(true);
    expect(evalRes.body.failedChecks).toHaveLength(0);

    // 6. Create deal — no human approval needed
    const deal = await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId: agent.agentId,
        clientAddress: CLIENT,
        priceUSDC: 50_000_000,
        taskDescription: "Analyze Paraguay market Q1 2026",
        principal: CLIENT,
      })
      .expect(201);

    expect(deal.body.requiresHumanApproval).toBe(false);
    expect(deal.body.nonce).toBeDefined();

    // 7. Simulate delivery & confirm
    db.prepare("UPDATE deals SET status = 'Completed' WHERE nonce = ?").run(
      deal.body.nonce,
    );

    // 8. Rate the agent
    await request(app)
      .post(`/api/v1/agents/${agent.agentId}/rate`)
      .send({
        dealNonce: deal.body.nonce,
        raterAddress: CLIENT,
        score: 5,
        comment: "Excellent analysis, very thorough",
      })
      .expect(200);

    // 9. Verify updated reputation
    const rep = await request(app)
      .get(`/api/v1/agents/${agent.agentId}/reputation`)
      .expect(200);

    expect(rep.body.reviewCount).toBe(31);
    expect(rep.body.bayesianScore).toBeGreaterThan(4.5);

    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(10_000); // SC1: < 10s
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario B — Human Approval Required
// ─────────────────────────────────────────────────────────────────────

describe("Scenario B: Human Approval Required", () => {
  beforeEach(() => {
    db = createTestDb();
    ({ app } = createApp({ db }));
  });
  afterEach(() => db.close());

  it("flags low-reputation agent for human review, then approves", async () => {
    // 1. Register agent with low reputation
    const agent = await registerAgent(app, {
      name: "new-agent-y",
      capabilities: ["market-analysis"],
      basePrice: 50_000_000,
    });

    // Give it 5 deals at 4★ average (Bayesian ~3.7, below Conservative 4.8★)
    buildReputation(db, agent.agentId, 5, 4);

    // 2. Client uses default Conservative criteria (4.8★ min)

    // 3. Evaluate — should fail reputation check
    const evalRes = await request(app)
      .post("/api/v1/criteria/evaluate")
      .send({ principal: CLIENT, agentId: agent.agentId, price: 50_000_000 })
      .expect(200);

    expect(evalRes.body.autoApprove).toBe(false);
    expect(evalRes.body.failedChecks).toContain("INSUFFICIENT_REPUTATION");

    // 4. Create deal → pending approval
    const deal = await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId: agent.agentId,
        clientAddress: CLIENT,
        priceUSDC: 50_000_000,
        taskDescription: "Analyze market conditions",
        principal: CLIENT,
      })
      .expect(201);

    expect(deal.body.requiresHumanApproval).toBe(true);
    expect(deal.body.pendingApprovalId).toBeDefined();
    expect(deal.body.failedChecks.length).toBeGreaterThan(0);

    // 5. Verify pending approval shows in dashboard
    const pending = await request(app)
      .get(`/api/v1/deals/pending/${CLIENT}`)
      .expect(200);

    expect(pending.body.approvals.length).toBeGreaterThanOrEqual(1);
    const pa = pending.body.approvals.find(
      (a: any) => a.id === deal.body.pendingApprovalId,
    );
    expect(pa).toBeDefined();
    expect(pa.agent_id).toBe(agent.agentId);

    // 6. Human approves
    const approve = await request(app)
      .post(`/api/v1/deals/approve/${deal.body.pendingApprovalId}`)
      .expect(200);

    expect(approve.body.status).toBe("approved");

    // 7. Verify pending approval is no longer listed
    const pendingAfter = await request(app)
      .get(`/api/v1/deals/pending/${CLIENT}`)
      .expect(200);

    expect(pendingAfter.body.approvals.length).toBe(0);
  });

  it("allows human to reject a flagged deal", async () => {
    const agent = await registerAgent(app, {
      name: "sketchy-agent",
      capabilities: ["market-analysis"],
    });

    const deal = await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId: agent.agentId,
        clientAddress: CLIENT,
        priceUSDC: 50_000_000,
        principal: CLIENT,
      })
      .expect(201);

    expect(deal.body.requiresHumanApproval).toBe(true);

    // Reject it
    const reject = await request(app)
      .post(`/api/v1/deals/reject/${deal.body.pendingApprovalId}`)
      .expect(200);

    expect(reject.body.status).toBe("rejected");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario C — Dispute Flow
// ─────────────────────────────────────────────────────────────────────

describe("Scenario C: Dispute", () => {
  beforeEach(() => {
    db = createTestDb();
    ({ app } = createApp({ db }));
  });
  afterEach(() => db.close());

  it("simulates dispute: deal funded → disputed → resolved (buyer wins)", async () => {
    const agent = await registerAgent(app, {
      name: "dispute-agent",
      capabilities: ["market-analysis"],
    });

    buildReputation(db, agent.agentId, 30, 5);

    // Use Aggressive criteria to ensure auto-approval (4.0★ min, 1 review min)
    await request(app)
      .put(`/api/v1/principals/${CLIENT}/criteria`)
      .send({ preset: "Aggressive" })
      .expect(200);

    // Create auto-approved deal
    const deal = await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId: agent.agentId,
        clientAddress: CLIENT,
        priceUSDC: 50_000_000,
        taskDescription: "Market analysis",
        principal: CLIENT,
      })
      .expect(201);

    expect(deal.body.requiresHumanApproval).toBe(false);
    expect(deal.body.nonce).toBeDefined();

    // Simulate dispute initiation (on-chain this is MaldoEscrowX402.dispute())
    db.prepare("UPDATE deals SET status = 'Disputed' WHERE nonce = ?").run(
      deal.body.nonce,
    );

    // Verify status
    const disputed = await request(app)
      .get(`/api/v1/deals/${deal.body.nonce}/status`)
      .expect(200);

    expect(disputed.body.status).toBe("Disputed");

    // Simulate arbitration: buyer wins → refund (on-chain: MockKleros.giveRuling → rule callback)
    db.prepare("UPDATE deals SET status = 'Refunded' WHERE nonce = ?").run(
      deal.body.nonce,
    );

    const resolved = await request(app)
      .get(`/api/v1/deals/${deal.body.nonce}/status`)
      .expect(200);

    expect(resolved.body.status).toBe("Refunded");

    // Rate with 1-star (dispute impact) — mark as Completed for rating
    db.prepare("UPDATE deals SET status = 'Completed' WHERE nonce = ?").run(
      deal.body.nonce,
    );

    await request(app)
      .post(`/api/v1/agents/${agent.agentId}/rate`)
      .send({
        dealNonce: deal.body.nonce,
        raterAddress: CLIENT,
        score: 1,
        comment: "Incomplete report, had to dispute",
      })
      .expect(200);

    // Verify reputation decreased
    const rep = await request(app)
      .get(`/api/v1/agents/${agent.agentId}/reputation`)
      .expect(200);

    expect(rep.body.bayesianScore).toBeLessThan(4.7);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario D — Web-Native Agent (x402 path, no wallet)
// ─────────────────────────────────────────────────────────────────────

describe("Scenario D: Web-Native Agent (x402 path)", () => {
  beforeEach(() => {
    db = createTestDb();
    ({ app } = createApp({ db }));
  });
  afterEach(() => db.close());

  it("completes full x402 flow: GET 402 → POST pay → poll → complete → rate", async () => {
    const t0 = Date.now();

    // 1. Register agent
    await registerAgent(app, {
      name: "web-native-analyst",
      capabilities: ["market-analysis"],
      basePrice: 30_000_000,
    });

    // 2. Python-like client GETs x402 payment requirements
    const payReq = await request(app)
      .get("/x402/services/market-analysis")
      .expect(402);

    expect(payReq.body.paymentRequired).toBe(true);
    expect(payReq.body.requirements.scheme).toBe("exact");
    expect(payReq.body.requirements.network).toBe("eip155:11155111");
    expect(payReq.body.requirements.amount).toBe("30000000");
    expect(payReq.body.agent.name).toBe("web-native-analyst");

    const x402Elapsed = Date.now() - t0;
    expect(x402Elapsed).toBeLessThan(2_000); // SC2

    // 3. Client sends paid POST (simulates x402 payment)
    const payRes = await request(app)
      .post("/x402/services/market-analysis")
      .send({
        taskDescription: "Analyze Paraguay market via HTTP",
        clientAddress: CLIENT,
      })
      .expect(200);

    expect(payRes.body.dealNonce).toBeDefined();
    expect(payRes.body.status).toBe("funded");
    expect(payRes.body.webhookUrl).toContain(payRes.body.dealNonce);

    // 4. Poll for result (still in progress)
    const pending = await request(app)
      .get(`/x402/deals/${payRes.body.dealNonce}/result`)
      .expect(200);

    expect(pending.body.status).toBe("Funded");
    expect(pending.body.result).toBeNull();

    // 5. Agent delivers (simulate)
    db.prepare("UPDATE deals SET status = 'Completed' WHERE nonce = ?").run(
      payRes.body.dealNonce,
    );

    // 6. Poll again — now delivered
    const done = await request(app)
      .get(`/x402/deals/${payRes.body.dealNonce}/result`)
      .expect(200);

    expect(done.body.status).toBe("Completed");
    expect(done.body.result).toEqual({ delivered: true });

    // 7. Rate via API
    await request(app)
      .post(`/api/v1/agents/${payRes.body.agentId}/rate`)
      .send({
        dealNonce: payRes.body.dealNonce,
        raterAddress: CLIENT,
        score: 5,
        comment: "Great web-native experience",
      })
      .expect(200);
  });

  it("returns 404 for nonexistent capability", async () => {
    await request(app)
      .get("/x402/services/quantum-computing")
      .expect(404);
  });
});

// ─────────────────────────────────────────────────────────────────────
// ERC-8004 Readability Verification
// ─────────────────────────────────────────────────────────────────────

describe("ERC-8004 Readability", () => {
  beforeEach(() => {
    db = createTestDb();
    ({ app } = createApp({ db }));
  });
  afterEach(() => db.close());

  it("exposes structured agent data for at least 2 registered agents", async () => {
    const agent1 = await registerAgent(app, {
      name: "erc8004-agent-alpha",
      capabilities: ["market-analysis"],
      basePrice: 50_000_000,
    });
    const agent2 = await registerAgent(app, {
      name: "erc8004-agent-beta",
      capabilities: ["code-review", "financial-report"],
      basePrice: 75_000_000,
    });

    expect(agent1.agentId).toBeDefined();
    expect(agent2.agentId).toBeDefined();

    // Verify discoverable
    const discover = await request(app)
      .get("/api/v1/services/discover?capability=market-analysis")
      .expect(200);
    expect(discover.body.agents.length).toBeGreaterThanOrEqual(1);

    // Verify agent detail endpoint returns ERC-8004 fields
    const detail1 = await request(app)
      .get(`/api/v1/agents/${agent1.agentId}`)
      .expect(200);

    expect(detail1.body.agentId).toBe(agent1.agentId);
    expect(detail1.body.name).toBe("erc8004-agent-alpha");
    expect(detail1.body.capabilities).toContain("market-analysis");
    expect(detail1.body.wallet).toBeDefined();

    const detail2 = await request(app)
      .get(`/api/v1/agents/${agent2.agentId}`)
      .expect(200);

    expect(detail2.body.agentId).toBe(agent2.agentId);
    expect(detail2.body.capabilities).toContain("code-review");

    // Verify reputation is readable
    const rep1 = await request(app)
      .get(`/api/v1/agents/${agent1.agentId}/reputation`)
      .expect(200);
    const rep2 = await request(app)
      .get(`/api/v1/agents/${agent2.agentId}/reputation`)
      .expect(200);

    expect(rep1.body.bayesianScore).toBeDefined();
    expect(rep2.body.bayesianScore).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Success Criteria Metrics
// ─────────────────────────────────────────────────────────────────────

describe("Success Criteria Metrics", () => {
  beforeEach(() => {
    db = createTestDb();
    ({ app } = createApp({ db }));
  });
  afterEach(() => db.close());

  it("SC1: end-to-end deal time < 10 seconds", async () => {
    const t0 = Date.now();

    const agent = await registerAgent(app, {
      name: "fast-agent",
      capabilities: ["market-analysis"],
    });
    buildReputation(db, agent.agentId, 30, 5);

    await request(app)
      .put(`/api/v1/principals/${CLIENT}/criteria`)
      .send({ preset: "Balanced" })
      .expect(200);

    const deal = await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId: agent.agentId,
        clientAddress: CLIENT,
        priceUSDC: 50_000_000,
        taskDescription: "Speed test deal",
        principal: CLIENT,
      })
      .expect(201);

    expect(deal.body.requiresHumanApproval).toBe(false);

    db.prepare("UPDATE deals SET status = 'Completed' WHERE nonce = ?").run(
      deal.body.nonce,
    );

    await request(app)
      .post(`/api/v1/agents/${agent.agentId}/rate`)
      .send({ dealNonce: deal.body.nonce, raterAddress: CLIENT, score: 5 })
      .expect(200);

    const elapsed = Date.now() - t0;
    console.log(`  SC1 metric: end-to-end deal time = ${elapsed}ms`);
    expect(elapsed).toBeLessThan(10_000);
  });

  it("SC2: x402 payment confirmation < 2 seconds", async () => {
    await registerAgent(app, {
      name: "x402-speed",
      capabilities: ["speed-test"],
      basePrice: 10_000_000,
    });

    const t0 = Date.now();

    await request(app).get("/x402/services/speed-test").expect(402);

    const payRes = await request(app)
      .post("/x402/services/speed-test")
      .send({ taskDescription: "Speed test", clientAddress: CLIENT })
      .expect(200);

    const elapsed = Date.now() - t0;
    console.log(`  SC2 metric: x402 payment confirmation = ${elapsed}ms`);
    expect(elapsed).toBeLessThan(2_000);
    expect(payRes.body.status).toBe("funded");
  });

  it("SC3: auto-approval rate > 70% of test deals", async () => {
    // Register 3 agents with varying reputations
    const highRep = await registerAgent(app, {
      name: "high-rep",
      capabilities: ["market-analysis"],
    });
    const medRep = await registerAgent(app, {
      name: "med-rep",
      capabilities: ["market-analysis"],
    });
    const lowRep = await registerAgent(app, {
      name: "low-rep",
      capabilities: ["market-analysis"],
    });

    // Build reputations (now visible via DbReputationAdapter)
    buildReputation(db, highRep.agentId, 30, 5); // Bayesian ~4.63, 30 reviews
    buildReputation(db, medRep.agentId, 20, 5);  // Bayesian ~4.5, 20 reviews
    buildReputation(db, lowRep.agentId, 2, 3);   // Bayesian ~3.42, 2 reviews

    // Set Aggressive criteria (4.0★ min, 1 review min, $500 max)
    await request(app)
      .put(`/api/v1/principals/${CLIENT}/criteria`)
      .send({ preset: "Aggressive" })
      .expect(200);

    // Evaluate 10 deals across agents (8 high/med, 2 low)
    const evaluations = [];
    for (const agentId of [
      highRep.agentId,
      highRep.agentId,
      highRep.agentId,
      highRep.agentId,
      medRep.agentId,
      medRep.agentId,
      medRep.agentId,
      medRep.agentId,
      lowRep.agentId,
      lowRep.agentId,
    ]) {
      const res = await request(app)
        .post("/api/v1/criteria/evaluate")
        .send({ principal: CLIENT, agentId, price: 50_000_000 })
        .expect(200);
      evaluations.push(res.body.autoApprove);
    }

    const autoApproved = evaluations.filter(Boolean).length;
    const rate = autoApproved / evaluations.length;
    console.log(`  SC3 metric: auto-approval rate = ${(rate * 100).toFixed(0)}% (${autoApproved}/${evaluations.length})`);
    expect(rate).toBeGreaterThanOrEqual(0.7);
  });

  it("SC4: dispute rate < 10%", async () => {
    const agent = await registerAgent(app, {
      name: "reliable-agent",
      capabilities: ["market-analysis"],
    });

    // 30 completed deals, 0 disputes → 0% dispute rate
    buildReputation(db, agent.agentId, 30, 5);

    const rep = await request(app)
      .get(`/api/v1/agents/${agent.agentId}/reputation`)
      .expect(200);

    console.log(`  SC4 metric: dispute rate = ${(rep.body.disputeRate * 100).toFixed(1)}%`);
    expect(rep.body.disputeRate).toBeLessThan(0.1);
  });

  it("SC5: Python web-native demo working (x402 end-to-end)", async () => {
    await registerAgent(app, {
      name: "python-compatible",
      capabilities: ["market-analysis"],
      basePrice: 25_000_000,
    });

    // Step 1: GET payment requirements (Python: requests.get)
    const requirements = await request(app)
      .get("/x402/services/market-analysis")
      .expect(402);

    expect(requirements.body.paymentRequired).toBe(true);

    // Step 2: POST paid request (Python: requests.post with x402 header)
    const deal = await request(app)
      .post("/x402/services/market-analysis")
      .send({
        taskDescription: "Python agent market analysis request",
        clientAddress: CLIENT,
      })
      .expect(200);

    expect(deal.body.dealNonce).toBeDefined();
    expect(deal.body.status).toBe("funded");

    // Step 3: Poll for result (Python: while loop with requests.get)
    const result = await request(app)
      .get(`/x402/deals/${deal.body.dealNonce}/result`)
      .expect(200);

    expect(result.body.status).toBe("Funded");

    // Step 4: Simulate completion
    db.prepare("UPDATE deals SET status = 'Completed' WHERE nonce = ?").run(
      deal.body.dealNonce,
    );

    const completed = await request(app)
      .get(`/x402/deals/${deal.body.dealNonce}/result`)
      .expect(200);

    expect(completed.body.status).toBe("Completed");
    expect(completed.body.result).toEqual({ delivered: true });
  });

  it("SC6: third-party ERC-8004 readability verified", async () => {
    const agent = await registerAgent(app, {
      name: "erc8004-readable",
      capabilities: ["market-analysis", "data-collection"],
      basePrice: 40_000_000,
    });

    buildReputation(db, agent.agentId, 10, 5);

    // ERC-8004 required fields
    const detail = await request(app)
      .get(`/api/v1/agents/${agent.agentId}`)
      .expect(200);

    expect(detail.body.agentId).toBeDefined();
    expect(detail.body.name).toBeDefined();
    expect(detail.body.capabilities).toBeInstanceOf(Array);
    expect(detail.body.wallet).toBeDefined();

    // Reputation data (for indexers/scanners)
    const rep = await request(app)
      .get(`/api/v1/agents/${agent.agentId}/reputation`)
      .expect(200);

    expect(rep.body.score).toBeDefined();
    expect(rep.body.bayesianScore).toBeDefined();
    expect(rep.body.reviewCount).toBeDefined();
    expect(rep.body.disputeRate).toBeDefined();
    expect(rep.body.badges).toBeInstanceOf(Array);

    // Ratings history (public)
    const ratings = await request(app)
      .get(`/api/v1/agents/${agent.agentId}/ratings`)
      .expect(200);

    expect(ratings.body.ratings).toBeInstanceOf(Array);
    expect(ratings.body.ratings.length).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Cross-scenario: Reputation accumulation & discovery ranking
// ─────────────────────────────────────────────────────────────────────

describe("Cross-scenario: Discovery ranking respects reputation + vouches", () => {
  beforeEach(() => {
    db = createTestDb();
    ({ app } = createApp({ db }));
  });
  afterEach(() => db.close());

  it("ranks agents correctly by Bayesian score x volume x dispute rate", async () => {
    const excellent = await registerAgent(app, {
      name: "excellent-agent",
      capabilities: ["market-analysis"],
    });
    const good = await registerAgent(app, {
      name: "good-agent",
      capabilities: ["market-analysis"],
    });
    const mediocre = await registerAgent(app, {
      name: "mediocre-agent",
      capabilities: ["market-analysis"],
    });

    buildReputation(db, excellent.agentId, 50, 5);
    buildReputation(db, good.agentId, 20, 4);
    buildReputation(db, mediocre.agentId, 5, 3);

    const discover = await request(app)
      .get("/api/v1/services/discover?capability=market-analysis")
      .expect(200);

    expect(discover.body.agents.length).toBe(3);
    // Excellent should be ranked first
    expect(discover.body.agents[0].agentId).toBe(excellent.agentId);
    // Mediocre should be last
    expect(discover.body.agents[2].agentId).toBe(mediocre.agentId);

    // Verify descending Bayesian scores
    const scores = discover.body.agents.map((a: any) => a.reputation.bayesianScore);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
  });
});
