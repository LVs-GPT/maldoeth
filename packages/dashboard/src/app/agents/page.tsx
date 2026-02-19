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
    <div className="space-y-10 pt-16">
      {/* Header */}
      <header>
        <div className="section-label">Discover Agents</div>
        <p className="mt-2 text-[13px] text-[var(--mid)] leading-[1.7] max-w-[580px]">
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
        <p className="mb-4 text-[11px] text-[var(--mid)]">
          {loading
            ? "Loading\u2026"
            : `${agents.length} agent${agents.length !== 1 ? "s" : ""} ${activeFilter ? `matching \u201c${activeFilter}\u201d` : "registered on Sepolia"}`}
        </p>

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
