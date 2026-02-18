"use client";

import { useState } from "react";
import { AgentCard } from "@/components/AgentCard";
import { discoverAgents } from "@/lib/api";

export default function AgentsPage() {
  const [capability, setCapability] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capability.trim()) return;
    setLoading(true);
    try {
      const data = await discoverAgents(capability.trim());
      setAgents(data.agents || []);
      setSearched(true);
    } catch {
      setAgents([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Discover Agents</h1>
        <p className="text-sm text-zinc-500">
          Search for AI service agents by capability. Results are ranked by reputation.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={capability}
          onChange={(e) => setCapability(e.target.value)}
          placeholder="Enter capability (e.g. market-analysis, code-review)"
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !capability.trim()}
          className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2">
        {["market-analysis", "code-review", "translation", "data-collection", "financial-report"].map(
          (cap) => (
            <button
              key={cap}
              onClick={() => {
                setCapability(cap);
                setLoading(true);
                discoverAgents(cap)
                  .then((data) => {
                    setAgents(data.agents || []);
                    setSearched(true);
                  })
                  .catch(() => {
                    setAgents([]);
                    setSearched(true);
                  })
                  .finally(() => setLoading(false));
              }}
              className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-indigo-500 hover:text-indigo-300"
            >
              {cap}
            </button>
          ),
        )}
      </div>

      {/* Results */}
      {searched && (
        <div>
          <p className="mb-3 text-sm text-zinc-500">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} found
          </p>
          {agents.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
              No agents found with capability &ldquo;{capability}&rdquo;.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent: any) => (
                <AgentCard key={agent.agentId} agent={agent} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
