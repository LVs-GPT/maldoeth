import { ethers } from "ethers";
import type Database from "better-sqlite3";
import { ERC8004_IDENTITY_ABI, ERC8004_REPUTATION_ABI } from "../chain/abis.js";
import { config } from "../config.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Syncs ERC-8004 Identity NFTs from Sepolia into the local agents table.
 * Scans Transfer events from the Identity Registry to discover all minted agents,
 * then fetches their tokenURI metadata and on-chain reputation.
 *
 * Only scans the last LOOKBACK_BLOCKS (~3 days on Sepolia at 12s/block).
 * Includes rate-limit backoff for Infura free tier.
 */
export class IdentitySync {
  private provider: ethers.JsonRpcProvider;
  private identity: ethers.Contract;
  private reputation: ethers.Contract;

  /** How many blocks back to scan (default ~3 days) */
  private lookback: number;

  constructor(
    private db: Database.Database,
    provider?: ethers.JsonRpcProvider,
    lookback = 20_000,
  ) {
    this.provider = provider ?? new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
    this.identity = new ethers.Contract(config.identityRegistry, ERC8004_IDENTITY_ABI, this.provider);
    this.reputation = new ethers.Contract(config.reputationRegistry, ERC8004_REPUTATION_ABI, this.provider);
    this.lookback = lookback;
  }

  async sync(): Promise<number> {
    console.log("[IdentitySync] Scanning ERC-8004 Identity Registry for agents...");
    console.log(`[IdentitySync] Contract: ${config.identityRegistry}`);

    const currentBlock = await this.provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - this.lookback);

    console.log(`[IdentitySync] Scanning blocks ${fromBlock}–${currentBlock} (last ${this.lookback} blocks)`);

    // Scan Transfer events from address(0) = mints
    const mintFilter = this.identity.filters.Transfer(ethers.ZeroAddress);

    // Use small chunks with generous delay to stay within Infura free-tier rate limits
    const CHUNK_SIZE = 2_000;
    const DELAY_MS = 1_500;
    const allEvents: ethers.EventLog[] = [];

    for (let from = fromBlock; from <= currentBlock; from += CHUNK_SIZE) {
      const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
      let retries = 3;

      while (retries > 0) {
        try {
          const events = await this.identity.queryFilter(mintFilter, from, to);
          for (const e of events) {
            if (e instanceof ethers.EventLog) {
              allEvents.push(e);
            }
          }
          break; // success
        } catch {
          retries--;
          if (retries > 0) {
            const backoff = DELAY_MS * (4 - retries);
            console.warn(`[IdentitySync] Chunk ${from}–${to} rate limited, retrying in ${backoff}ms...`);
            await sleep(backoff);
          } else {
            console.warn(`[IdentitySync] Chunk ${from}–${to} failed after retries, skipping.`);
          }
        }
      }

      // Throttle between chunks
      await sleep(DELAY_MS);
    }

    console.log(`[IdentitySync] Found ${allEvents.length} mint events.`);

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
          console.log(`[IdentitySync] Synced agent #${agentId}: ${agent.name}`);
        }
      } catch (err: any) {
        console.warn(`[IdentitySync] Failed to sync token #${agentId}:`, err.message);
      }

      // Throttle metadata fetches to respect rate limits
      await sleep(800);
    }

    console.log(`[IdentitySync] Done — synced ${synced} new agents (${allEvents.length} total on-chain).`);
    return synced;
  }

  private async fetchAgentData(agentId: string, owner: string) {
    // Get metadata from tokenURI
    const uri: string = await this.identity.tokenURI(agentId);
    const metadata = await this.resolveMetadata(uri);
    if (!metadata || !metadata.name) return null;

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

    return {
      agentId,
      name: metadata.name,
      description: metadata.description || "",
      capabilities: metadata.capabilities || metadata.services?.map((s: any) => s.name) || [],
      basePrice: parseInt(metadata.pricing?.base || metadata.basePrice || "0", 10),
      endpoint: metadata.endpoint || metadata.services?.[0]?.endpoint || "",
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
        const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
        if (!res.ok) {
          const res2 = await fetch(`https://ipfs.io/ipfs/${cid}`);
          if (!res2.ok) return null;
          return res2.json();
        }
        return res.json();
      }

      // Handle HTTP URIs
      if (uri.startsWith("http")) {
        const res = await fetch(uri);
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
    this.db
      .prepare(
        `INSERT INTO agents (agent_id, name, description, capabilities, base_price, endpoint, wallet, ipfs_uri)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           capabilities = excluded.capabilities,
           base_price = excluded.base_price,
           endpoint = excluded.endpoint,
           wallet = excluded.wallet,
           ipfs_uri = excluded.ipfs_uri`,
      )
      .run(
        agent.agentId,
        agent.name,
        agent.description,
        JSON.stringify(agent.capabilities),
        agent.basePrice,
        agent.endpoint,
        agent.wallet,
        agent.ipfsUri,
      );
  }
}
