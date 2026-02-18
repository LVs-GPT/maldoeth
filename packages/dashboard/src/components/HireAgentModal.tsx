"use client";

import { useState } from "react";
import { createDeal } from "@/lib/api";

interface Props {
  agentId: string;
  agentName: string;
  basePrice: number;
  clientAddress: string;
  onSuccess: (nonce: string) => void;
  onClose: () => void;
}

export function HireAgentModal({ agentId, agentName, basePrice, clientAddress, onSuccess, onClose }: Props) {
  const [taskDescription, setTaskDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await createDeal({
        agentId,
        clientAddress,
        priceUSDC: basePrice,
        taskDescription,
      });

      setResult(res);

      if (!res.requiresHumanApproval && res.nonce) {
        setTimeout(() => onSuccess(res.nonce), 1500);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <h2 className="font-serif text-xl font-semibold text-[var(--text-primary)]">
          Hire {agentName}
        </h2>
        <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
          Price: <span className="font-mono text-[var(--text-secondary)]">${(basePrice / 1e6).toFixed(2)}</span> USDC
          <span className="ml-1 text-[var(--text-tertiary)]">&middot; Sepolia testnet</span>
        </p>

        <hr className="section-rule my-5" />

        {result ? (
          <div className="animate-fade-in space-y-4">
            {result.requiresHumanApproval ? (
              <>
                <div className="rounded-lg border border-amber-700/30 bg-amber-500/5 p-4">
                  <p className="text-sm font-medium text-amber-400">Requires approval</p>
                  <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                    Criteria flagged: <span className="text-amber-400/80">{result.failedChecks?.join(", ")}</span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Go to Dashboard to approve or reject this deal.
                  </p>
                </div>
                <button onClick={onClose} className="btn btn-ghost w-full">
                  Understood
                </button>
              </>
            ) : (
              <div className="rounded-lg border border-maldo-700 bg-maldo-500/5 p-4">
                <p className="text-sm font-medium text-maldo-400">Deal created</p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Auto-approved by your criteria. Redirecting&hellip;
                </p>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="smallcaps mb-2 block text-xs text-[var(--text-tertiary)]">
                Task description
              </label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Describe what you need this agent to do..."
                rows={3}
                className="textarea"
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn btn-ghost flex-1">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !taskDescription.trim()}
                className="btn btn-primary flex-1"
              >
                {loading ? "Creating deal\u2026" : "Hire & Pay"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
