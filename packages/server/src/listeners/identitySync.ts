import { ethers } from "ethers";
import type Database from "better-sqlite3";
import { ERC8004_IDENTITY_ABI, ERC8004_REPUTATION_ABI } from "../chain/abis.js";
import { config } from "../config.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Known deployment block for the ERC-8004 Identity Registry on Sepolia.
 * This avoids scanning millions of empty blocks from genesis.
 * Override via IDENTITY_START_BLOCK env var.
 */
const DEFAULT_START_BLOCK = 9_980_000;

/**
 * Syncs ERC-8004 Identity NFTs from Sepolia into the local agents table.
 * Scans Transfer events from the Identity Registry to discover all minted agents,
 * then fetches their tokenURI metadata and on-chain reputation.
 *
 * Includes rate-limit backoff for Infura free tier.
 */
export class IdentitySync {
  private provider: ethers.JsonRpcProvider;
  private identity: ethers.Contract;
  private reputation: ethers.Contract;
  private startBlock: number;

  constructor(
    private db: Database.Database,
    provider?: ethers.JsonRpcProvider,
    startBlock?: number,
  ) {
    this.provider = provider ?? new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
    this.identity = new ethers.Contract(config.identityRegistry, ERC8004_IDENTITY_ABI, this.provider);
    this.reputation = new ethers.Contract(config.reputationRegistry, ERC8004_REPUTATION_ABI, this.provider);
    this.startBlock = startBlock ?? parseInt(process.env.IDENTITY_START_BLOCK || String(DEFAULT_START_BLOCK), 10);
  }

  async sync(): Promise<number> {
    console.log("[IdentitySync] Scanning ERC-8004 Identity Registry for agents...");
    console.log(`[IdentitySync] Contract: ${config.identityRegistry}`);

    const currentBlock = await this.provider.getBlockNumber();
    const fromBlock = this.startBlock;

    console.log(`[IdentitySync] Scanning blocks ${fromBlock}–${currentBlock} (~${((currentBlock - fromBlock) / 1000).toFixed(0)}k blocks)`);

    // Scan Transfer events from address(0) = mints
    const mintFilter = this.identity.filters.Transfer(ethers.ZeroAddress);

    // Chunk size and delay tuned for Infura/Alchemy free tier
    const CHUNK_SIZE = 50_000;
    const DELAY_MS = 350;
    const allEvents: ethers.EventLog[] = [];

    const totalChunks = Math.ceil((currentBlock - fromBlock) / CHUNK_SIZE);
    let chunkIdx = 0;

    for (let from = fromBlock; from <= currentBlock; from += CHUNK_SIZE) {
      const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
      chunkIdx++;
      let retries = 4;

      while (retries > 0) {
        try {
          const events = await this.identity.queryFilter(mintFilter, from, to);
          for (const e of events) {
            if (e instanceof ethers.EventLog) {
              allEvents.push(e);
            }
          }
          break; // success
        } catch (err: any) {
          retries--;
          if (retries > 0) {
            const backoff = DELAY_MS * (5 - retries);
            console.warn(`[IdentitySync] Chunk ${chunkIdx}/${totalChunks} error: ${err.message?.slice(0, 80)}, retrying in ${backoff}ms...`);
            await sleep(backoff);
          } else {
            console.warn(`[IdentitySync] Chunk ${chunkIdx}/${totalChunks} failed after retries, skipping range ${from}–${to}`);
          }
        }
      }

      // Log progress every 10 chunks
      if (chunkIdx % 10 === 0 || chunkIdx === totalChunks) {
        console.log(`[IdentitySync] Progress: ${chunkIdx}/${totalChunks} chunks, ${allEvents.length} mints found`);
      }

      // Throttle between chunks
      if (chunkIdx < totalChunks) await sleep(DELAY_MS);
    }

    console.log(`[IdentitySync] Scan complete — found ${allEvents.length} mint events.`);

    let synced = 0;
    for (const event of allEvents) {
      const tokenId = event.args[2]; // Transfer(from, to, tokenId)
      const owner = event.args[1];
      const agentId = tokenId.toString();

      // Skip if already in DB
      const existing = this.db
        .prepare("SELECT agent_id FROM agents WHERE agent_id = ?")
        .get(agentId);
      if (existing) continue;

      try {
        const agent = await this.fetchAgentData(agentId, owner);
        if (agent) {
          this.upsertAgent(agent);
          synced++;
          console.log(`[IdentitySync] Synced agent #${agentId}: ${agent.name} (caps: ${agent.capabilities.join(", ") || "none"})`);
        } else {
          console.warn(`[IdentitySync] Token #${agentId}: metadata could not be resolved`);
        }
      } catch (err: any) {
        console.warn(`[IdentitySync] Failed to sync token #${agentId}:`, err.message);
      }

      // Throttle metadata fetches to respect rate limits
      await sleep(500);
    }

    console.log(`[IdentitySync] Done — synced ${synced} new agents (${allEvents.length} total on-chain).`);
    return synced;
  }

