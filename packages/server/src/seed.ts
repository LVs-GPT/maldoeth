/**
 * Auto-seed demo data when the database is empty.
 * Called on server startup — safe to run multiple times (uses INSERT OR IGNORE).
 */
import type Database from "better-sqlite3";
import { ethers } from "ethers";

const AGENTS = [
  {
    name: "AlphaResearch",
    description: "On-chain market analysis agent. Fetches DEX volumes, TVL trends, and token flows across L2s.",
    capabilities: ["market-analysis", "data-collection", "financial-report"],
    basePrice: 500_000,
    endpoint: "https://alpha-research.demo.maldo.eth",
  },
  {
    name: "CodeGuardian",
    description: "Automated smart contract auditor. Runs Slither, Mythril, and custom heuristic checks.",
    capabilities: ["code-review", "security-audit"],
    basePrice: 2_000_000,
    endpoint: "https://code-guardian.demo.maldo.eth",
  },
  {
    name: "LinguaAgent",
    description: "Multilingual translation agent. Supports 40+ languages with context-aware technical translations.",
    capabilities: ["translation", "content-creation"],
    basePrice: 300_000,
    endpoint: "https://lingua-agent.demo.maldo.eth",
  },
  {
    name: "DataCrawler",
    description: "Web3 data collection agent. Indexes events, scrapes public APIs, and aggregates cross-chain data.",
    capabilities: ["data-collection", "market-analysis"],
    basePrice: 800_000,
    endpoint: "https://data-crawler.demo.maldo.eth",
  },
  {
    name: "FinanceBot",
    description: "Generates quarterly financial reports with on-chain treasury analysis and DeFi yield breakdowns.",
    capabilities: ["financial-report", "data-collection"],
    basePrice: 5_000_000,
    endpoint: "https://finance-bot.demo.maldo.eth",
  },
  {
    name: "NexusOracle",
    description: "Cross-chain oracle agent. Bridges price feeds and state proofs between EVM chains.",
    capabilities: ["market-analysis", "data-collection", "oracle"],
    basePrice: 1_500_000,
    endpoint: "https://nexus-oracle.demo.maldo.eth",
  },
  {
    name: "AuditPilot",
    description: "End-to-end audit workflow agent. Generates findings, writes PoC exploits, and drafts reports.",
    capabilities: ["code-review", "security-audit", "financial-report"],
    basePrice: 8_000_000,
    endpoint: "https://audit-pilot.demo.maldo.eth",
  },
  {
    name: "SwiftTranslate",
    description: "Real-time translation with low latency. Optimized for chat and streaming content.",
    capabilities: ["translation"],
    basePrice: 100_000,
    endpoint: "https://swift-translate.demo.maldo.eth",
  },
];

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

const RATING_PROFILES: Record<number, { count: number; scores: number[] }> = {
  0: { count: 12, scores: [5, 5, 5, 4, 5, 5, 4, 5, 5, 5, 4, 5] },
  1: { count: 8, scores: [5, 5, 4, 5, 5, 5, 4, 5] },
  2: { count: 15, scores: [5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 5, 5, 4, 5, 5] },
  3: { count: 6, scores: [4, 3, 4, 5, 4, 3] },
  4: { count: 3, scores: [5, 5, 4] },
  5: { count: 20, scores: [5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 4] },
  6: { count: 0, scores: [] },
  7: { count: 2, scores: [3, 4] },
};

function genWallet(seed: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(seed)).slice(0, 42);
}

function genAgentId(name: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(name)).slice(0, 18);
}

export function isDbEmpty(db: Database.Database): boolean {
  const row = db.prepare("SELECT COUNT(*) as count FROM agents").get() as { count: number };
  return row.count === 0;
}

export function seedDemoData(db: Database.Database): void {
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
  }

  // Ratings (fake completed deals + ratings)
  const insertDeal = db.prepare(
    `INSERT OR IGNORE INTO deals (nonce, client, server, amount, status, task_description)
     VALUES (?, ?, ?, ?, 'Completed', ?)`,
  );
  const insertRating = db.prepare(
    `INSERT OR IGNORE INTO ratings (deal_nonce, rater_address, ratee_agent_id, score, comment)
     VALUES (?, ?, ?, ?, ?)`,
  );

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

  // Vouches
  const insertVouch = db.prepare(
    `INSERT OR IGNORE INTO vouches (voucher_agent_id, vouchee_agent_id, voucher_wallet, weight)
     VALUES (?, ?, ?, ?)`,
  );

  insertVouch.run(agentIds[0], agentIds[1], genWallet(AGENTS[0].name + "-wallet"), 0.85);
  insertVouch.run(agentIds[1], agentIds[0], genWallet(AGENTS[1].name + "-wallet"), 0.82);
  insertVouch.run(agentIds[5], agentIds[0], genWallet(AGENTS[5].name + "-wallet"), 0.92);
  insertVouch.run(agentIds[5], agentIds[2], genWallet(AGENTS[5].name + "-wallet"), 0.90);
  insertVouch.run(agentIds[2], agentIds[3], genWallet(AGENTS[2].name + "-wallet"), 0.70);
  insertVouch.run(agentIds[0], agentIds[4], genWallet(AGENTS[0].name + "-wallet"), 0.85);

  console.log(`[Seed] Inserted ${AGENTS.length} agents, ${Object.values(RATING_PROFILES).reduce((s, p) => s + p.count, 0)} ratings, 6 vouches`);
}
