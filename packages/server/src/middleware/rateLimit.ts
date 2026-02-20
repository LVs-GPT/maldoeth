import type { Request, Response, NextFunction } from "express";

/**
 * Simple in-memory rate limiter. No external dependency needed.
 * Limits requests per IP address using a sliding window.
 *
 * For production, replace with Redis-backed rate limiting.
 */
interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (entry.resetAt < now) windows.delete(key);
  }
}, 5 * 60 * 1000).unref();

export function rateLimit(opts: { windowMs?: number; max?: number } = {}) {
  const windowMs = opts.windowMs ?? 60_000; // 1 minute
  const max = opts.max ?? 60; // 60 requests per minute

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let entry = windows.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      windows.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }

    next();
  };
}

/** Stricter rate limit for write/financial endpoints */
export const writeRateLimit = rateLimit({ windowMs: 60_000, max: 20 });

/** General rate limit for read endpoints */
export const readRateLimit = rateLimit({ windowMs: 60_000, max: 120 });
