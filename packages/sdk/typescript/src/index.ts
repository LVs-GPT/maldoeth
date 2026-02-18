/**
 * Maldo TypeScript SDK
 *
 * Wraps the Maldo REST API so agents can interact without raw HTTP calls.
 * Supports both crypto-native (ethers signer) and web-native (x402) paths.
 */

export interface MaldoClientConfig {
  /** Base URL of the Maldo API server (default: http://localhost:3000) */
  apiUrl?: string;
  /** Ethers signer for on-chain operations (optional for web-native path) */
  signer?: any; // ethers.Signer
  /** Network identifier */
  network?: "sepolia" | "mainnet";
}

export interface RegisterParams {
  name: string;
  description?: string;
  capabilities: string[];
  basePrice?: number;
  endpoint?: string;
  wallet: string;
}

export interface DiscoverParams {
  capability: string;
  minRep?: number;
  limit?: number;
}

export interface CreateDealParams {
  agentId: string;
  clientAddress: string;
  priceUSDC: number;
  taskDescription: string;
  principal?: string;
}

export interface RateParams {
  dealNonce: string;
  raterAddress: string;
  score: number;
  comment?: string;
}

export interface VouchParams {
  voucherAgentId: string;
  voucherWallet: string;
  signature: string;
}

export interface X402RequestParams {
  capability: string;
  taskDescription: string;
  clientAddress: string;
  maxPrice?: number;
}

export class MaldoClient {
  private baseUrl: string;

  constructor(config: MaldoClientConfig = {}) {
    this.baseUrl = (config.apiUrl || "http://localhost:3000").replace(/\/$/, "");
  }

  // ─── Agent Registration ───────────────────────────────────────────

  readonly agents = {
    register: async (params: RegisterParams) => {
      return this.post("/api/v1/services/register", params);
    },

    discover: async (params: DiscoverParams) => {
      const query = new URLSearchParams();
      query.set("capability", params.capability);
      if (params.minRep) query.set("minRep", String(params.minRep));
      if (params.limit) query.set("limit", String(params.limit));
      return this.get(`/api/v1/services/discover?${query}`);
    },

    get: async (agentId: string) => {
      return this.get(`/api/v1/agents/${agentId}`);
    },

    list: async () => {
      return this.get("/api/v1/agents");
    },

    reputation: async (agentId: string) => {
      return this.get(`/api/v1/agents/${agentId}/reputation`);
    },

    rate: async (agentId: string, params: RateParams) => {
      return this.post(`/api/v1/agents/${agentId}/rate`, params);
    },

    ratings: async (agentId: string) => {
      return this.get(`/api/v1/agents/${agentId}/ratings`);
    },

    vouch: async (voucheeAgentId: string, params: VouchParams) => {
      return this.post(`/api/v1/agents/${voucheeAgentId}/vouch`, params);
    },

    withdrawVouch: async (voucheeAgentId: string, voucherAgentId: string) => {
      return this.del(`/api/v1/agents/${voucheeAgentId}/vouch/${voucherAgentId}`);
    },

    vouches: async (agentId: string) => {
      return this.get(`/api/v1/agents/${agentId}/vouches`);
    },
  };

  // ─── Deals ────────────────────────────────────────────────────────

  readonly deals = {
    create: async (params: CreateDealParams) => {
      return this.post("/api/v1/deals/create", params);
    },

    status: async (nonce: string) => {
      return this.get(`/api/v1/deals/${nonce}/status`);
    },

    approve: async (approvalId: number) => {
      return this.post(`/api/v1/deals/approve/${approvalId}`, {});
    },

    reject: async (approvalId: number) => {
      return this.post(`/api/v1/deals/reject/${approvalId}`, {});
    },

    pending: async (principal: string) => {
      return this.get(`/api/v1/deals/pending/${principal}`);
    },

    list: async () => {
      return this.get("/api/v1/deals");
    },
  };

  // ─── Criteria ─────────────────────────────────────────────────────

  readonly criteria = {
    get: async (principal: string) => {
      return this.get(`/api/v1/principals/${principal}/criteria`);
    },

    applyPreset: async (principal: string, preset: "Conservative" | "Balanced" | "Aggressive") => {
      return this.put(`/api/v1/principals/${principal}/criteria`, { preset });
    },

    setCustom: async (principal: string, criteria: Record<string, any>) => {
      return this.put(`/api/v1/principals/${principal}/criteria`, criteria);
    },

    evaluate: async (principal: string, agentId: string, price: number) => {
      return this.post("/api/v1/criteria/evaluate", { principal, agentId, price });
    },
  };

  // ─── x402 (web-native path) ───────────────────────────────────────

  readonly x402 = {
    /** Get payment requirements for a capability (returns 402) */
    getRequirements: async (capability: string) => {
      const res = await fetch(`${this.baseUrl}/x402/services/${capability}`);
      return res.json();
    },

    /** Submit a paid request */
    request: async (params: X402RequestParams) => {
      // Step 1: Check requirements
      const reqRes = await fetch(`${this.baseUrl}/x402/services/${params.capability}`);
      const requirements = await reqRes.json();

      // Step 2: Check price limit
      if (params.maxPrice && Number(requirements.requirements?.amount) > params.maxPrice) {
        throw new Error(
          `Price ${requirements.requirements?.amount} exceeds max ${params.maxPrice}`,
        );
      }

      // Step 3: Submit task
      return this.post(`/x402/services/${params.capability}`, {
        taskDescription: params.taskDescription,
        clientAddress: params.clientAddress,
      });
    },

    /** Poll for deal result */
    pollResult: async (nonce: string) => {
      return this.get(`/x402/deals/${nonce}/result`);
    },
  };

  // ─── HTTP helpers ─────────────────────────────────────────────────

  private async get(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new MaldoApiError(res.status, body.error || res.statusText);
    }
    return res.json();
  }

  private async post(path: string, body: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 402) {
      const data = await res.json().catch(() => ({}));
      throw new MaldoApiError(res.status, data.error || res.statusText);
    }
    return res.json();
  }

  private async put(path: string, body: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new MaldoApiError(res.status, data.error || res.statusText);
    }
    return res.json();
  }

  private async del(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new MaldoApiError(res.status, data.error || res.statusText);
    }
    return res.json();
  }
}

export class MaldoApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "MaldoApiError";
  }
}
