import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { createTestDb } from "../src/db/index.js";

let db: Database.Database;
let app: ReturnType<typeof createApp>["app"];

const CLIENT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const AGENT_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

beforeEach(async () => {
  db = createTestDb();
  ({ app } = createApp({ db }));

  // Register an agent first
  await request(app)
    .post("/api/v1/services/register")
    .send({
      name: "test-service-agent",
      capabilities: ["market-analysis"],
      basePrice: 50000000,
      wallet: AGENT_WALLET,
    });
});

afterEach(() => {
  db.close();
});

describe("POST /api/v1/deals/create", () => {
  it("creates a deal that requires human approval (new agent, no reputation)", async () => {
    const res = await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId: "agent-xyz",
        clientAddress: CLIENT,
        priceUSDC: 30000000, // $30
        taskDescription: "Analyze Paraguay market Q1 2026",
      })
      .expect(201);

    expect(res.body.requiresHumanApproval).toBe(true);
    expect(res.body.pendingApprovalId).toBeDefined();
    expect(res.body.failedChecks).toContain("INSUFFICIENT_REPUTATION");
  });

  it("returns 400 for missing agentId", async () => {
    await request(app)
      .post("/api/v1/deals/create")
      .send({
        clientAddress: CLIENT,
        priceUSDC: 30000000,
      })
      .expect(400);
  });

  it("returns 400 for zero price", async () => {
    await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId: "agent-xyz",
        clientAddress: CLIENT,
        priceUSDC: 0,
      })
      .expect(400);
  });
});

describe("GET /api/v1/deals/pending/:principal", () => {
  it("lists pending approvals for a principal", async () => {
    // Create a deal that will be flagged
    await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId: "agent-xyz",
        clientAddress: CLIENT,
        priceUSDC: 30000000,
        taskDescription: "Test task",
      })
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/deals/pending/${CLIENT}`)
      .expect(200);

    expect(res.body.approvals).toHaveLength(1);
    expect(res.body.approvals[0].status).toBe("pending");
  });
});

describe("POST /api/v1/deals/approve/:id", () => {
  it("approves a pending deal", async () => {
    const createRes = await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId: "agent-xyz",
        clientAddress: CLIENT,
        priceUSDC: 30000000,
        taskDescription: "Test task",
      })
      .expect(201);

    const res = await request(app)
      .post(`/api/v1/deals/approve/${createRes.body.pendingApprovalId}`)
      .expect(200);

    expect(res.body.status).toBe("approved");
  });

  it("returns 404 for non-existent approval", async () => {
    await request(app)
      .post("/api/v1/deals/approve/99999")
      .expect(404);
  });
});

describe("POST /api/v1/deals/reject/:id", () => {
  it("rejects a pending deal", async () => {
    const createRes = await request(app)
      .post("/api/v1/deals/create")
      .send({
        agentId: "agent-xyz",
        clientAddress: CLIENT,
        priceUSDC: 30000000,
        taskDescription: "Test task",
      })
      .expect(201);

    const res = await request(app)
      .post(`/api/v1/deals/reject/${createRes.body.pendingApprovalId}`)
      .expect(200);

    expect(res.body.status).toBe("rejected");
  });
});

describe("GET /api/v1/deals", () => {
  it("returns empty deals list initially", async () => {
    const res = await request(app).get("/api/v1/deals").expect(200);
    expect(res.body.deals).toHaveLength(0);
  });
});
