import { ethers } from "ethers";
import type Database from "better-sqlite3";
import { ERC8004_IDENTITY_ABI, ERC8004_REPUTATION_ABI } from "../chain/abis.js";
import { config } from "../config.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Known deployment block for the ERC-8004 Identity Registry on Sepolia.
 * Only used as fallback when subgraph is unavailable.
 * Override via IDENTITY_START_BLOCK env var.
 */
const DEFAULT_START_BLOCK = 9_989_417;

// ─── Subgraph GraphQL query ──────────────────────────────────────────
const AGENTS_QUERY = `
  query Agents($first: Int!, $skip: Int!) {
    agents(
      first: $first
      skip: $skip
      orderBy: registeredAt
      orderDirection: asc
    ) {
      agentId
      owner
      agentURI
      blockNumber
      registeredAt
      txHash
    }
  }
`;

/**
 * Syncs ERC-8004 Identity NFTs from Sepolia into the local agents table.
 *
 * Strategy:
 *   1. If SUBGRAPH_URL is set → query The Graph (fast, reliable, paginated)
 *   2. Fallback → scan RPC logs with multi-RPC fallback (legacy)
 *
 * The subgraph indexes Registered/URIUpdated/Transfer events automatically.
 * Metadata resolution (IPFS, data:, HTTP) still happens server-side since
 * subgraph mappings can't do arbitrary HTTP fetches.
 */
export class IdentitySync {
  private provider!: ethers.JsonRpcProvider;
  private identity!: ethers.Contract;
  private reputation!: ethers.Contract;
  private startBlock: number;
  private rpcUrls: string[];
  private repFailures = 0;
  private readonly REP_CIRCUIT_BREAKER = 3; // skip reputation after N consecutive failures

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

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC — main entry point
  // ═══════════════════════════════════════════════════════════════════════