  private async fetchAgentData(agentId: string, owner: string) {
    // Get metadata from tokenURI
    const uri: string = await this.identity.tokenURI(agentId);
    const metadata = await this.resolveMetadata(uri);

    if (!metadata) {
      console.warn(`[IdentitySync] Token #${agentId}: could not resolve URI: ${uri.slice(0, 100)}`);
      return null;
    }

    // Flexible name extraction — different ERC-8004 implementations use different fields
    const name = metadata.name || metadata.agentName || metadata.title || `Agent #${agentId}`;

    // Get on-chain reputation
    let repScore = 0;
    let repCount = 0;
    try {
      const summary = await this.reputation.getSummary(agentId);
      repScore = Number(summary.averageValue); // e.g. 482 = 4.82
      repCount = Number(summary.feedbackCount);
    } catch {
      // No reputation data yet
    }

    // Flexible capability extraction
    const capabilities =
      metadata.capabilities ||
      metadata.services?.map((s: any) => s.name || s.type) ||
      metadata.skills ||
      metadata.tags ||
      [];

    // Flexible price extraction
    const basePrice = parseInt(
      metadata.pricing?.base || metadata.basePrice || metadata.price || "0",
      10,
    );

    // Flexible endpoint extraction
    const endpoint =
      metadata.endpoint ||
      metadata.services?.[0]?.endpoint ||
      metadata.url ||
      metadata.api ||
      "";

    return {
      agentId,
      name,
      description: metadata.description || "",
      capabilities: Array.isArray(capabilities) ? capabilities : [],
      basePrice,
      endpoint,
      wallet: owner.toLowerCase(),
      ipfsUri: uri,
      repScore,
      repCount,
    };
  }

  private async resolveMetadata(uri: string): Promise<any> {
    try {
      // Handle data URIs (base64 encoded JSON)
      if (uri.startsWith("data:application/json;base64,")) {
        const base64 = uri.replace("data:application/json;base64,", "");
        return JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
      }

      // Handle IPFS URIs
      if (uri.startsWith("ipfs://")) {
        const cid = uri.replace("ipfs://", "");
        const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) {
          const res2 = await fetch(`https://ipfs.io/ipfs/${cid}`, { signal: AbortSignal.timeout(10_000) });
          if (!res2.ok) return null;
          return res2.json();
        }
        return res.json();
      }

      // Handle HTTP URIs
      if (uri.startsWith("http")) {
        const res = await fetch(uri, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;
        return res.json();
      }

      return null;
    } catch {
      return null;
    }
  }

  private upsertAgent(agent: {
    agentId: string;
    name: string;
    description: string;
    capabilities: string[];
    basePrice: number;
    endpoint: string;
    wallet: string;
    ipfsUri: string;
  }) {
    // Handle potential name conflicts with existing seed agents
    let name = agent.name;
    const nameConflict = this.db
      .prepare("SELECT agent_id FROM agents WHERE name = ? AND agent_id != ?")
      .get(name, agent.agentId);
    if (nameConflict) {
      name = `${agent.name} (#${agent.agentId.slice(0, 8)})`;
    }

    this.db
      .prepare(
        `INSERT INTO agents (agent_id, name, description, capabilities, base_price, endpoint, wallet, ipfs_uri, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'chain')
         ON CONFLICT(agent_id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           capabilities = excluded.capabilities,
           base_price = excluded.base_price,
           endpoint = excluded.endpoint,
           wallet = excluded.wallet,
           ipfs_uri = excluded.ipfs_uri,
           source = 'chain'`,
      )
      .run(
        agent.agentId,
        name,
        agent.description,
        JSON.stringify(agent.capabilities),
        agent.basePrice,
        agent.endpoint,
        agent.wallet,
        agent.ipfsUri,
      );
  }
}
