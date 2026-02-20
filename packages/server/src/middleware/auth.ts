import type { Request, Response, NextFunction } from "express";

/**
 * Auth middleware for Maldo PoC.
 *
 * Extracts the caller's wallet address from:
 *   1. Authorization: Bearer <wallet-address>
 *   2. X-Wallet-Address header
 *
 * For production, replace with Privy JWT verification or EIP-712 signature validation.
 * This middleware blocks anonymous state-changing requests on the PoC.
 */

declare global {
  namespace Express {
    interface Request {
      walletAddress?: string;
    }
  }
}

/** Extract wallet address from headers (runs on every request) */
export function extractWallet(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    req.walletAddress = authHeader.slice(7).toLowerCase();
  } else if (req.headers["x-wallet-address"]) {
    req.walletAddress = (req.headers["x-wallet-address"] as string).toLowerCase();
  }
  next();
}

/** Require a wallet address on the request (for state-changing endpoints) */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.walletAddress) {
    res.status(401).json({
      error: "Authentication required. Provide Authorization: Bearer <wallet> or X-Wallet-Address header.",
    });
    return;
  }
  next();
}
