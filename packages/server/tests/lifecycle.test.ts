import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { createTestDb } from "../src/db/index.js";

/**
 * Full deal lifecycle integration test:
 * Register agent → Discover → Create deal → Rate → Check reputation
 */

let db: Database.Database;
let app: ReturnType<typeof createApp>["app"];

const CLIENT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OPERATOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

beforeEach(() => {
  db = createTestDb();
  ({ app } = createApp({ db }));
});

afterEach(() => {
  db.close();
});

describe("Full Deal Lifecycle: register → discover → deal → rate → reputation", () => {
  it("runs complete happy path", async () => {
    // 1. Register a service agent
    const regRes = await request(app)
      .post("/api/v1/services/register")
      .send({
        name: "market-analyst-pro",
        description: "Expert market analysis agent",
        capabilities: ["market-analysis", "financial-report"],
        basePrice: 50000000, // $50 USDC
        endpoint: "https://analyst.example.com/a2a",
        wallet: OPERATOR,
      })
      .expect(201);

    expect(regRes.body.agentId).toBeDefined();
    const agentId = regRes.body.agentId;

    // 2. Discover agents by capability
    const discoverRes = await request(app)
      .get("/api/v1/services/discover?capability=market-analysis")
      .expect(200);

    expect(discoverRes.body.agents).toHaveLength(1);
    expect(discoverRes.body.agents[0].name).toBe("market-analyst-pro");
    expect(discoverRes.body.agents[0].reputation.bayesianScore).toBe(3.5); // Prior only, no reviews

    // 3. Set criteria to Aggressive (low barriers for testing)
    await request(app)
      .put(`/api/v1/principals/${CLIENT}/criteria`)
      .send({ preset: "Aggressive" })
      .expect(200);

    // 4. Evaluate deal — will still fail because agent has no reputation
    const evalRes = await request(app)
      .post("/api/v1/criteria/evaluate")
      .send({ principal: CLIENT, agentId, price: 50000000 })
      .expect(200);

    expect(evalRes.body.autoApprove).toBe(false);
    expect(evalRes.body.failedChecks).toContain("INSUFFICIENT_REPUTATION");

    // 5. Create deal — requires human approval
    const dealRes = await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId,
        clientAddress: CLIENT,
        priceUSDC: 50000000,
        taskDescription: "Analyze Paraguay market Q1 2026",
        principal: CLIENT,
      })
      .expect(201);

    expect(dealRes.body.requiresHumanApproval).toBe(true);
    expect(dealRes.body.pendingApprovalId).toBeDefined();

    // 6. Human approves the deal
    const approveRes = await request(app)
      .post(`/api/v1/deals/approve/${dealRes.body.pendingApprovalId}`)
      .expect(200);

    expect(approveRes.body.status).toBe("approved");

    // 7. Simulate deal completion (insert a completed deal for rating test)
    db.prepare(
      `INSERT INTO deals (nonce, deal_id, client, server, amount, status, task_description)
       VALUES (?, 1, ?, ?, 50000000, 'Completed', 'Market analysis')`,
    ).run("0xtest_nonce_abc123", CLIENT.toLowerCase(), agentId);

    // 8. Rate the agent
    const rateRes = await request(app)
      .post(`/api/v1/agents/${agentId}/rate`)
      .send({
        dealNonce: "0xtest_nonce_abc123",
        raterAddress: CLIENT,
        score: 5,
        comment: "Excellent market analysis, very thorough",
      })
      .expect(200);

    expect(rateRes.body.score).toBe(5);

    // 9. Check updated reputation
    const repRes = await request(app)
      .get(`/api/v1/agents/${agentId}/reputation`)
      .expect(200);

    expect(repRes.body.reviewCount).toBe(1);
    expect(repRes.body.score).toBe(5);
    // Bayesian: (1/(1+10))*5 + (10/(1+10))*3.5 = 0.4545 + 3.1818 = 3.636
    expect(repRes.body.bayesianScore).toBeGreaterThan(3.5);
    expect(repRes.body.bayesianScore).toBeLessThan(5);
  });
});

