import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { ethers } from "ethers";
import type Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { createTestDb } from "../src/db/index.js";

let db: Database.Database;
let app: ReturnType<typeof createApp>["app"];

// Two test wallets (Hardhat default accounts)
const WALLET_A = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const PRIVATE_KEY_A = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const WALLET_B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const PRIVATE_KEY_B = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const VOUCH_DOMAIN = {
  name: "MaldoVouch",
  version: "1",
  chainId: 11155111,
};

const VOUCH_TYPES = {
  Vouch: [
    { name: "voucher", type: "string" },
    { name: "vouchee", type: "string" },
  ],
};

let agentA_id: string;
let agentB_id: string;

async function signVouch(privateKey: string, voucherAgentId: string, voucheeAgentId: string): Promise<string> {
  const signer = new ethers.Wallet(privateKey);
  return signer.signTypedData(VOUCH_DOMAIN, VOUCH_TYPES, {
    voucher: voucherAgentId,
    vouchee: voucheeAgentId,
  });
}

beforeEach(async () => {
  db = createTestDb();
  ({ app } = createApp({ db }));

  // Register two agents
  const resA = await request(app)
    .post("/api/v1/services/register")
    .send({
      name: "agent-alpha",
      capabilities: ["analysis"],
      wallet: WALLET_A,
    });
  agentA_id = resA.body.agentId;

  const resB = await request(app)
    .post("/api/v1/services/register")
    .send({
      name: "agent-beta",
      capabilities: ["coding"],
      wallet: WALLET_B,
    });
  agentB_id = resB.body.agentId;
});

afterEach(() => {
  db.close();
});

describe("Vouching — happy path", () => {
  it("allows agent A to vouch for agent B with valid EIP-712 signature", async () => {
    const signature = await signVouch(PRIVATE_KEY_A, agentA_id, agentB_id);

    const res = await request(app)
      .post(`/api/v1/agents/${agentB_id}/vouch`)
      .send({
        voucherAgentId: agentA_id,
        voucherWallet: WALLET_A,
        signature,
      })
      .expect(201);

    expect(res.body.voucherAgentId).toBe(agentA_id);
    expect(res.body.voucheeAgentId).toBe(agentB_id);
    expect(res.body.weight).toBeGreaterThanOrEqual(0);
    expect(res.body.weight).toBeLessThanOrEqual(1);
  });

  it("lists vouches for an agent", async () => {
    const signature = await signVouch(PRIVATE_KEY_A, agentA_id, agentB_id);
    await request(app)
      .post(`/api/v1/agents/${agentB_id}/vouch`)
      .send({ voucherAgentId: agentA_id, voucherWallet: WALLET_A, signature });

    const res = await request(app)
      .get(`/api/v1/agents/${agentB_id}/vouches`)
      .expect(200);

    expect(res.body.vouches).toHaveLength(1);
    expect(res.body.vouches[0].voucher_name).toBe("agent-alpha");
    expect(res.body.totalBonus).toBeGreaterThanOrEqual(0);
  });

  it("allows withdrawing a vouch", async () => {
    const signature = await signVouch(PRIVATE_KEY_A, agentA_id, agentB_id);
    await request(app)
      .post(`/api/v1/agents/${agentB_id}/vouch`)
      .send({ voucherAgentId: agentA_id, voucherWallet: WALLET_A, signature });

    // Withdraw
    await request(app)
      .delete(`/api/v1/agents/${agentB_id}/vouch/${agentA_id}`)
      .expect(200);

    // Verify removed
    const res = await request(app)
      .get(`/api/v1/agents/${agentB_id}/vouches`)
      .expect(200);

    expect(res.body.vouches).toHaveLength(0);
    expect(res.body.totalBonus).toBe(0);
  });
});

