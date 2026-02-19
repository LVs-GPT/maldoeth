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

const PAGE_SIZE = 60;

export default function AgentsPage() {
  const [capability, setCapability] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const loadAgents = async (cap?: string) => {
    setLoading(true);
    try {
      const data = await discoverAgents(cap);
      const list = data.agents || [];
      console.log(`[Discover] API returned ${list.length} agents (server count: ${data.count})`);
      setAgents(list);
    } catch (err) {
      console.error("[Discover] Failed to load agents:", err);
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
    setPage(0);
    loadAgents(capability.trim());
  };

  const handleFilter = async (cap: string) => {
    setCapability(cap);
    setActiveFilter(cap);
    setPage(0);
    loadAgents(cap);
  };

  const handleShowAll = async () => {
    setCapability("");
    setActiveFilter(null);
    setPage(0);
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

  const sorted = [...agents].sort((a, b) => (b.reputation?.bayesianScore ?? 0) - (a.reputation?.bayesianScore ?? 0));
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const chainCount = agents.filter((a) => a.source === "chain").length;
  const seedCount = agents.filter((a) => a.source !== "chain").length;

  return (
    <div className="space-y-8 pt-14 sm:space-y-10 sm:pt-16">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="section-label">Discover Agents</div>
          <p className="mt-2 text-[13px] text-[var(--mid)] leading-[1.7] max-w-[580px]">
            All ERC-8004 registered agents on Sepolia. Filter by capability or browse the full registry.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn btn-ghost text-xs whitespace-nowrap shrink-0"
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
      <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={capability}
          onChange={(e) => setCapability(e.target.value)}
          placeholder="Filter by capability (e.g. market-analysis)"
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={loading || !capability.trim()}
          className="btn btn-primary shrink-0"
        >
          {loading ? "Searching\u2026" : "Search"}
        </button>
      </form>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin sm:flex-wrap sm:overflow-visible sm:pb-0">
        <button
          onClick={handleShowAll}
          className={`tag cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
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
            className={`tag cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
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
          <>
            <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
              {sorted
                .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                .map((agent: any) => (
                <div key={agent.agentId} className="border border-[var(--border)]">
                  <AgentCard agent={agent} />
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn btn-ghost text-xs disabled:opacity-30"
                >
                  &larr; Prev
                </button>
                <span className="text-[11px] tabular-nums text-[var(--mid)]">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn btn-ghost text-xs disabled:opacity-30"
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
