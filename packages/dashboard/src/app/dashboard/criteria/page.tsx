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
    maxPriceUSDC: 100_000,
  },
  {
    name: "Balanced",
    description: "Moderate trust bar. Good balance of autonomy and safety. Recommended for most use cases.",
    minReputation: 400,
    minReviewCount: 3,
    maxPriceUSDC: 1_000_000,
  },
  {
    name: "Aggressive",
    description: "Low trust bar. Maximum autonomy. Only use for low-risk or experimental operations.",
    minReputation: 300,
    minReviewCount: 1,
    maxPriceUSDC: 10_000_000,
  },
];

const IMPACT_TEXT: Record<string, string> = {
  Conservative:
    "With Conservative criteria, only well-established agents (4.8+ score, 5+ reviews) will auto-approve up to $0.10. Most deals will require your manual approval.",
  Balanced:
    "With Balanced criteria, agents with moderate reputation (4.0+ score, 3+ reviews) will auto-approve up to $1. Good balance of autonomy and safety.",
  Aggressive:
    "With Aggressive criteria, most agents will auto-approve up to $10. Use with caution \u2014 only recommended for low-risk experimental tasks.",
};

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
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="font-serif text-base text-[var(--text-tertiary)]">
          Connect your wallet to manage criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <header>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
          Agentic Criteria
        </h1>
        <p className="dropcap mt-3 text-sm leading-relaxed text-[var(--text-tertiary)]">
          Configure trust boundaries for your autonomous agents. Deals that fail these
          criteria require your manual approval.
        </p>
      </header>

      {/* Preset selector */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PRESETS.map((preset) => {
          const isActive = currentPreset === preset.name;
          return (
            <button
              key={preset.name}
              onClick={() => handleSave(preset.name)}
              disabled={saving}
              className={`card p-5 text-left transition-all disabled:opacity-50 ${
                isActive
                  ? "!border-maldo-700 !bg-maldo-500/5"
                  : "hover:!border-[#2a2a2a]"
              }`}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <span
                  className={`status-dot ${
                    isActive ? "bg-maldo-400 status-dot-live" : "bg-[var(--text-tertiary)]"
                  }`}
                />
                <h3
                  className={`font-serif text-base font-semibold ${
                    isActive ? "text-maldo-400" : "text-[var(--text-primary)]"
                  }`}
                >
                  {preset.name}
                </h3>
              </div>

              <p className="mb-4 text-xs leading-relaxed text-[var(--text-tertiary)]">
                {preset.description}
              </p>

              <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-3">
                <CriteriaRow label="Min reputation" value={(preset.minReputation / 100).toFixed(1)} />
                <CriteriaRow label="Min reviews" value={String(preset.minReviewCount)} />
                <CriteriaRow label="Max price" value={`$${(preset.maxPriceUSDC / 1e6).toFixed(2)}`} />
              </div>
            </button>
          );
        })}
      </div>

      {saved && (
        <p className="animate-fade-in text-sm text-maldo-400">Criteria updated successfully.</p>
      )}

      <hr className="section-rule" />

      {/* Current config */}
      {criteriaData && (
        <section>
          <h2 className="section-header mb-5 text-base text-[var(--text-secondary)]">
            Current Configuration
          </h2>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
            <ConfigCell label="Preset" value={criteriaData.preset} />
            <ConfigCell label="Min Reputation" value={(criteriaData.minReputation / 100).toFixed(1)} />
            <ConfigCell label="Min Reviews" value={criteriaData.minReviewCount} />
            <ConfigCell label="Max Price" value={`$${(criteriaData.maxPriceUSDC / 1e6).toFixed(2)}`} />
          </div>
        </section>
      )}

      {/* Impact preview */}
      <section className="card p-6">
        <h2 className="section-header mb-4 text-base text-[var(--text-secondary)]">
          Impact Preview
        </h2>
        <p className="text-sm leading-relaxed text-[var(--text-tertiary)]">
          {IMPACT_TEXT[currentPreset]}
        </p>
      </section>
    </div>
  );
}

function CriteriaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-2xs text-[var(--text-tertiary)]">{label}</span>
      <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">{value}</span>
    </div>
  );
}

function ConfigCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--surface)] px-5 py-4">
      <p className="smallcaps text-2xs text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 font-mono text-sm font-medium tabular-nums text-[var(--text-primary)]">
        {String(value)}
      </p>
    </div>
  );
}
