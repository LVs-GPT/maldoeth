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
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <h2 className="text-base font-bold text-[var(--foreground)]">
          Rate {agentName}
        </h2>
        <p className="mt-1.5 text-[11px] text-[var(--mid)]">
          How was your experience with this agent?
        </p>

        <hr className="section-rule my-5" />

        {done ? (
          <div className="border border-[var(--green-dim)] bg-[rgba(0,232,122,0.05)] p-4 animate-fade-in">
            <p className="text-sm font-bold text-[var(--green)]">Rating submitted</p>
            <p className="mt-1 text-[11px] text-[var(--mid)]">Reputation updated.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Star rating */}
            <div>
              <label className="mb-2 block text-[11px] text-[var(--mid)] tracking-[0.1em] uppercase">Rating</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setScore(star)}
                    onMouseEnter={() => setHoverScore(star)}
                    onMouseLeave={() => setHoverScore(0)}
                    className={`text-2xl transition-all duration-100 ${
                      star <= displayScore
                        ? "text-[var(--green)] scale-110"
                        : "text-[var(--dim)] hover:text-[var(--mid)]"
                    }`}
                  >
                    {star <= displayScore ? "\u2605" : "\u2606"}
                  </button>
                ))}
                {displayScore > 0 && (
                  <span className="ml-3 text-[11px] tabular-nums text-[var(--mid)]">
                    {displayScore}/5
                  </span>
                )}
              </div>
            </div>

            {/* Comment */}
            <div>
              <label className="mb-2 block text-[11px] text-[var(--mid)] tracking-[0.1em] uppercase">
                Comment <span className="normal-case text-[var(--dim)]">(optional)</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Describe your experience..."
                rows={2}
                className="textarea"
              />
            </div>

            {error && (
              <p className="text-[11px] text-[var(--red)]">{error}</p>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn btn-ghost flex-1">
                Skip
              </button>
              <button
                type="submit"
                disabled={loading || score === 0}
                className="btn btn-primary flex-1"
              >
                {loading ? "Submitting\u2026" : "Submit Rating"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