describe("x402 flow: web-native agent path", () => {
  beforeEach(async () => {
    await request(app)
      .post("/api/v1/services/register")
      .send({
        name: "code-reviewer",
        capabilities: ["code-review"],
        basePrice: 30000000,
        wallet: OPERATOR,
      });
  });

  it("returns 402 with payment requirements", async () => {
    const res = await request(app)
      .get("/x402/services/code-review")
      .expect(402);

    expect(res.body.paymentRequired).toBe(true);
    expect(res.body.requirements.scheme).toBe("exact");
    expect(res.body.requirements.network).toBe("eip155:11155111");
    expect(res.body.requirements.amount).toBe("30000000");
    expect(res.body.agent.name).toBe("code-reviewer");
  });

  it("processes paid request and returns deal", async () => {
    const res = await request(app)
      .post("/x402/services/code-review")
      .send({
        taskDescription: "Review my smart contract for vulnerabilities",
        clientAddress: CLIENT,
      })
      .expect(200);

    expect(res.body.dealNonce).toBeDefined();
    expect(res.body.agentName).toBe("code-reviewer");
    expect(res.body.status).toBe("funded");

    // Poll for result
    const resultRes = await request(app)
      .get(`/x402/deals/${res.body.dealNonce}/result`)
      .expect(200);

    expect(resultRes.body.status).toBe("Funded");
  });

  it("returns 404 for unknown capability", async () => {
    await request(app)
      .get("/x402/services/quantum-computing")
      .expect(404);
  });
});

describe("Rating edge cases", () => {
  const dealNonce = "0xtest_deal_for_rating";

  beforeEach(async () => {
    // Register agent and create completed deal
    await request(app)
      .post("/api/v1/services/register")
      .send({
        name: "test-agent",
        capabilities: ["testing"],
        wallet: OPERATOR,
      });

    db.prepare(
      `INSERT INTO deals (nonce, deal_id, client, server, amount, status)
       VALUES (?, 1, ?, 'agent-id', 50000000, 'Completed')`,
    ).run(dealNonce, CLIENT.toLowerCase());
  });

  it("rejects rating from non-participant", async () => {
    const res = await request(app)
      .post("/api/v1/agents/agent-id/rate")
      .send({
        dealNonce,
        raterAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // Not a participant
        score: 5,
      })
      .expect(403);

    expect(res.body.error).toContain("participants");
  });

  it("rejects duplicate rating", async () => {
    await request(app)
      .post("/api/v1/agents/agent-id/rate")
      .send({ dealNonce, raterAddress: CLIENT, score: 5 })
      .expect(200);

    const res = await request(app)
      .post("/api/v1/agents/agent-id/rate")
      .send({ dealNonce, raterAddress: CLIENT, score: 4 })
      .expect(409);

    expect(res.body.error).toContain("already submitted");
  });

  it("rejects rating for non-completed deal", async () => {
    const fundedNonce = "0xfunded_deal";
    db.prepare(
      `INSERT INTO deals (nonce, deal_id, client, server, amount, status)
       VALUES (?, 2, ?, 'agent-id', 50000000, 'Funded')`,
    ).run(fundedNonce, CLIENT.toLowerCase());

    const res = await request(app)
      .post("/api/v1/agents/agent-id/rate")
      .send({ dealNonce: fundedNonce, raterAddress: CLIENT, score: 5 })
      .expect(400);

    expect(res.body.error).toContain("completed");
  });

  it("rejects invalid score (out of range)", async () => {
    const res = await request(app)
      .post("/api/v1/agents/agent-id/rate")
      .send({ dealNonce, raterAddress: CLIENT, score: 6 })
      .expect(400);

    expect(res.body.error).toContain("between 1 and 5");
  });
});
