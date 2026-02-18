"use client";

import { useState } from "react";
import { rateAgent } from "@/lib/api";

interface Props {
  agentId: string;
  agentName: string;
  dealNonce: string;
  raterAddress: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function RateAgentModal({ agentId, agentName, dealNonce, raterAddress, onSuccess, onClose }: Props) {
  const [score, setScore] = useState(0);
  const [hoverScore, setHoverScore] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (score === 0) return;
    setLoading(true);
    setError(null);

    try {
      await rateAgent(agentId, {
        dealNonce,
        raterAddress,
        score,
        comment: comment.trim() || undefined,
      });
      setDone(true);
      setTimeout(onSuccess, 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const displayScore = hoverScore || score;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-zinc-100">Rate {agentName}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          How was your experience with this agent?
        </p>

        {done ? (
          <div className="mt-6 rounded-lg bg-green-500/10 border border-green-500/30 p-4">
            <p className="text-sm font-medium text-green-300">Rating submitted!</p>
            <p className="mt-1 text-xs text-zinc-400">Reputation updated.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Star rating */}
            <div>
              <label className="mb-2 block text-sm text-zinc-400">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setScore(star)}
                    onMouseEnter={() => setHoverScore(star)}
                    onMouseLeave={() => setHoverScore(0)}
                    className={`text-3xl transition-colors ${
                      star <= displayScore ? "text-yellow-400" : "text-zinc-700"
                    } hover:scale-110`}
                  >
                    {star <= displayScore ? "\u2605" : "\u2606"}
                  </button>
                ))}
                {displayScore > 0 && (
                  <span className="ml-2 self-center text-sm text-zinc-400">
                    {displayScore}/5
                  </span>
                )}
              </div>
            </div>

            {/* Comment */}
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Comment (optional)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Describe your experience..."
                rows={2}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-maldo-500 focus:outline-none"
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
                Skip
              </button>
              <button
                type="submit"
                disabled={loading || score === 0}
                className="flex-1 rounded-lg bg-maldo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-maldo-500 disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Submit Rating"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
