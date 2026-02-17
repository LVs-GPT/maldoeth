import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { createTestDb } from "../src/db/index.js";

let db: Database.Database;
let app: ReturnType<typeof createApp>["app"];

const PRINCIPAL = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

beforeEach(() => {
  db = createTestDb();
  ({ app } = createApp({ db }));
});

afterEach(() => {
  db.close();
});

describe("GET /api/v1/principals/:address/criteria", () => {
  it("returns Conservative defaults when no criteria set", async () => {
    const res = await request(app)
      .get(`/api/v1/principals/${PRINCIPAL}/criteria`)
      .expect(200);

    expect(res.body.preset).toBe("Conservative");
    expect(res.body.minReputation).toBe(480);
    expect(res.body.minReviewCount).toBe(5);
    expect(res.body.maxPriceUSDC).toBe(50000000);
    expect(res.body.requireHumanApproval).toBe(false);
  });
});

describe("PUT /api/v1/principals/:address/criteria", () => {
  it("applies Balanced preset correctly", async () => {
    await request(app)
      .put(`/api/v1/principals/${PRINCIPAL}/criteria`)
      .send({ preset: "Balanced" })
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/principals/${PRINCIPAL}/criteria`)
      .expect(200);

    expect(res.body.preset).toBe("Balanced");
    expect(res.body.minReputation).toBe(450);
    expect(res.body.minReviewCount).toBe(3);
    expect(res.body.maxPriceUSDC).toBe(100000000);
  });

  it("applies Aggressive preset correctly", async () => {
    await request(app)
      .put(`/api/v1/principals/${PRINCIPAL}/criteria`)
      .send({ preset: "Aggressive" })
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/principals/${PRINCIPAL}/criteria`)
      .expect(200);

    expect(res.body.preset).toBe("Aggressive");
    expect(res.body.minReputation).toBe(400);
    expect(res.body.minReviewCount).toBe(1);
    expect(res.body.maxPriceUSDC).toBe(500000000);
  });

  it("allows custom criteria", async () => {
    await request(app)
      .put(`/api/v1/principals/${PRINCIPAL}/criteria`)
      .send({
        minReputation: 460,
        minReviewCount: 10,
        maxPriceUSDC: 200000000,
        requireHumanApproval: true,
      })
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/principals/${PRINCIPAL}/criteria`)
      .expect(200);

    expect(res.body.preset).toBe("Custom");
    expect(res.body.minReputation).toBe(460);
    expect(res.body.minReviewCount).toBe(10);
    expect(res.body.maxPriceUSDC).toBe(200000000);
    expect(res.body.requireHumanApproval).toBe(true);
  });
});

describe("POST /api/v1/criteria/evaluate", () => {
  it("returns autoApprove=false for agent with no reputation (Conservative defaults)", async () => {
    const res = await request(app)
      .post("/api/v1/criteria/evaluate")
      .send({
        principal: PRINCIPAL,
        agentId: "agent-123",
        price: 25000000, // $25
      })
      .expect(200);

    // Agent has 0 reputation, Conservative requires 480 rep + 5 reviews
    expect(res.body.autoApprove).toBe(false);
    expect(res.body.failedChecks).toContain("INSUFFICIENT_REPUTATION");
    expect(res.body.failedChecks).toContain("INSUFFICIENT_REVIEWS");
  });

  it("returns autoApprove=false when price exceeds limit", async () => {
    // Set Aggressive (low barriers)
    await request(app)
      .put(`/api/v1/principals/${PRINCIPAL}/criteria`)
      .send({ preset: "Aggressive" })
      .expect(200);

    const res = await request(app)
      .post("/api/v1/criteria/evaluate")
      .send({
        principal: PRINCIPAL,
        agentId: "agent-123",
        price: 600000000, // $600 — exceeds Aggressive max $500
      })
      .expect(200);

    expect(res.body.autoApprove).toBe(false);
    expect(res.body.failedChecks).toContain("PRICE_EXCEEDS_LIMIT");
  });

  it("returns autoApprove=false for high value deals (> $100)", async () => {
    const res = await request(app)
      .post("/api/v1/criteria/evaluate")
      .send({
        principal: PRINCIPAL,
        agentId: "agent-123",
        price: 150000000, // $150
      })
      .expect(200);

    expect(res.body.autoApprove).toBe(false);
    expect(res.body.failedChecks).toContain("HIGH_VALUE_SAFEGUARD");
  });

  it("returns autoApprove=false when requireHumanApproval is true", async () => {
    await request(app)
      .put(`/api/v1/principals/${PRINCIPAL}/criteria`)
      .send({ requireHumanApproval: true })
      .expect(200);

    const res = await request(app)
      .post("/api/v1/criteria/evaluate")
      .send({
        principal: PRINCIPAL,
        agentId: "agent-123",
        price: 10000000, // $10
      })
      .expect(200);

    expect(res.body.autoApprove).toBe(false);
    expect(res.body.failedChecks).toContain("HUMAN_APPROVAL_REQUIRED");
  });

  it("returns 400 for missing principal", async () => {
    await request(app)
      .post("/api/v1/criteria/evaluate")
      .send({ agentId: "agent-123", price: 10000000 })
      .expect(400);
  });
});
