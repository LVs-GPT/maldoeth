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
 *
 * Scans `Registered(uint256 indexed agentId, string agentURI, address indexed owner)`
 * events from the real ERC-8004 Identity Registry — much more targeted than
 * generic ERC-721 Transfer events.
 *
 * Uses multi-RPC fallback: if the primary RPC fails, automatically tries
 * alternative public endpoints (Ankr, PublicNode, DRPC, etc.).
 */
export class IdentitySync {
  private provider!: ethers.JsonRpcProvider;
  private identity!: ethers.Contract;
  private reputation!: ethers.Contract;
  private startBlock: number;
  private rpcUrls: string[];

  constructor(
    private db: Database.Database,
    provider?: ethers.JsonRpcProvider,
    startBlock?: number,
  ) {
    this.rpcUrls = config.sepoliaRpcFallbacks;
    this.startBlock = startBlock ?? parseInt(process.env.IDENTITY_START_BLOCK || String(DEFAULT_START_BLOCK), 10);

    if (provider) {
      this.setProvider(provider);
    } else {
      this.setProvider(new ethers.JsonRpcProvider(this.rpcUrls[0]));
    }
  }

  private setProvider(provider: ethers.JsonRpcProvider) {
    this.provider = provider;
    this.identity = new ethers.Contract(config.identityRegistry, ERC8004_IDENTITY_ABI, this.provider);
    this.reputation = new ethers.Contract(config.reputationRegistry, ERC8004_REPUTATION_ABI, this.provider);
  }

  /**
   * Try to get the current block number, cycling through fallback RPCs if needed.
   */
  private async findWorkingRpc(): Promise<void> {
    for (let i = 0; i < this.rpcUrls.length; i++) {
      const url = this.rpcUrls[i];
      try {
        const testProvider = new ethers.JsonRpcProvider(url);
        const blockNum = await testProvider.getBlockNumber();
        if (blockNum > 0) {
          console.log(`[IdentitySync] RPC OK: ${url} (block ${blockNum})`);
          this.setProvider(testProvider);
          return;
        }
      } catch (err: any) {
        console.warn(`[IdentitySync] RPC failed: ${url} — ${err.message?.slice(0, 80)}`);
      }
    }
    throw new Error("All Sepolia RPCs failed — cannot sync. Set SEPOLIA_RPC_URL to a working endpoint.");
  }

  async sync(): Promise<number> {
    console.log("[IdentitySync] Scanning ERC-8004 Identity Registry for agents...");
    console.log(`[IdentitySync] Contract: ${config.identityRegistry}`);
    console.log(`[IdentitySync] RPCs available: ${this.rpcUrls.length} (primary: ${this.rpcUrls[0].replace(/https?:\/\//, "").split("/")[0]})`);

    // Find a working RPC before starting
    await this.findWorkingRpc();

    const currentBlock = await this.provider.getBlockNumber();
    const fromBlock = this.startBlock;

    console.log(`[IdentitySync] Scanning blocks ${fromBlock}–${currentBlock} (~${((currentBlock - fromBlock) / 1000).toFixed(0)}k blocks)`);

    // Use the Registered event — specific to ERC-8004, much more efficient than Transfer
    const registeredFilter = this.identity.filters.Registered();

    const CHUNK_SIZE = 50_000;
    const DELAY_MS = 350;
    const allEvents: ethers.EventLog[] = [];

    const totalChunks = Math.ceil((currentBlock - fromBlock) / CHUNK_SIZE);
    let chunkIdx = 0;
    let consecutiveFailures = 0;

    for (let from = fromBlock; from <= currentBlock; from += CHUNK_SIZE) {
      const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
      chunkIdx++;
      let success = false;

      // Try current provider first, then cycle through fallbacks
      for (let rpcAttempt = 0; rpcAttempt < this.rpcUrls.length && !success; rpcAttempt++) {
        let retries = 2;
        while (retries > 0 && !success) {
          try {
            const events = await this.identity.queryFilter(registeredFilter, from, to);
            for (const e of events) {
              if (e instanceof ethers.EventLog) {
                allEvents.push(e);
              }
            }
            success = true;
            consecutiveFailures = 0;
          } catch (err: any) {
            retries--;
            if (retries > 0) {
              await sleep(DELAY_MS * 2);
            }
          }
        }

        // If retries exhausted on current RPC, try next one
        if (!success && rpcAttempt < this.rpcUrls.length - 1) {
          const nextUrl = this.rpcUrls[rpcAttempt + 1];
          console.warn(`[IdentitySync] Switching RPC → ${nextUrl.replace(/https?:\/\//, "").split("/")[0]}`);
          this.setProvider(new ethers.JsonRpcProvider(nextUrl));
        }
      }

      if (!success) {
        consecutiveFailures++;
        console.warn(`[IdentitySync] Chunk ${chunkIdx}/${totalChunks} failed on ALL RPCs, skipping range ${from}–${to}`);
        if (consecutiveFailures >= 5) {
          console.error(`[IdentitySync] ${consecutiveFailures} consecutive chunk failures — aborting scan.`);
          break;
        }
      }

      // Log progress every 10 chunks
      if (chunkIdx % 10 === 0 || chunkIdx === totalChunks) {
        console.log(`[IdentitySync] Progress: ${chunkIdx}/${totalChunks} chunks, ${allEvents.length} Registered events found`);
      }

      // Throttle between chunks
      if (chunkIdx < totalChunks) await sleep(DELAY_MS);
    }

    console.log(`[IdentitySync] Scan complete — found ${allEvents.length} Registered events.`);

    let synced = 0;
    for (const event of allEvents) {
      // Registered(uint256 indexed agentId, string agentURI, address indexed owner)
      const agentId = event.args[0].toString();
      const agentURI = event.args[1] as string;
      const owner = event.args[2] as string;

      // Skip if already in DB
      const existing = this.db
        .prepare("SELECT agent_id FROM agents WHERE agent_id = ?")
        .get(agentId);
      if (existing) continue;

      try {
        const agent = await this.fetchAgentData(agentId, owner, agentURI);
        if (agent) {
          this.upsertAgent(agent);
          synced++;
          console.log(`[IdentitySync] Synced agent #${agentId}: ${agent.name} (caps: ${agent.capabilities.join(", ") || "none"})`);
        } else {
          console.warn(`[IdentitySync] Agent #${agentId}: metadata could not be resolved`);
        }
      } catch (err: any) {
        console.warn(`[IdentitySync] Failed to sync agent #${agentId}:`, err.message);
      }

      // Throttle metadata fetches to respect rate limits
      await sleep(500);
    }

    console.log(`[IdentitySync] Done — synced ${synced} new agents (${allEvents.length} total on-chain).`);
    return synced;
  }

  /**
   * Fetch agent metadata. Uses the URI from the Registered event directly
   * (avoids an extra RPC call to tokenURI).
   */
  private async fetchAgentData(agentId: string, owner: string, eventUri?: string) {
    // Prefer the URI from the event, fall back to on-chain tokenURI
    let uri = eventUri || "";
    if (!uri) {
      try {
        uri = await this.identity.tokenURI(agentId);
      } catch {
        return null;
      }
    }

    const metadata = await this.resolveMetadata(uri);

    if (!metadata) {
      console.warn(`[IdentitySync] Agent #${agentId}: could not resolve URI: ${uri.slice(0, 100)}`);
      return null;
    }

    // Flexible name extraction — different agents use different fields
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
