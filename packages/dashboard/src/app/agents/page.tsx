"use client";

import { useEffect, useState } from "react";
import { AgentCard } from "@/components/AgentCard";
import { discoverAgents, syncAgents } from "@/lib/api";

const CAPABILITIES = [
  "market-analysis",
  "code-review",
  "translation",
  "data-collection",
  "financial-report",
  "security-audit",
  "oracle",
];

export default function AgentsPage() {
  const [capability, setCapability] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const loadAgents = async (cap?: string) => {
    setLoading(true);
    try {
      const data = await discoverAgents(cap, 100);
      setAgents(data.agents || []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capability.trim()) return;
    setActiveFilter(capability.trim());
    loadAgents(capability.trim());
  };

  const handleFilter = async (cap: string) => {
    setCapability(cap);
    setActiveFilter(cap);
    loadAgents(cap);
  };

  const handleShowAll = async () => {
    setCapability("");
    setActiveFilter(null);
    loadAgents();
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const data = await syncAgents();
      if (data.status === "already_running") {
        setSyncResult(data.message || "Sync already in progress...");
      } else if (data.status === "started") {
        setSyncResult("Sync started — refreshing in 30s...");
        // Poll for new agents while sync runs in background
        const poll = setInterval(async () => {
          await loadAgents(activeFilter || undefined);
        }, 10_000);
        // Stop polling after 2 minutes
        setTimeout(() => {
          clearInterval(poll);
          setSyncing(false);
          setSyncResult(null);
          loadAgents(activeFilter || undefined);
        }, 120_000);
        // Do an initial reload after 15s
        setTimeout(() => loadAgents(activeFilter || undefined), 15_000);
        return; // Don't setSyncing(false) yet
      } else {
        setSyncResult(`Synced ${data.synced} new agent${data.synced !== 1 ? "s" : ""} from Sepolia`);
        await loadAgents(activeFilter || undefined);
      }
    } catch (err: any) {
      setSyncResult(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const chainCount = agents.filter((a) => a.source === "chain").length;
  const seedCount = agents.filter((a) => a.source !== "chain").length;

  return (
    <div className="space-y-10 pt-16">
      {/* Header */}
      <header className="flex items-start justify-between">
        <div>
          <div className="section-label">Discover Agents</div>
          <p className="mt-2 text-[13px] text-[var(--mid)] leading-[1.7] max-w-[580px]">
            All ERC-8004 registered agents on Sepolia. Filter by capability or browse the full registry.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn btn-ghost text-xs whitespace-nowrap"
        >
          {syncing ? "Syncing..." : "Sync from Sepolia"}
        </button>
      </header>

      {/* Sync result message */}
      {syncResult && (
        <p className={`text-[11px] ${syncResult.includes("failed") ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
          {syncResult}
        </p>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={capability}
          onChange={(e) => setCapability(e.target.value)}
          placeholder="Filter by capability (e.g. market-analysis, code-review)"
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={loading || !capability.trim()}
          className="btn btn-primary"
        >
          {loading ? "Searching\u2026" : "Search"}
        </button>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleShowAll}
          className={`tag cursor-pointer transition-colors ${
            activeFilter === null
              ? "border-[var(--green)] text-[var(--green)]"
              : "border-[var(--dim)] text-[var(--mid)] hover:border-[var(--green)] hover:text-[var(--green)]"
          }`}
        >
          All agents
        </button>
        {CAPABILITIES.map((cap) => (
          <button
            key={cap}
            onClick={() => handleFilter(cap)}
            className={`tag cursor-pointer transition-colors ${
              activeFilter === cap
                ? "border-[var(--green)] text-[var(--green)]"
                : "border-[var(--dim)] text-[var(--mid)] hover:border-[var(--green)] hover:text-[var(--green)]"
            }`}
          >
            {cap}
          </button>
        ))}
      </div>

      <hr className="section-rule" />

      {/* Results */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <p className="text-[11px] text-[var(--mid)]">
            {loading
              ? "Loading\u2026"
              : `${agents.length} agent${agents.length !== 1 ? "s" : ""} ${activeFilter ? `matching \u201c${activeFilter}\u201d` : "registered"}`}
          </p>
          {!loading && agents.length > 0 && (
            <p className="text-[10px] text-[var(--dim)]">
              {chainCount > 0 && (
                <span className="text-[var(--blue)]">{chainCount} on-chain</span>
              )}
              {chainCount > 0 && seedCount > 0 && " + "}
              {seedCount > 0 && (
                <span>{seedCount} seed</span>
              )}
            </p>
          )}
        </div>

        {!loading && agents.length === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] p-10 text-center">
            <p className="text-sm text-[var(--mid)]">
              {activeFilter
                ? `No agents found with capability \u201c${activeFilter}\u201d`
                : "No agents registered yet"}
            </p>
          </div>
        ) : !loading ? (
          <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
            {[...agents]
              .sort((a, b) => (b.reputation?.bayesianScore ?? 0) - (a.reputation?.bayesianScore ?? 0))
              .map((agent: any) => (
              <AgentCard key={agent.agentId} agent={agent} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
