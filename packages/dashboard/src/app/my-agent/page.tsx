"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@/hooks/useWallet";
import {
  getAgentsByWallet,
  registerAgent,
  getCriteria,
  setCriteria,
  listDeals,
} from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";

// ─── Criteria presets (same as before) ──────────────────────────────
const PRESETS = [
  {
    name: "Conservative",
    color: "var(--blue)",
    description: "High trust bar. Only established agents.",
    minReputation: 480,
    minReviewCount: 5,
    maxPriceUSDC: 100_000,
  },
  {
    name: "Balanced",
    color: "var(--green)",
    description: "Moderate trust bar. Recommended.",
    minReputation: 400,
    minReviewCount: 3,
    maxPriceUSDC: 1_000_000,
  },
  {
    name: "Aggressive",
    color: "var(--yellow)",
    description: "Low trust bar. Max autonomy.",
    minReputation: 300,
    minReviewCount: 1,
    maxPriceUSDC: 10_000_000,
  },
  {
    name: "Demo",
    color: "var(--red)",
    description: "No restrictions. For demos only.",
    minReputation: 0,
    minReviewCount: 0,
    maxPriceUSDC: 100_000_000,
  },
];

// ─── Capability presets ─────────────────────────────────────────────
const CAPABILITY_OPTIONS = [
  "market-analysis",
  "code-review",
  "translation",
  "data-collection",
  "financial-report",
  "security-audit",
  "oracle",
  "content-generation",
];

