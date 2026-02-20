"use client";

import { useState } from "react";
import { createDeal } from "@/lib/api";
import { Spinner } from "./Spinner";
import { useToast } from "./Toast";

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
  const [result, setResult] = useState<{ requiresHumanApproval: boolean; nonce?: string; txHash?: string; failedChecks?: string[] } | null>(null);
  const { toast } = useToast();

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

      if (res.requiresHumanApproval) {
        toast("info", "Deal requires approval. Check your Dashboard.");
      } else {
        toast("success", "Deal created successfully!", res.txHash);
      }

      if (!res.requiresHumanApproval && res.nonce) {
        setTimeout(() => onSuccess(res.nonce), 1500);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create deal";
      setError(message);
      toast("error", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <h2 className="text-base font-bold text-[var(--foreground)]">
          Hire {agentName}
        </h2>
        <p className="mt-1.5 text-[11px] text-[var(--mid)]">
          Price: <span className="text-[var(--foreground)]">${(basePrice / 1e6).toFixed(2)}</span> USDC
          <span className="ml-1 text-[var(--dim)]">&middot; Sepolia testnet</span>
        </p>

        <hr className="section-rule my-5" />

        {result ? (
          <div className="animate-fade-in space-y-4">
            {result.requiresHumanApproval ? (
              <>
                <div className="border border-[rgba(255,204,0,0.3)] bg-[rgba(255,204,0,0.05)] p-4">
                  <p className="text-sm font-bold text-[var(--yellow)]">Requires approval</p>
                  <p className="mt-1.5 text-[11px] text-[var(--mid)]">
                    Criteria flagged: <span className="text-[var(--yellow)]">{result.failedChecks?.join(", ")}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--mid)]">
                    Go to Dashboard to approve or reject this deal.
                  </p>
                </div>
                <button onClick={onClose} className="btn btn-ghost w-full">
                  Understood
                </button>
              </>
            ) : (
              <div className="border border-[var(--green-dim)] bg-[rgba(0,232,122,0.05)] p-4">
                <p className="text-sm font-bold text-[var(--green)]">Deal created</p>
                <p className="mt-1 text-[11px] text-[var(--mid)]">
                  Auto-approved by your criteria. Redirecting&hellip;
                </p>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-[11px] text-[var(--mid)] tracking-[0.1em] uppercase">
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
              <p className="text-[11px] text-[var(--red)]">{error}</p>
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
                {loading ? <><Spinner size={14} className="inline mr-1.5" />Creating deal&hellip;</> : "Hire & Pay \u2192"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
