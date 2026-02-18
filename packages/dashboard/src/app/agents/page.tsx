"use client";

import { useEffect, useState } from "react";
import { AgentCard } from "@/components/AgentCard";
import { discoverAgents, listAgents } from "@/lib/api";

const CAPABILITIES = [
  "market-analysis",
  "code-review",
  "translation",
  "data-collection",
  "financial-report",
];

export default function AgentsPage() {
  const [capability, setCapability] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

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
    <div className="space-y-10">
      {/* Header */}
      <header>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
          Discover Agents
        </h1>
        <p className="dropcap mt-3 text-sm leading-relaxed text-[var(--text-tertiary)]">
          All ERC-8004 registered agents on Sepolia. Filter by capability or browse the full registry.
        </p>
      </header>

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
              ? "border-maldo-700 bg-maldo-500/8 text-maldo-400"
              : "border-[var(--border)] text-[var(--text-tertiary)] hover:border-maldo-700 hover:text-maldo-400"
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
                ? "border-maldo-700 bg-maldo-500/8 text-maldo-400"
                : "border-[var(--border)] text-[var(--text-tertiary)] hover:border-maldo-700 hover:text-maldo-400"
            }`}
          >
            {cap}
          </button>
        ))}
      </div>

      <hr className="section-rule" />

      {/* Results */}
      <div>
        <p className="mb-4 text-xs text-[var(--text-tertiary)]">
          {loading
            ? "Loading\u2026"
            : `${agents.length} agent${agents.length !== 1 ? "s" : ""} ${activeFilter ? `matching \u201c${activeFilter}\u201d` : "registered on Sepolia"}`}
        </p>

        {!loading && agents.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="font-serif text-base text-[var(--text-tertiary)]">
              {activeFilter
                ? `No agents found with capability \u201c${activeFilter}\u201d`
                : "No agents registered yet"}
            </p>
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