  async sync(): Promise<number> {
    // Try subgraph first — instant, paginated, no RPC rate limits
    if (config.subgraphUrl) {
      try {
        return await this.syncFromSubgraph();
      } catch (err: any) {
        console.warn(`[IdentitySync] Subgraph failed: ${err.message} — falling back to RPC scan`);
      }
    }

    // Fallback: legacy RPC scan
    return this.syncFromRpc();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SUBGRAPH PATH — The Graph (preferred)
  // ═══════════════════════════════════════════════════════════════════════

  private async syncFromSubgraph(): Promise<number> {
    console.log(`[IdentitySync] Syncing via subgraph: ${config.subgraphUrl}`);

    const PAGE_SIZE = 100;
    let skip = 0;
    let synced = 0;
    let skipped = 0; // already in DB
    let metadataFailed = 0;
    let dbFailed = 0;
    let totalFetched = 0;

    while (true) {
      const res = await fetch(config.subgraphUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: AGENTS_QUERY,
          variables: { first: PAGE_SIZE, skip },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        throw new Error(`Subgraph HTTP ${res.status}: ${await res.text()}`);
      }

      const json = (await res.json()) as { data?: { agents?: SubgraphAgent[] }; errors?: any[] };

      if (json.errors?.length) {
        throw new Error(`Subgraph query error: ${JSON.stringify(json.errors[0])}`);
      }

      const agents = json.data?.agents || [];
      totalFetched += agents.length;

      for (const raw of agents) {
        // Skip if already in DB
        const existing = this.db
          .prepare("SELECT agent_id FROM agents WHERE agent_id = ?")
          .get(raw.agentId);
        if (existing) { skipped++; continue; }

        let agent: Awaited<ReturnType<typeof this.fetchAgentData>> = null;
        try {
          agent = await this.fetchAgentData(raw.agentId, raw.owner, raw.agentURI);
        } catch (err: any) {
          console.warn(`[IdentitySync] Metadata failed for #${raw.agentId}: ${err.message}`);
        }

        if (!agent) metadataFailed++;

        // Always store the agent — use fallback data if metadata resolution failed
        try {
          this.upsertAgent(agent ?? {
            agentId: raw.agentId,
            name: `Agent #${raw.agentId}`,
            description: "",
            capabilities: [],
            basePrice: 0,
            endpoint: "",
            wallet: (raw.owner || "").toLowerCase(),
            ipfsUri: raw.agentURI || "",
          });
          synced++;
        } catch (dbErr: any) {
          dbFailed++;
          console.warn(`[IdentitySync] DB insert failed for #${raw.agentId}: ${dbErr.message}`);
        }

        if (synced > 0 && synced % 50 === 0) {
          console.log(`[IdentitySync] Progress: ${synced} new agents synced (${totalFetched} scanned, ${metadataFailed} no-metadata, ${dbFailed} db-errors)...`);
        }

        // Only throttle HTTP fetches (IPFS/HTTP URIs) — data: URIs are local
        const needsHttp = raw.agentURI && !raw.agentURI.startsWith("data:");
        if (needsHttp) await sleep(100);
      }

      // Done when page is smaller than PAGE_SIZE
      if (agents.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }

    console.log(`[IdentitySync] Subgraph sync done — ${synced} new agents stored, ${skipped} already in DB, ${metadataFailed} no-metadata (stored as fallback), ${dbFailed} db-errors, ${totalFetched} total on-chain.`);
    return synced;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RPC PATH — legacy block scan (fallback)
  // ═══════════════════════════════════════════════════════════════════════

  private async syncFromRpc(): Promise<number> {
    console.log("[IdentitySync] Falling back to RPC block scan...");
    console.log(`[IdentitySync] Contract: ${config.identityRegistry}`);
    console.log(`[IdentitySync] RPCs available: ${this.rpcUrls.length}`);

    await this.findWorkingRpc();

    const currentBlock = await this.provider.getBlockNumber();
    const fromBlock = this.startBlock;

    console.log(`[IdentitySync] Scanning blocks ${fromBlock}–${currentBlock} (~${((currentBlock - fromBlock) / 1000).toFixed(0)}k blocks)`);

    const registeredFilter = this.identity.filters.Registered();
    let chunkSize = 2_000; // adaptive — shrinks on RPC range errors
    const DELAY_MS = 200;
    const allEvents: ethers.EventLog[] = [];
    let consecutiveFailures = 0;

    console.log(`[IdentitySync] Starting chunked scan (~${Math.ceil((currentBlock - fromBlock) / chunkSize)} initial chunks)...`);

    for (let from = fromBlock; from <= currentBlock; ) {
      const to = Math.min(from + chunkSize - 1, currentBlock);
      let success = false;

      for (let rpcAttempt = 0; rpcAttempt < this.rpcUrls.length && !success; rpcAttempt++) {
        try {
          const events = await this.identity.queryFilter(registeredFilter, from, to);
          for (const e of events) {
            if (e instanceof ethers.EventLog) {
              allEvents.push(e);
            }
          }
          success = true;
          consecutiveFailures = 0;
          from += chunkSize;
        } catch (err: any) {
          const msg = err.message || "";
          // Adaptive: reduce chunk on block-range errors (free RPCs may limit to 10 blocks)
          if (chunkSize > 10 && (msg.includes("block range") || msg.includes("-32600") || msg.includes("10 block"))) {
            chunkSize = Math.max(10, Math.floor(chunkSize / 4));
            console.warn(`[IdentitySync] RPC range limit — reducing chunk to ${chunkSize} blocks`);
            break; // retry same `from` with smaller chunk
          }
          if (rpcAttempt < this.rpcUrls.length - 1) {
            const nextUrl = this.rpcUrls[rpcAttempt + 1];
            console.warn(`[IdentitySync] Switching RPC → ${nextUrl.replace(/https?:\/\//, "").split("/")[0]}`);
            this.setProvider(new ethers.JsonRpcProvider(nextUrl));
          }
        }
      }

      if (!success) {
        consecutiveFailures++;
        if (consecutiveFailures >= 5) {
          console.error(`[IdentitySync] ${consecutiveFailures} consecutive failures — aborting scan.`);
          break;
        }
        from += chunkSize; // skip on non-range errors
      }

      if (from <= currentBlock) await sleep(DELAY_MS);
    }

    console.log(`[IdentitySync] Scan complete — found ${allEvents.length} Registered events.`);

    let synced = 0;
    for (const event of allEvents) {
      const agentId = event.args[0].toString();
      const agentURI = event.args[1] as string;
      const owner = event.args[2] as string;

      const existing = this.db
        .prepare("SELECT agent_id FROM agents WHERE agent_id = ?")
        .get(agentId);
      if (existing) continue;

      let agent: Awaited<ReturnType<typeof this.fetchAgentData>> = null;
      try {
        agent = await this.fetchAgentData(agentId, owner, agentURI);
      } catch (err: any) {
        console.warn(`[IdentitySync] Metadata failed for #${agentId}: ${err.message}`);
      }

      // Always store — use fallback data if metadata resolution failed
      try {
        this.upsertAgent(agent ?? {
          agentId,
          name: `Agent #${agentId}`,
          description: "",
          capabilities: [],
          basePrice: 0,
          endpoint: "",
          wallet: (owner || "").toLowerCase(),
          ipfsUri: agentURI || "",
        });
        synced++;
      } catch (dbErr: any) {
        console.warn(`[IdentitySync] DB insert failed for #${agentId}: ${dbErr.message}`);
      }

      const needsHttp = agentURI && !agentURI.startsWith("data:");
      if (needsHttp) await sleep(100);
      else await sleep(50);
    }

    console.log(`[IdentitySync] Done — synced ${synced} new agents (${allEvents.length} total on-chain).`);
    return synced;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED — metadata resolution + DB
  // ═══════════════════════════════════════════════════════════════════════

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

  private async fetchAgentData(agentId: string, owner: string, eventUri?: string) {
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

    const name = metadata.name || metadata.agentName || metadata.title || `Agent #${agentId}`;

    // On-chain reputation — skip entirely if RPC is consistently failing
    let repScore = 0;
    let repCount = 0;
    if (this.repFailures < this.REP_CIRCUIT_BREAKER) {
      try {
        const summary = await Promise.race([
          this.reputation.getSummary(agentId),
          sleep(1500).then(() => null), // 1.5s timeout (was 3s)
        ]);
        if (summary) {
          repScore = Number(summary.averageValue);
          repCount = Number(summary.feedbackCount);
          this.repFailures = 0;
        } else {
          this.repFailures++;
        }
      } catch {
        this.repFailures++;
        if (this.repFailures >= this.REP_CIRCUIT_BREAKER) {
          console.warn(`[IdentitySync] Reputation RPC failed ${this.repFailures}x — disabling for rest of sync`);
        }
      }
    }

    const capabilities =
      metadata.capabilities ||
      metadata.services?.map((s: any) => s.name || s.type) ||
      metadata.skills ||
      metadata.tags ||
      [];

    const basePrice = parseInt(
      metadata.pricing?.base || metadata.basePrice || metadata.price || "0",
      10,
    );

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
      // Handle data: URIs — many on-chain agents use these
      if (uri.startsWith("data:application/json")) {
        // Strip the data URI prefix (handles base64, enc=gzip, and other variants)
        const commaIdx = uri.indexOf(",");
        if (commaIdx === -1) return null;
        const payload = uri.slice(commaIdx + 1);
        const header = uri.slice(0, commaIdx).toLowerCase();

        // Try base64 decode first (legitimate base64)
        if (header.includes("base64")) {
          try {
            const decoded = Buffer.from(payload, "base64").toString("utf-8");
            return JSON.parse(decoded);
          } catch {
            // Many agents mislabel raw JSON as base64 — try parsing directly
            try { return JSON.parse(payload); } catch { return null; }
          }
        }

        // Plain data URI — parse directly
        try { return JSON.parse(decodeURIComponent(payload)); } catch {
          try { return JSON.parse(payload); } catch { return null; }
        }
      }

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

// ─── Types ───────────────────────────────────────────────────────────

interface SubgraphAgent {
  agentId: string;
  owner: string;
  agentURI: string;
  blockNumber: string;
  registeredAt: string;
  txHash: string;
}
