/**
 * Seed script for demo data: agents, ratings, and vouches.
 * Run from packages/server/: npx tsx src/seed-demo.ts
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { getDb } from "./db/index.js";
import { ethers } from "ethers";

const db = getDb();

// Ensure ratings + vouches tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_nonce TEXT NOT NULL,
    rater_address TEXT NOT NULL,
    ratee_agent_id TEXT NOT NULL,
    score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
    comment TEXT DEFAULT '',
    tx_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(deal_nonce, rater_address)
  );
  CREATE TABLE IF NOT EXISTS vouches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_agent_id TEXT NOT NULL,
    vouchee_agent_id TEXT NOT NULL,
    voucher_wallet TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(voucher_agent_id, vouchee_agent_id)
  );
`);

const AGENTS = [
  {
    name: "AlphaResearch",
    description: "On-chain market analysis agent. Fetches DEX volumes, TVL trends, and token flows across L2s.",
    capabilities: ["market-analysis", "data-collection", "financial-report"],
    basePrice: 500_000, // $0.50
    endpoint: "https://alpha-research.demo.maldo.eth",
  },
  {
    name: "CodeGuardian",
    description: "Automated smart contract auditor. Runs Slither, Mythril, and custom heuristic checks.",
    capabilities: ["code-review", "security-audit"],
    basePrice: 2_000_000, // $2.00
    endpoint: "https://code-guardian.demo.maldo.eth",
  },
  {
    name: "LinguaAgent",
    description: "Multilingual translation agent. Supports 40+ languages with context-aware technical translations.",
    capabilities: ["translation", "content-creation"],
    basePrice: 300_000, // $0.30
    endpoint: "https://lingua-agent.demo.maldo.eth",
  },
  {
    name: "DataCrawler",
    description: "Web3 data collection agent. Indexes events, scrapes public APIs, and aggregates cross-chain data.",
    capabilities: ["data-collection", "market-analysis"],
    basePrice: 800_000, // $0.80
    endpoint: "https://data-crawler.demo.maldo.eth",
  },
  {
    name: "FinanceBot",
    description: "Generates quarterly financial reports with on-chain treasury analysis and DeFi yield breakdowns.",
    capabilities: ["financial-report", "data-collection"],
    basePrice: 5_000_000, // $5.00
    endpoint: "https://finance-bot.demo.maldo.eth",
  },
  {
    name: "NexusOracle",
    description: "Cross-chain oracle agent. Bridges price feeds and state proofs between EVM chains.",
    capabilities: ["market-analysis", "data-collection", "oracle"],
    basePrice: 1_500_000, // $1.50
    endpoint: "https://nexus-oracle.demo.maldo.eth",
  },
  {
    name: "AuditPilot",
    description: "End-to-end audit workflow agent. Generates findings, writes PoC exploits, and drafts reports.",
    capabilities: ["code-review", "security-audit", "financial-report"],
    basePrice: 8_000_000, // $8.00
    endpoint: "https://audit-pilot.demo.maldo.eth",
  },
  {
    name: "SwiftTranslate",
    description: "Real-time translation with low latency. Optimized for chat and streaming content.",
    capabilities: ["translation"],
    basePrice: 100_000, // $0.10
    endpoint: "https://swift-translate.demo.maldo.eth",
  },
];

function genWallet(seed: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(seed)).slice(0, 42);
}

function genAgentId(name: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(name)).slice(0, 18);
}

// ─── Insert agents ───────────────────────────────────────────────────
const insertAgent = db.prepare(
  `INSERT OR IGNORE INTO agents (agent_id, name, description, capabilities, base_price, endpoint, wallet)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

const agentIds: string[] = [];

for (const a of AGENTS) {
  const agentId = genAgentId(a.name);
  const wallet = genWallet(a.name + "-wallet");
  insertAgent.run(agentId, a.name, a.description, JSON.stringify(a.capabilities), a.basePrice, a.endpoint, wallet);
  agentIds.push(agentId);
  console.log(`  Agent: ${a.name} (${agentId})`);
}

// ─── Insert ratings (fake completed deals + ratings) ─────────────────
const insertDeal = db.prepare(
  `INSERT OR IGNORE INTO deals (nonce, client, server, amount, status, task_description)
   VALUES (?, ?, ?, ?, 'Completed', ?)`,
);
const insertRating = db.prepare(
  `INSERT OR IGNORE INTO ratings (deal_nonce, rater_address, ratee_agent_id, score, comment)
   VALUES (?, ?, ?, ?, ?)`,
);

const COMMENTS = [
  "Fast and accurate results.",
  "Great quality, would hire again.",
  "Solid work, delivered on time.",
  "Above expectations.",
  "Good but took a bit longer than expected.",
  "Excellent analysis, very thorough.",
  "Perfectly executed.",
  "Reliable agent.",
];

// Give each agent some ratings (varying quality)
const RATING_PROFILES: Record<number, { count: number; scores: number[] }> = {
  0: { count: 12, scores: [5, 5, 5, 4, 5, 5, 4, 5, 5, 5, 4, 5] },     // AlphaResearch — 4.75
  1: { count: 8, scores: [5, 5, 4, 5, 5, 5, 4, 5] },                     // CodeGuardian — 4.75
  2: { count: 15, scores: [5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 5, 5, 4, 5, 5] }, // LinguaAgent — 4.67
  3: { count: 6, scores: [4, 3, 4, 5, 4, 3] },                            // DataCrawler — 3.83
  4: { count: 3, scores: [5, 5, 4] },                                      // FinanceBot — 4.67
  5: { count: 20, scores: [5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 4] }, // NexusOracle — 4.80
  6: { count: 0, scores: [] },                                              // AuditPilot — new agent, no reviews
  7: { count: 2, scores: [3, 4] },                                         // SwiftTranslate — 3.50
};

for (const [idx, profile] of Object.entries(RATING_PROFILES)) {
  const agentId = agentIds[Number(idx)];
  for (let i = 0; i < profile.count; i++) {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const rater = genWallet(`rater-${idx}-${i}`);
    const score = profile.scores[i % profile.scores.length];
    const comment = COMMENTS[i % COMMENTS.length];

    insertDeal.run(nonce, rater, agentId, AGENTS[Number(idx)].basePrice, `Demo task #${i + 1}`);
    insertRating.run(nonce, rater, agentId, score, comment);
  }
}

// ─── Insert vouches ──────────────────────────────────────────────────
const insertVouch = db.prepare(
  `INSERT OR IGNORE INTO vouches (voucher_agent_id, vouchee_agent_id, voucher_wallet, weight)
   VALUES (?, ?, ?, ?)`,
);

// AlphaResearch vouches for CodeGuardian (weight based on AlphaResearch's reputation)
insertVouch.run(agentIds[0], agentIds[1], genWallet(AGENTS[0].name + "-wallet"), 0.85);
// CodeGuardian vouches for AlphaResearch
insertVouch.run(agentIds[1], agentIds[0], genWallet(AGENTS[1].name + "-wallet"), 0.82);
// NexusOracle vouches for AlphaResearch (high rep voucher)
insertVouch.run(agentIds[5], agentIds[0], genWallet(AGENTS[5].name + "-wallet"), 0.92);
// NexusOracle vouches for LinguaAgent
insertVouch.run(agentIds[5], agentIds[2], genWallet(AGENTS[5].name + "-wallet"), 0.90);
// LinguaAgent vouches for DataCrawler
insertVouch.run(agentIds[2], agentIds[3], genWallet(AGENTS[2].name + "-wallet"), 0.70);
// AlphaResearch vouches for FinanceBot
insertVouch.run(agentIds[0], agentIds[4], genWallet(AGENTS[0].name + "-wallet"), 0.85);

console.log("\nSeed data inserted successfully.");
console.log(`  ${AGENTS.length} agents`);
console.log(`  ${Object.values(RATING_PROFILES).reduce((s, p) => s + p.count, 0)} ratings`);
console.log(`  6 vouches`);
