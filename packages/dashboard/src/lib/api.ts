const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

async function fetchApi(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok && res.status !== 402) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

// ─── Agents ─────────────────────────────────────────────────────────

export async function listAgents() {
  return fetchApi("/api/v1/agents");
}

export async function discoverAgents(capability: string, limit = 10) {
  const params = new URLSearchParams({ capability, limit: String(limit) });
  return fetchApi(`/api/v1/services/discover?${params}`);
}

export async function getAgent(agentId: string) {
  return fetchApi(`/api/v1/agents/${agentId}`);
}

export async function getAgentReputation(agentId: string) {
  return fetchApi(`/api/v1/agents/${agentId}/reputation`);
}

export async function getAgentRatings(agentId: string) {
  return fetchApi(`/api/v1/agents/${agentId}/ratings`);
}

export async function getAgentVouches(agentId: string) {
  return fetchApi(`/api/v1/agents/${agentId}/vouches`);
}

// ─── Deals ──────────────────────────────────────────────────────────

export async function listDeals() {
  return fetchApi("/api/v1/deals");
}

export async function getPendingApprovals(principal: string) {
  return fetchApi(`/api/v1/deals/pending/${principal}`);
}

export async function approveDeal(approvalId: number) {
  return fetchApi(`/api/v1/deals/approve/${approvalId}`, { method: "POST" });
}

export async function rejectDeal(approvalId: number) {
  return fetchApi(`/api/v1/deals/reject/${approvalId}`, { method: "POST" });
}

export async function createDeal(body: {
  agentId: string;
  clientAddress: string;
  priceUSDC: number;
  taskDescription: string;
}) {
  return fetchApi("/api/v1/deals/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function completeDeal(nonce: string) {
  return fetchApi(`/api/v1/deals/${nonce}/complete`, { method: "POST" });
}

export async function disputeDeal(nonce: string) {
  return fetchApi(`/api/v1/deals/${nonce}/dispute`, { method: "POST" });
}

export async function resolveDispute(nonce: string, ruling: number) {
  return fetchApi(`/api/v1/deals/${nonce}/resolve`, {
    method: "POST",
    body: JSON.stringify({ ruling }),
  });
}

export async function rateAgent(agentId: string, body: {
  dealNonce: string;
  raterAddress: string;
  score: number;
  comment?: string;
}) {
  return fetchApi(`/api/v1/agents/${agentId}/rate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Criteria ───────────────────────────────────────────────────────

export async function getCriteria(principal: string) {
  return fetchApi(`/api/v1/principals/${principal}/criteria`);
}

export async function setCriteria(principal: string, body: Record<string, unknown>) {
  return fetchApi(`/api/v1/principals/${principal}/criteria`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