describe("Vouching — weight from reputation", () => {
  it("voucher with higher reputation gives higher weight", async () => {
    // Give agent A some completed deals with ratings
    for (let i = 0; i < 5; i++) {
      const nonce = `0xdeal_${i}`;
      db.prepare(
        `INSERT INTO deals (nonce, deal_id, client, server, amount, status)
         VALUES (?, ?, ?, ?, 50000000, 'Completed')`,
      ).run(nonce, i, WALLET_B.toLowerCase(), agentA_id);

      db.prepare(
        `INSERT INTO ratings (deal_nonce, rater_address, ratee_agent_id, score, comment)
         VALUES (?, ?, ?, 5, 'Great')`,
      ).run(nonce, WALLET_B.toLowerCase(), agentA_id);
    }

    // Vouch from well-rated A → B
    const sigAtoB = await signVouch(PRIVATE_KEY_A, agentA_id, agentB_id);
    const resHigh = await request(app)
      .post(`/api/v1/agents/${agentB_id}/vouch`)
      .send({ voucherAgentId: agentA_id, voucherWallet: WALLET_A, signature: sigAtoB })
      .expect(201);

    // Weight should be higher than a brand new agent's vouch
    // New agent Bayesian: (0/(0+10))*0 + (10/(0+10))*3.5 = 3.5 → weight = 3.5*0.2 = 0.7
    // Agent A with 5 ratings of 5: Bayesian = (5/15)*5 + (10/15)*3.5 = 1.67+2.33 = 4.0 → weight = 4.0*0.2 = 0.8
    expect(resHigh.body.weight).toBeGreaterThan(0.7);
  });
});

describe("Vouching — validation", () => {
  it("rejects self-vouching", async () => {
    const signature = await signVouch(PRIVATE_KEY_A, agentA_id, agentA_id);

    const res = await request(app)
      .post(`/api/v1/agents/${agentA_id}/vouch`)
      .send({ voucherAgentId: agentA_id, voucherWallet: WALLET_A, signature })
      .expect(400);

    expect(res.body.error).toContain("Self-vouching");
  });

  it("rejects duplicate vouch", async () => {
    const signature = await signVouch(PRIVATE_KEY_A, agentA_id, agentB_id);

    await request(app)
      .post(`/api/v1/agents/${agentB_id}/vouch`)
      .send({ voucherAgentId: agentA_id, voucherWallet: WALLET_A, signature })
      .expect(201);

    const res = await request(app)
      .post(`/api/v1/agents/${agentB_id}/vouch`)
      .send({ voucherAgentId: agentA_id, voucherWallet: WALLET_A, signature })
      .expect(409);

    expect(res.body.error).toContain("already exists");
  });

  it("rejects signature from wrong wallet", async () => {
    // Sign with wallet B's key, but claim it's wallet A
    const signature = await signVouch(PRIVATE_KEY_B, agentA_id, agentB_id);

    const res = await request(app)
      .post(`/api/v1/agents/${agentB_id}/vouch`)
      .send({ voucherAgentId: agentA_id, voucherWallet: WALLET_A, signature })
      .expect(403);

    expect(res.body.error).toContain("signer does not match");
  });

  it("rejects vouch for non-existent agent", async () => {
    const fakeId = "0x0000000000000000";
    const signature = await signVouch(PRIVATE_KEY_A, agentA_id, fakeId);

    const res = await request(app)
      .post(`/api/v1/agents/${fakeId}/vouch`)
      .send({ voucherAgentId: agentA_id, voucherWallet: WALLET_A, signature })
      .expect(404);

    expect(res.body.error).toContain("Vouchee agent not found");
  });

  it("rejects withdraw of non-existent vouch", async () => {
    await request(app)
      .delete(`/api/v1/agents/${agentB_id}/vouch/${agentA_id}`)
      .expect(404);
  });
});

describe("Circular vouching — diminishing returns", () => {
  it("A→B and B→A both work but total bonus is capped", async () => {
    // A vouches for B
    const sigAtoB = await signVouch(PRIVATE_KEY_A, agentA_id, agentB_id);
    await request(app)
      .post(`/api/v1/agents/${agentB_id}/vouch`)
      .send({ voucherAgentId: agentA_id, voucherWallet: WALLET_A, signature: sigAtoB })
      .expect(201);

    // B vouches for A
    const sigBtoA = await signVouch(PRIVATE_KEY_B, agentB_id, agentA_id);
    await request(app)
      .post(`/api/v1/agents/${agentA_id}/vouch`)
      .send({ voucherAgentId: agentB_id, voucherWallet: WALLET_B, signature: sigBtoA })
      .expect(201);

    // Both have vouches, but bonus is capped at 2.0
    const resA = await request(app).get(`/api/v1/agents/${agentA_id}/vouches`).expect(200);
    const resB = await request(app).get(`/api/v1/agents/${agentB_id}/vouches`).expect(200);

    expect(resA.body.totalBonus).toBeLessThanOrEqual(2.0);
    expect(resB.body.totalBonus).toBeLessThanOrEqual(2.0);
  });
});
