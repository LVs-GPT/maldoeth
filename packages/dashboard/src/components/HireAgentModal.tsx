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
        // Auto-approved — deal created
        setTimeout(() => onSuccess(res.nonce), 1500);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-zinc-100">Hire {agentName}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Price: ${(basePrice / 1e6).toFixed(2)} USDC (Sepolia testnet)
        </p>

        {result ? (
          <div className="mt-6 space-y-3">
            {result.requiresHumanApproval ? (
              <>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4">
                  <p className="text-sm font-medium text-amber-300">Requires approval</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Your criteria flagged: {result.failedChecks?.join(", ")}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Go to Dashboard to approve or reject this deal.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-full rounded-lg bg-zinc-800 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  Got it
                </button>
              </>
            ) : (
              <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4">
                <p className="text-sm font-medium text-green-300">Deal created!</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Auto-approved by your criteria. Redirecting to dashboard...
                </p>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Task description</label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Describe what you need this agent to do..."
                rows={3}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-maldo-500 focus:outline-none"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !taskDescription.trim()}
                className="flex-1 rounded-lg bg-maldo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-maldo-500 disabled:opacity-50"
              >
                {loading ? "Creating deal..." : "Hire & Pay"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
