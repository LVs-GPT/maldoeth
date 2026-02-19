/**
 * Public Sepolia RPCs — tried in order when the primary fails.
 * No API keys required. Ankr & PublicNode handle getLogs best.
 */
export const SEPOLIA_RPC_FALLBACKS = [
  "https://rpc.ankr.com/eth_sepolia",
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.drpc.org",
  "https://rpc2.sepolia.org",
];

/**
 * Config reads process.env lazily via getters so that dotenv has time
 * to load before values are accessed (ESM hoists static imports).
 */
export const config = {
  get port() { return parseInt(process.env.PORT || "3000", 10); },
  get sepoliaRpcUrl() { return process.env.SEPOLIA_RPC_URL || SEPOLIA_RPC_FALLBACKS[0]; },
  get sepoliaRpcFallbacks(): string[] {
    const primary = config.sepoliaRpcUrl;
    // Return all RPCs with primary first, deduped
    return [primary, ...SEPOLIA_RPC_FALLBACKS.filter((u) => u !== primary)];
  },
  get privateKey() { return process.env.PRIVATE_KEY || ""; },

  // Existing protocol addresses (Sepolia)
  get usdcAddress() { return process.env.USDC_SEPOLIA || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; },
  get identityRegistry() { return process.env.IDENTITY_REGISTRY || "0x8004A818BFB912233c491871b3d84c89A494BD9e"; },
  get reputationRegistry() { return process.env.REPUTATION_REGISTRY || "0x8004B663056A597Dffe9eCcC1965A193B7388713"; },

  // Maldo contracts (deployed)
  get escrowAddress() { return process.env.MALDO_ESCROW_ADDRESS || "0x050F6703697727BdE54a8A753a18A1E269F58209"; },
  get routerAddress() { return process.env.MALDO_ROUTER_ADDRESS || "0x3085A84e511063760d22535E22a688E99592520B"; },
  get mockKlerosAddress() { return process.env.MOCK_KLEROS_ADDRESS || "0x05D54DB4F36dCcf095B0945eB4dDD014bAe17FC2"; },

  // x402
  get x402FacilitatorUrl() { return process.env.X402_FACILITATOR_URL || "https://www.x402.org/facilitator"; },

  // Subgraph URL (The Graph — Subgraph Studio on Sepolia)
  get subgraphUrl() { return process.env.SUBGRAPH_URL || "https://api.studio.thegraph.com/query/1742369/maldo-identity/version/latest"; },

  // Escrow deployment block (for full event replay on fresh DB)
  get escrowStartBlock() { return parseInt(process.env.ESCROW_START_BLOCK || "9989417", 10); },

  // CORS — restrict in production, allow all in dev
  get corsOrigin() { return process.env.CORS_ORIGIN || "*"; },

  // Database (SQLite for PoC)
  get dbPath() { return process.env.DB_PATH || "./maldo.db"; },
};
