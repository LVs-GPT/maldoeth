import type Database from "better-sqlite3";
import { ethers } from "ethers";

export interface RegisterAgentParams {
  name: string;
  description: string;
  capabilities: string[];
  basePrice: number; // USDC atomic units (6 decimals)
  endpoint: string;
  wallet: string;
}

export interface RegisterAgentResult {
  agentId: string;
  name: string;
  txHash: string | null;
  ipfsUri: string | null;
}

export interface ChainAdapter {
  /** Calls IdentityRegistry.register(agentURI) — mints ERC-8004 NFT to the signer */
  registerAgent(agentURI: string): Promise<{ agentId: string; txHash: string }>;
}

/**
 * Agent-card.json metadata following ERC-8004 format
 */
function buildAgentCard(params: RegisterAgentParams): object {
  return {
    name: params.name,
    description: params.description,
    capabilities: params.capabilities,
    basePrice: params.basePrice,
    endpoint: params.endpoint,
    wallet: params.wallet,
    protocol: "maldo-v1",
    network: "sepolia",
  };
}

export class RegistrationService {
  constructor(
    private db: Database.Database,
    private chain?: ChainAdapter,
  ) {}

  async registerAgent(params: RegisterAgentParams): Promise<RegisterAgentResult> {
    // Validate
    if (!params.name || params.name.trim().length === 0) {
      throw new ApiError(400, "Name is required");
    }
    if (!params.capabilities || params.capabilities.length === 0) {
      throw new ApiError(400, "At least one capability is required");
    }
    if (!params.wallet || !ethers.isAddress(params.wallet)) {
      throw new ApiError(400, "Valid wallet address is required");
    }

    // Check duplicate name
    const existing = this.db
      .prepare("SELECT id FROM agents WHERE name = ?")
      .get(params.name);
    if (existing) {
      throw new ApiError(409, `Agent with name '${params.name}' already exists`);
    }

    // Build agent card metadata
    const agentCard = buildAgentCard(params);
    const metadataJson = JSON.stringify(agentCard);

    // Mint ERC-8004 identity on-chain (if chain adapter available)
    let agentId: string;
    let txHash: string | null = null;
    let ipfsUri: string | null = null;

    if (this.chain) {
      // For PoC: use metadata JSON as data URI (real version would upload to IPFS first)
      ipfsUri = `data:application/json;base64,${Buffer.from(metadataJson).toString("base64")}`;
      const result = await this.chain.registerAgent(ipfsUri);
      agentId = result.agentId;
      txHash = result.txHash;
    } else {
      // Offline mode: generate a deterministic agent ID
      agentId = ethers.keccak256(ethers.toUtf8Bytes(params.name)).slice(0, 18);
    }

    // Persist to DB
    this.db
      .prepare(
        `INSERT INTO agents (agent_id, name, description, capabilities, base_price, endpoint, wallet, tx_hash, ipfs_uri)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        agentId,
        params.name,
        params.description || "",
        JSON.stringify(params.capabilities),
        params.basePrice || 0,
        params.endpoint || "",
        params.wallet.toLowerCase(),
        txHash,
        ipfsUri,
      );

    return { agentId, name: params.name, txHash, ipfsUri };
  }

  getAgent(agentId: string) {
    const row = this.db
      .prepare("SELECT * FROM agents WHERE agent_id = ?")
      .get(agentId) as AgentRow | undefined;
    if (!row) return null;
    return formatAgent(row);
  }

  getAgentByName(name: string) {
    const row = this.db
      .prepare("SELECT * FROM agents WHERE name = ?")
      .get(name) as AgentRow | undefined;
    if (!row) return null;
    return formatAgent(row);
  }

  listAgents() {
    const rows = this.db
      .prepare("SELECT * FROM agents ORDER BY created_at DESC")
      .all() as AgentRow[];
    return rows.map(formatAgent);
  }
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface AgentRow {
  id: number;
  agent_id: string;
  name: string;
  description: string;
  capabilities: string;
  base_price: number;
  endpoint: string;
  wallet: string;
  tx_hash: string | null;
  ipfs_uri: string | null;
  created_at: string;
}

function formatAgent(row: AgentRow) {
  return {
    agentId: row.agent_id,
    name: row.name,
    description: row.description,
    capabilities: JSON.parse(row.capabilities),
    basePrice: row.base_price,
    endpoint: row.endpoint,
    wallet: row.wallet,
    txHash: row.tx_hash,
    ipfsUri: row.ipfs_uri,
    createdAt: row.created_at,
  };
}
