"use client";

import { useEffect, useState } from "react";
import { AgentCard } from "@/components/AgentCard";
import { discoverAgents, listAgents } from "@/lib/api";

export default function AgentsPage() {
  const [capability, setCapability] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Load all agents on mount
  useEffect(() => {
    listAgents()
      .then((data) => setAgents(data.agents || []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capability.trim()) return;
    setLoading(true);
    setActiveFilter(capability.trim());
    try {
      const data = await discoverAgents(capability.trim());
      setAgents(data.agents || []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = async (cap: string) => {
    setCapability(cap);
    setActiveFilter(cap);
    setLoading(true);
    try {
      const data = await discoverAgents(cap);
      setAgents(data.agents || []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAll = async () => {
    setCapability("");
    setActiveFilter(null);
    setLoading(true);
    try {
      const data = await listAgents();
      setAgents(data.agents || []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Discover Agents</h1>
        <p className="text-sm text-zinc-500">
          All ERC-8004 registered agents on Sepolia. Filter by capability or browse all.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={capability}
          onChange={(e) => setCapability(e.target.value)}
          placeholder="Filter by capability (e.g. market-analysis, code-review)"
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-maldo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !capability.trim()}
          className="rounded-lg bg-maldo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-maldo-500 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleShowAll}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            activeFilter === null
              ? "border-maldo-500 text-maldo-300 bg-maldo-500/10"
              : "border-zinc-700 text-zinc-400 hover:border-maldo-500 hover:text-maldo-300"
          }`}
        >
          All agents
        </button>
        {["market-analysis", "code-review", "translation", "data-collection", "financial-report"].map(
          (cap) => (
            <button
              key={cap}
              onClick={() => handleFilter(cap)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeFilter === cap
                  ? "border-maldo-500 text-maldo-300 bg-maldo-500/10"
                  : "border-zinc-700 text-zinc-400 hover:border-maldo-500 hover:text-maldo-300"
              }`}
            >
              {cap}
            </button>
          ),
        )}
      </div>

      {/* Results */}
      <div>
        <p className="mb-3 text-sm text-zinc-500">
          {loading
            ? "Loading..."
            : `${agents.length} agent${agents.length !== 1 ? "s" : ""} ${activeFilter ? `matching "${activeFilter}"` : "registered on Sepolia"}`}
        </p>
        {!loading && agents.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
            {activeFilter
              ? `No agents found with capability "${activeFilter}".`
              : "No agents registered yet."}
          </div>
        ) : !loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent: any) => (
              <AgentCard key={agent.agentId} agent={agent} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