export default function MyAgentPage() {
  const { address, isConnected } = useWallet();
  const [tab, setTab] = useState<"profile" | "criteria" | "deals">("profile");
  const [myAgents, setMyAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMyAgents = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const data = await getAgentsByWallet(address);
      setMyAgents(data.agents || []);
    } catch {
      setMyAgents([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadMyAgents();
  }, [loadMyAgents]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-24">
        <div className="flex h-14 w-14 items-center justify-center border border-[var(--border)] bg-[var(--surface)]">
          <svg className="h-6 w-6 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div className="text-center">
          <h2 className="text-base font-bold text-[var(--foreground)]">Sign in to continue</h2>
          <p className="mt-2 text-xs text-[var(--mid)]">
            Sign in to register your agent or manage an existing one.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-24 justify-center text-[var(--mid)]">
        <span className="cursor-blink" />
        <span className="text-xs">Loading&hellip;</span>
      </div>
    );
  }

  const hasAgent = myAgents.length > 0;

  return (
    <div className="space-y-8 pt-14 sm:space-y-10 sm:pt-16">
      {/* Header */}
      <header>
        <div className="section-label">My Agent</div>
        <p className="text-xs text-[var(--mid)]">
          {address?.slice(0, 6)}&hellip;{address?.slice(-4)}
        </p>
      </header>

      {hasAgent ? (
        <>
          {/* Tabs */}
          <div className="flex gap-0 border-b border-[var(--border)]">
            {(["profile", "criteria", "deals"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 pb-2 text-xs font-bold transition-colors border-b-2 -mb-px capitalize ${
                  tab === t
                    ? "border-[var(--green)] text-[var(--green)]"
                    : "border-transparent text-[var(--mid)] hover:text-[var(--foreground)]"
                }`}
              >
                {t === "deals" ? "Incoming Deals" : t}
              </button>
            ))}
          </div>

          {tab === "profile" && <AgentProfile agent={myAgents[0]} />}
          {tab === "criteria" && <CriteriaTab address={address!} />}
          {tab === "deals" && <IncomingDealsTab agentWallet={address!} />}
        </>
      ) : (
        <RegisterForm wallet={address!} onRegistered={loadMyAgents} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// REGISTER FORM
// ═══════════════════════════════════════════════════════════════════════

function RegisterForm({ wallet, onRegistered }: { wallet: string; onRegistered: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [customCap, setCustomCap] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<any>(null);
  const { toast } = useToast();

  const toggleCap = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  };

  const addCustomCap = () => {
    const trimmed = customCap.trim().toLowerCase().replace(/\s+/g, "-");
    if (trimmed && !capabilities.includes(trimmed)) {
      setCapabilities((prev) => [...prev, trimmed]);
    }
    setCustomCap("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || capabilities.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await registerAgent({
        name: name.trim(),
        description: description.trim(),
        capabilities,
        basePrice: basePrice ? Math.round(parseFloat(basePrice) * 1e6) : 0,
        endpoint: endpoint.trim(),
        wallet,
      });
      setSuccess(result);
      toast("success", "Agent registered! Now visible in the marketplace.", result.txHash);
      setTimeout(() => onRegistered(), 1500);
    } catch (err: any) {
      setError(err.message || "Registration failed");
      toast("error", err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="border border-[var(--green-dim)] bg-[rgba(0,232,122,0.05)] p-8">
        <h3 className="text-sm font-bold text-[var(--green)] mb-2">Agent registered</h3>
        <p className="text-xs text-[var(--mid)] mb-4">
          Your agent is now visible to all users in the marketplace.
        </p>
        <div className="space-y-1 text-xs">
          <p><span className="text-[var(--mid)]">Agent ID:</span> <span className="text-[var(--foreground)] font-bold">{success.agentId}</span></p>
          <p><span className="text-[var(--mid)]">Name:</span> <span className="text-[var(--foreground)]">{success.name}</span></p>
          {success.txHash && (
            <p><span className="text-[var(--mid)]">Tx:</span> <span className="text-[var(--foreground)] break-all">{success.txHash}</span></p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-2">Register your Agent</h3>
        <p className="text-xs text-[var(--mid)] leading-relaxed">
          Create an ERC-8004 agent identity. Your agent will appear in the marketplace
          and other users can hire it for tasks. Fill in the details below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className="text-[11px] text-[var(--mid)] tracking-[0.1em] uppercase block mb-2">
            Agent Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. MarketAnalyzerGPT"
            className="input w-full"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-[11px] text-[var(--mid)] tracking-[0.1em] uppercase block mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does your agent do?"
            rows={3}
            className="textarea w-full"
          />
        </div>

        {/* Capabilities */}
        <div>
          <label className="text-[11px] text-[var(--mid)] tracking-[0.1em] uppercase block mb-2">
            Capabilities * <span className="normal-case text-[var(--dim)]">(select or add custom)</span>
          </label>
          <div className="flex gap-2 flex-wrap mb-3">
            {CAPABILITY_OPTIONS.map((cap) => (
              <button
                type="button"
                key={cap}
                onClick={() => toggleCap(cap)}
                className={`tag cursor-pointer transition-colors text-[11px] ${
                  capabilities.includes(cap)
                    ? "border-[var(--green)] text-[var(--green)]"
                    : "border-[var(--dim)] text-[var(--mid)] hover:border-[var(--green-dim)]"
                }`}
              >
                {capabilities.includes(cap) ? "+" : ""}{cap}
              </button>
            ))}
          </div>
          {/* Custom capability input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customCap}
              onChange={(e) => setCustomCap(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomCap())}
              placeholder="Add custom capability"
              className="input flex-1 text-xs"
            />
            <button type="button" onClick={addCustomCap} className="btn btn-ghost text-xs" disabled={!customCap.trim()}>
              Add
            </button>
          </div>
          {/* Selected capabilities */}
          {capabilities.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-3">
              {capabilities.map((cap) => (
                <span
                  key={cap}
                  className="tag border-[var(--green)] text-[var(--green)] text-[10px] cursor-pointer"
                  onClick={() => toggleCap(cap)}
                >
                  {cap} &times;
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Price & Endpoint */}
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="text-[11px] text-[var(--mid)] tracking-[0.1em] uppercase block mb-2">
              Base Price (USDC)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              placeholder="0.00"
              className="input w-full"
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--mid)] tracking-[0.1em] uppercase block mb-2">
              Endpoint URL
            </label>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://my-agent.example.com/api"
              className="input w-full"
            />
          </div>
        </div>

        {/* Wallet (auto-filled) */}
        <div>
          <label className="text-[11px] text-[var(--mid)] tracking-[0.1em] uppercase block mb-2">
            Owner Wallet
          </label>
          <div className="input w-full bg-[var(--surface)] text-[var(--dim)] text-xs cursor-not-allowed">
            {wallet}
          </div>
        </div>

        {error && <p className="text-xs text-[var(--red)]">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !name.trim() || capabilities.length === 0}
          className="btn btn-primary w-full sm:w-auto"
        >
          {submitting ? <><Spinner size={14} className="inline mr-1.5" />Registering&hellip;</> : "Register Agent"}
        </button>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// AGENT PROFILE
// ═══════════════════════════════════════════════════════════════════════

function AgentProfile({ agent }: { agent: any }) {
  return (
    <div className="space-y-6">
      {/* Agent card */}
      <div className="border border-[var(--border)] bg-[var(--bg)]">
        <div className="p-6 border-b border-[var(--border)]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-base font-bold text-[var(--foreground)]">{agent.name}</h3>
              <p className="text-xs text-[var(--dim)] mt-1">ID: {agent.agentId}</p>
            </div>
            <span className={`tag text-[10px] ${
              agent.txHash
                ? "border-[var(--green-dim)] text-[var(--green)]"
                : "border-[var(--dim)] text-[var(--mid)]"
            }`}>
              {agent.txHash ? "on-chain" : "off-chain"}
            </span>
          </div>
        </div>

        <div className="p-6">
          {agent.description && (
            <p className="text-xs text-[var(--mid)] leading-relaxed mb-4">{agent.description}</p>
          )}

          {/* Capabilities */}
          {agent.capabilities?.length > 0 && (
            <div className="mb-4">
              <span className="text-[11px] text-[var(--dim)] tracking-[0.1em] uppercase">Capabilities</span>
              <div className="flex gap-2 flex-wrap mt-2">
                {agent.capabilities.map((cap: string) => (
                  <span key={cap} className="tag border-[var(--green-dim)] text-[var(--green)] text-[10px]">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3">
            <div className="bg-[var(--bg)] p-4">
              <p className="text-[10px] text-[var(--dim)] tracking-[0.05em]">Base Price</p>
              <p className="mt-1 text-xs font-bold tabular-nums text-[var(--foreground)]">
                {agent.basePrice ? `$${(agent.basePrice / 1e6).toFixed(2)}` : "Free"}
              </p>
            </div>
            <div className="bg-[var(--bg)] p-4">
              <p className="text-[10px] text-[var(--dim)] tracking-[0.05em]">Endpoint</p>
              <p className="mt-1 text-xs text-[var(--foreground)] truncate">
                {agent.endpoint || "Not set"}
              </p>
            </div>
            <div className="bg-[var(--bg)] p-4">
              <p className="text-[10px] text-[var(--dim)] tracking-[0.05em]">Registered</p>
              <p className="mt-1 text-xs text-[var(--foreground)]">
                {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {agent.txHash && (
        <p className="text-[11px] text-[var(--dim)]">
          Tx: <span className="text-[var(--mid)] break-all">{agent.txHash}</span>
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CRITERIA TAB (moved from /dashboard/criteria)
// ═══════════════════════════════════════════════════════════════════════

function CriteriaTab({ address }: { address: string }) {
  const [currentPreset, setCurrentPreset] = useState("Conservative");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [criteriaData, setCriteriaData] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    getCriteria(address)
      .then((data) => {
        setCriteriaData(data);
        setCurrentPreset(data.preset || "Conservative");
      })
      .catch(() => {});
  }, [address]);

  const handleSave = async (preset: string) => {
    setSaving(true);
    setSaved(false);
    try {
      const result = await setCriteria(address, { preset });
      setCriteriaData(result);
      setCurrentPreset(preset);
      setSaved(true);
      toast("success", `Criteria updated to "${preset}".`);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast("error", err.message || "Failed to save criteria");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-[var(--mid)] leading-[1.7] max-w-[580px]">
        Configure trust boundaries for hiring agents. Deals that fail these criteria
        require your manual approval.
      </p>

      {/* Preset cards */}
      <div className="grid gap-px bg-[var(--border)] grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((preset) => {
          const isActive = currentPreset === preset.name;
          return (
            <button
              key={preset.name}
              onClick={() => handleSave(preset.name)}
              disabled={saving}
              className={`bg-[var(--bg)] p-4 sm:p-6 text-left transition-all disabled:opacity-50 hover:bg-[var(--bg2)] ${
                isActive ? "!border-l-2 !border-l-[var(--green)]" : ""
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                {isActive && (
                  <span className="status-dot bg-[var(--green)]" style={{ boxShadow: '0 0 6px var(--green)' }} />
                )}
                <h3
                  className="text-[12px] sm:text-[13px] font-bold"
                  style={{ color: isActive ? preset.color : 'var(--foreground)' }}
                >
                  {preset.name}
                </h3>
              </div>
              <p className="mb-3 text-[10px] sm:text-[11px] text-[var(--mid)] leading-[1.7]">
                {preset.description}
              </p>
              <div className="space-y-1 border-t border-[var(--border)] pt-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[var(--mid)]">Rep</span>
                  <span className="text-[var(--foreground)]">{(preset.minReputation / 100).toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-[var(--mid)]">Reviews</span>
                  <span className="text-[var(--foreground)]">{preset.minReviewCount}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-[var(--mid)]">Max $</span>
                  <span className="text-[var(--foreground)]">${(preset.maxPriceUSDC / 1e6).toFixed(2)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {saved && (
        <p className="animate-fade-in text-xs text-[var(--green)]">Criteria updated.</p>
      )}

      {criteriaData && (
        <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
          <div className="bg-[var(--bg)] p-5">
            <p className="text-[10px] text-[var(--dim)]">Preset</p>
            <p className="mt-1 text-xs font-bold">{criteriaData.preset}</p>
          </div>
          <div className="bg-[var(--bg)] p-5">
            <p className="text-[10px] text-[var(--dim)]">Min Rep</p>
            <p className="mt-1 text-xs font-bold">{(criteriaData.minReputation / 100).toFixed(1)}</p>
          </div>
          <div className="bg-[var(--bg)] p-5">
            <p className="text-[10px] text-[var(--dim)]">Min Reviews</p>
            <p className="mt-1 text-xs font-bold">{criteriaData.minReviewCount}</p>
          </div>
          <div className="bg-[var(--bg)] p-5">
            <p className="text-[10px] text-[var(--dim)]">Max Price</p>
            <p className="mt-1 text-xs font-bold">${(criteriaData.maxPriceUSDC / 1e6).toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// INCOMING DEALS TAB
// ═══════════════════════════════════════════════════════════════════════

function IncomingDealsTab({ agentWallet }: { agentWallet: string }) {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDeals()
      .then((data) => {
        // Filter deals where this wallet is the server/agent side
        const incoming = (data.deals || []).filter(
          (d: any) => d.serverAddress?.toLowerCase() === agentWallet.toLowerCase(),
        );
        setDeals(incoming);
      })
      .catch(() => setDeals([]))
      .finally(() => setLoading(false));
  }, [agentWallet]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-[var(--mid)]">
        <span className="cursor-blink" />
        <span className="text-xs">Loading&hellip;</span>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] p-10 text-center">
        <p className="text-sm text-[var(--mid)]">No incoming deals yet.</p>
        <p className="text-xs text-[var(--dim)] mt-2">
          When someone hires your agent, deals will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[var(--mid)]">{deals.length} deal{deals.length !== 1 ? "s" : ""}</p>
      <div className="border border-[var(--border)] overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
              <th className="p-3 text-left text-[10px] text-[var(--dim)] tracking-[0.05em] uppercase">Nonce</th>
              <th className="p-3 text-left text-[10px] text-[var(--dim)] tracking-[0.05em] uppercase">Client</th>
              <th className="p-3 text-right text-[10px] text-[var(--dim)] tracking-[0.05em] uppercase">Amount</th>
              <th className="p-3 text-center text-[10px] text-[var(--dim)] tracking-[0.05em] uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal: any) => (
              <tr key={deal.nonce} className="border-b border-[var(--border)] last:border-b-0">
                <td className="p-3 text-[var(--mid)] font-mono">{deal.nonce?.slice(0, 10)}...</td>
                <td className="p-3 text-[var(--mid)]">{deal.clientAddress?.slice(0, 8)}...</td>
                <td className="p-3 text-right tabular-nums text-[var(--foreground)]">
                  ${deal.amount ? (deal.amount / 1e6).toFixed(2) : "—"}
                </td>
                <td className="p-3 text-center">
                  <span className={`tag text-[10px] ${
                    deal.status === "Funded" ? "border-[var(--green-dim)] text-[var(--green)]" :
                    deal.status === "Completed" ? "border-[var(--blue)] text-[var(--blue)]" :
                    deal.status === "Disputed" ? "border-[var(--red)] text-[var(--red)]" :
                    "border-[var(--dim)] text-[var(--mid)]"
                  }`}>
                    {deal.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
