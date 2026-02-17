export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/demo",
  privateKey: process.env.PRIVATE_KEY || "",

  // Existing protocol addresses (Sepolia)
  usdcAddress: process.env.USDC_SEPOLIA || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  identityRegistry: process.env.IDENTITY_REGISTRY || "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputationRegistry: process.env.REPUTATION_REGISTRY || "0x8004B663056A597Dffe9eCcC1965A193B7388713",

  // Maldo contracts (deployed)
  escrowAddress: process.env.MALDO_ESCROW_ADDRESS || "0x050F6703697727BdE54a8A753a18A1E269F58209",
  routerAddress: process.env.MALDO_ROUTER_ADDRESS || "0x3085A84e511063760d22535E22a688E99592520B",
  mockKlerosAddress: process.env.MOCK_KLEROS_ADDRESS || "0x05D54DB4F36dCcf095B0945eB4dDD014bAe17FC2",

  // x402
  x402FacilitatorUrl: process.env.X402_FACILITATOR_URL || "https://www.x402.org/facilitator",

  // Database (SQLite for PoC)
  dbPath: process.env.DB_PATH || "./maldo.db",
} as const;
