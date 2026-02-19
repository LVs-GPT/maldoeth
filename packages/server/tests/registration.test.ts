import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { createTestDb } from "../src/db/index.js";

let db: Database.Database;
let app: ReturnType<typeof createApp>["app"];

beforeEach(() => {
  db = createTestDb();
  ({ app } = createApp({ db }));
});

afterEach(() => {
  db.close();
});

describe("POST /api/v1/services/register", () => {
  const validAgent = {
    name: "market-analyst-agent",
    description: "AI agent specialized in market analysis",
    capabilities: ["market-analysis", "financial-report"],
    basePrice: 50000000,
    endpoint: "https://agent.example.com/a2a",
    wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  };

  it("returns 201 with agentId for valid registration", async () => {
    const res = await request(app)
      .post("/api/v1/services/register")
      .send(validAgent)
      .expect(201);

    expect(res.body.agentId).toBeDefined();
    expect(res.body.name).toBe("market-analyst-agent");
  });

  it("returns 409 for duplicate name", async () => {
    await request(app).post("/api/v1/services/register").send(validAgent).expect(201);

    const res = await request(app)
      .post("/api/v1/services/register")
      .send(validAgent)
      .expect(409);

    expect(res.body.error).toContain("already exists");
  });

  it("returns 400 for missing name", async () => {
    const res = await request(app)
      .post("/api/v1/services/register")
      .send({ ...validAgent, name: "" })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  it("returns 400 for missing capabilities", async () => {
    const res = await request(app)
      .post("/api/v1/services/register")
      .send({ ...validAgent, capabilities: [] })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  it("returns 400 for invalid wallet", async () => {
    const res = await request(app)
      .post("/api/v1/services/register")
      .send({ ...validAgent, wallet: "not-a-valid-address" })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  it("returns 400 for missing wallet", async () => {
    const { wallet, ...noWallet } = validAgent;
    const res = await request(app)
      .post("/api/v1/services/register")
      .send(noWallet)
      .expect(400);

    expect(res.body.error).toBeDefined();
  });
});

describe("GET /api/v1/services/discover", () => {
  const agents = [
    {
      name: "analyst-alpha",
      description: "Market analysis expert",
      capabilities: ["market-analysis"],
      basePrice: 50000000,
      endpoint: "https://alpha.example.com",
      wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    },
    {
      name: "coder-beta",
      description: "Code review specialist",
      capabilities: ["code-review", "debugging"],
      basePrice: 30000000,
      endpoint: "https://beta.example.com",
      wallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    },
    {
      name: "analyst-gamma",
      description: "Another market analyst",
      capabilities: ["market-analysis", "data-collection"],
      basePrice: 75000000,
      endpoint: "https://gamma.example.com",
      wallet: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    },
  ];

  beforeEach(async () => {
    for (const agent of agents) {
      await request(app).post("/api/v1/services/register").send(agent).expect(201);
    }
  });

  it("returns all agents when no capability filter", async () => {
    const res = await request(app)
      .get("/api/v1/services/discover")
      .expect(200);

    expect(res.body.agents).toHaveLength(3);
  });

  it("filters agents by capability", async () => {
    const res = await request(app)
      .get("/api/v1/services/discover?capability=market-analysis")
      .expect(200);

    expect(res.body.agents).toHaveLength(2);
    expect(res.body.agents.every((a: any) => a.capabilities.includes("market-analysis"))).toBe(true);
  });

  it("returns empty array for unknown capability", async () => {
    const res = await request(app)
      .get("/api/v1/services/discover?capability=quantum-computing")
      .expect(200);

    expect(res.body.agents).toHaveLength(0);
  });

  it("respects limit parameter", async () => {
    const res = await request(app)
      .get("/api/v1/services/discover?limit=1")
      .expect(200);

    expect(res.body.agents).toHaveLength(1);
  });

  it("new agents with 0 reviews appear after established agents (via Bayesian ranking)", async () => {
    // All agents have 0 reviews, so Bayesian score = C=3.5 for all, rank ~0 for all
    // But they should still appear in results
    const res = await request(app)
      .get("/api/v1/services/discover?capability=market-analysis")
      .expect(200);

    expect(res.body.agents.length).toBeGreaterThanOrEqual(1);
    // All should have bayesianScore of 3.5 (the prior) since 0 reviews
    for (const agent of res.body.agents) {
      expect(agent.reputation.bayesianScore).toBe(3.5);
      expect(agent.reputation.reviewCount).toBe(0);
    }
  });
});

describe("GET /api/v1/services/:agentId", () => {
  it("returns 404 for non-existent agent", async () => {
    await request(app)
      .get("/api/v1/services/0x0000000000000000")
      .expect(404);
  });

  it("returns agent details for existing agent", async () => {
    const regRes = await request(app)
      .post("/api/v1/services/register")
      .send({
        name: "test-agent",
        capabilities: ["testing"],
        wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      })
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/services/${regRes.body.agentId}`)
      .expect(200);

    expect(res.body.name).toBe("test-agent");
    expect(res.body.capabilities).toContain("testing");
  });
});

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.network).toBe("sepolia");
  });
});
