/**
 * Config reads process.env lazily via getters so that dotenv has time
 * to load before values are accessed (ESM hoists static imports).
 */
export const config = {
  get port() { return parseInt(process.env.PORT || "3000", 10); },
  get sepoliaRpcUrl() { return process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/demo"; },
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

  // CORS — restrict in production, allow all in dev
  get corsOrigin() { return process.env.CORS_ORIGIN || "*"; },

  // Database (SQLite for PoC)
  get dbPath() { return process.env.DB_PATH || "./maldo.db"; },
};
