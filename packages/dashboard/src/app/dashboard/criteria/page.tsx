"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { getCriteria, setCriteria } from "@/lib/api";

const PRESETS = [
  {
    name: "Conservative",
    description: "High trust bar. Only established agents auto-approve. Best for high-value operations.",
    minReputation: 480,
    minReviewCount: 5,
    maxPriceUSDC: 50_000_000,
  },
  {
    name: "Balanced",
    description: "Moderate trust bar. Good balance of autonomy and safety. Recommended for most use cases.",
    minReputation: 400,
    minReviewCount: 3,
    maxPriceUSDC: 100_000_000,
  },
  {
    name: "Aggressive",
    description: "Low trust bar. Maximum autonomy. Only use for low-risk or experimental operations.",
    minReputation: 300,
    minReviewCount: 1,
    maxPriceUSDC: 500_000_000,
  },
];

export default function CriteriaPage() {
  const { address, isConnected } = useAccount();
  const [currentPreset, setCurrentPreset] = useState("Conservative");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [criteriaData, setCriteriaData] = useState<any>(null);

  useEffect(() => {
    if (!address) return;
    getCriteria(address)
      .then((data) => {
        setCriteriaData(data);
        setCurrentPreset(data.preset || "Conservative");
      })
      .catch(() => {});
  }, [address]);

  const handleSave = async (preset: string) => {
    if (!address) return;
    setSaving(true);
    setSaved(false);
    try {
      const result = await setCriteria(address, { preset });
      setCriteriaData(result);
      setCurrentPreset(preset);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="py-20 text-center text-zinc-500">
        Connect your wallet to manage criteria.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Agentic Criteria</h1>
        <p className="text-sm text-zinc-500">
          Configure trust boundaries for your autonomous agents. Deals that fail these
          criteria require your manual approval.
        </p>
      </div>

      {/* Preset selector */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PRESETS.map((preset) => {
          const isActive = currentPreset === preset.name;
          return (
            <button
              key={preset.name}
              onClick={() => handleSave(preset.name)}
              disabled={saving}
              className={`rounded-lg border p-4 text-left transition-all ${
                isActive
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-zinc-800 hover:border-zinc-600"
              } disabled:opacity-50`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isActive ? "bg-indigo-400" : "bg-zinc-600"
                  }`}
                />
                <h3 className={`font-semibold ${isActive ? "text-indigo-300" : "text-zinc-200"}`}>
                  {preset.name}
                </h3>
              </div>
              <p className="mb-3 text-xs text-zinc-500">{preset.description}</p>
              <div className="space-y-1 text-xs text-zinc-400">
                <p>Min reputation: {(preset.minReputation / 100).toFixed(1)}</p>
                <p>Min reviews: {preset.minReviewCount}</p>
                <p>Max price: ${(preset.maxPriceUSDC / 1e6).toFixed(0)}</p>
              </div>
            </button>
          );
        })}
      </div>

      {saved && (
        <p className="text-sm text-green-400">Criteria updated successfully.</p>
      )}

      {/* Current config detail */}
      {criteriaData && (
        <section className="rounded-lg border border-zinc-800 p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-400">Current Configuration</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ConfigItem label="Preset" value={criteriaData.preset} />
            <ConfigItem label="Min Reputation" value={(criteriaData.minReputation / 100).toFixed(1)} />
            <ConfigItem label="Min Reviews" value={criteriaData.minReviewCount} />
            <ConfigItem label="Max Price" value={`$${(criteriaData.maxPriceUSDC / 1e6).toFixed(0)}`} />
          </div>
        </section>
      )}

      {/* Impact preview */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">Impact Preview</h2>
        <p className="text-sm text-zinc-500">
          {currentPreset === "Conservative" &&
            "With Conservative criteria, only well-established agents (4.8+ score, 5+ reviews) will auto-approve. Most deals will require your manual approval."}
          {currentPreset === "Balanced" &&
            "With Balanced criteria, agents with moderate reputation (4.0+ score, 3+ reviews) will auto-approve up to $100. Good balance of autonomy and safety."}
          {currentPreset === "Aggressive" &&
            "With Aggressive criteria, most agents will auto-approve up to $500. Use with caution — only recommended for low-risk experimental tasks."}
        </p>
      </section>
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-sm font-medium text-zinc-200">{String(value)}</p>
    </div>
  );
}
