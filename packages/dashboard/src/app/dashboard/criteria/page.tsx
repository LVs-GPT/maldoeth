"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { getCriteria, setCriteria } from "@/lib/api";

const PRESETS = [
  {
    name: "Conservative",
    color: "var(--blue)",
    description: "High trust bar. Only established agents auto-approve.",
    minReputation: 480,
    minReviewCount: 5,
    maxPriceUSDC: 100_000,
  },
  {
    name: "Balanced",
    color: "var(--green)",
    description: "Moderate trust bar. Recommended for most use cases.",
    minReputation: 400,
    minReviewCount: 3,
    maxPriceUSDC: 1_000_000,
  },
  {
    name: "Aggressive",
    color: "var(--yellow)",
    description: "Low trust bar. Maximum autonomy. Only for low-risk ops.",
    minReputation: 300,
    minReviewCount: 1,
    maxPriceUSDC: 10_000_000,
  },
  {
    name: "Demo",
    color: "var(--red)",
    description: "No restrictions. All deals auto-approve. For demos only.",
    minReputation: 0,
    minReviewCount: 0,
    maxPriceUSDC: 100_000_000,
  },
];

const IMPACT_TEXT: Record<string, string> = {
  Conservative:
    "With Conservative criteria, only well-established agents (4.8+ score, 5+ reviews) will auto-approve up to $0.10. Most deals will require your manual approval.",
  Balanced:
    "With Balanced criteria, agents with moderate reputation (4.0+ score, 3+ reviews) will auto-approve up to $1. Good balance of autonomy and safety.",
  Aggressive:
    "With Aggressive criteria, most agents will auto-approve up to $10. Use with caution \u2014 only recommended for low-risk experimental tasks.",
  Demo:
    "Demo mode: all criteria checks are disabled. Every deal auto-approves regardless of agent reputation, reviews, or price. Use only for demonstrations.",
};

export default function CriteriaPage() {
  const { address, isConnected } = useWallet();
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
        <p className="text-sm text-[var(--mid)]">
          Sign in to manage criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pt-14 sm:space-y-10 sm:pt-16">
      {/* Header */}
      <header>
        <div className="section-label">Agentic Criteria</div>
        <p className="mt-2 text-[13px] text-[var(--mid)] leading-[1.7] max-w-[580px]">
          Configure trust boundaries for your autonomous agents. Deals that fail these
          criteria require your manual approval.
        </p>
      </header>

      {/* Preset cards — landing-style 1px-gap grid */}
      <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((preset) => {
          const isActive = currentPreset === preset.name;
          return (
            <button
              key={preset.name}
              onClick={() => handleSave(preset.name)}
              disabled={saving}
              className={`bg-[var(--bg)] p-6 text-left transition-all disabled:opacity-50 hover:bg-[var(--bg2)] ${
                isActive ? "!border-l-2 !border-l-[var(--green)]" : ""
              }`}
            >
              <div className="mb-3 flex items-center gap-2">
                {isActive && (
                  <span className="status-dot bg-[var(--green)]" style={{ boxShadow: '0 0 6px var(--green)' }} />
                )}
                <h3
                  className="text-[13px] font-bold"
                  style={{ color: isActive ? preset.color : 'var(--foreground)' }}
                >
                  {preset.name}
                </h3>
              </div>

              <p className="mb-4 text-[11px] text-[var(--mid)] leading-[1.7]">
                {preset.description}
              </p>

              <div className="space-y-1 border-t border-[var(--border)] pt-3">
                <CriteriaRow label="Min reputation" value={(preset.minReputation / 100).toFixed(1) + " \u2605"} />
                <CriteriaRow label="Min reviews" value={String(preset.minReviewCount)} />
                <CriteriaRow label="Max price" value={`$${(preset.maxPriceUSDC / 1e6).toFixed(2)}`} />
              </div>
            </button>
          );
        })}
      </div>

      {saved && (
        <p className="animate-fade-in text-xs text-[var(--green)]">Criteria updated successfully.</p>
      )}

      <hr className="section-rule" />

      {/* Current config */}
      {criteriaData && (
        <section>
          <div className="section-label">Current Configuration</div>
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
            <ConfigCell label="Preset" value={criteriaData.preset} />
            <ConfigCell label="Min Reputation" value={(criteriaData.minReputation / 100).toFixed(1)} />
            <ConfigCell label="Min Reviews" value={criteriaData.minReviewCount} />
            <ConfigCell label="Max Price" value={`$${(criteriaData.maxPriceUSDC / 1e6).toFixed(2)}`} />
          </div>
        </section>
      )}

      {/* Impact preview */}
      <section className="bg-[var(--surface)] border border-[var(--border)] p-7">
        <div className="section-label">Impact Preview</div>
        <p className="text-[13px] text-[var(--mid)] leading-[1.7]">
          {IMPACT_TEXT[currentPreset]}
        </p>
      </section>
    </div>
  );
}

function CriteriaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-[var(--border)] last:border-b-0">
      <span className="text-[11px] text-[var(--mid)]">{label}</span>
      <span className="text-[11px] tabular-nums text-[var(--foreground)]">{value}</span>
    </div>
  );
}

function ConfigCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--bg)] p-7">
      <p className="text-[11px] text-[var(--mid)] tracking-[0.05em]">{label}</p>
      <p className="mt-2 text-sm font-bold tabular-nums text-[var(--foreground)]">
        {String(value)}
      </p>
    </div>
  );
}
