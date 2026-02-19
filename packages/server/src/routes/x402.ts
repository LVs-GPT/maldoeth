import { Router, type Request, type Response, type NextFunction } from "express";
import type Database from "better-sqlite3";
import { config } from "../config.js";
import { ApiError } from "../services/registration.js";

/**
 * x402 routes — HTTP payment path for web-native agents.
 *
 * GET  /x402/services/:capability  → 402 with payment requirements
 * POST /x402/services/:capability  → process paid request
 * GET  /x402/deals/:nonce/result   → poll for result
 */
export function createX402Router(db: Database.Database): Router {
  const router = Router();

  // GET /x402/services/:capability → Return 402 with x402 payment requirements
  router.get("/services/:capability", (req: Request, res: Response, next: NextFunction) => {
    try {
      const { capability } = req.params;

      // Find cheapest agent with this capability
      const agent = db
        .prepare(
          `SELECT * FROM agents WHERE capabilities LIKE ? ORDER BY base_price ASC LIMIT 1`,
        )
        .get(`%"${capability}"%`) as any;

      if (!agent) {
        throw new ApiError(404, `No agents found with capability: ${capability}`);
      }

      // Return 402 with x402 payment requirements
      const requirements = {
        scheme: "exact",
        network: "eip155:11155111", // Sepolia
        amount: String(agent.base_price),
        asset: config.usdcAddress,
        payTo: config.escrowAddress,
        extra: {
          serviceId: agent.agent_id,
          capability,
          agentName: agent.name,
        },
      };

      res.status(402).json({
        paymentRequired: true,
        requirements,
        agent: {
          name: agent.name,
          capabilities: JSON.parse(agent.capabilities),
          basePrice: agent.base_price,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /x402/services/:capability → Execute after payment
  router.post("/services/:capability", (req: Request, res: Response, next: NextFunction) => {
    try {
      const { capability } = req.params;
      const { taskDescription, clientAddress, nonce } = req.body;

      if (!taskDescription) throw new ApiError(400, "taskDescription is required");
      if (!clientAddress) throw new ApiError(400, "clientAddress is required");

      // Find agent
      const agent = db
        .prepare(
          `SELECT * FROM agents WHERE capabilities LIKE ? ORDER BY base_price ASC LIMIT 1`,
        )
        .get(`%"${capability}"%`) as any;

      if (!agent) {
        throw new ApiError(404, `No agents found with capability: ${capability}`);
      }

      // In production, the x402 facilitator would have already:
      // 1. Verified the payment signature
      // 2. Transferred USDC to the escrow
      // 3. Called escrow.receivePayment()
      //
      // For PoC testing without facilitator, we create a local deal record
      const dealNonce = nonce || `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;

      db.prepare(
        `INSERT INTO deals (nonce, client, server, amount, status, task_description)
         VALUES (?, ?, ?, ?, 'Funded', ?)`,
      ).run(
        dealNonce,
        clientAddress.toLowerCase(),
        agent.agent_id,
        agent.base_price,
        taskDescription,
      );

      res.status(200).json({
        dealNonce,
        agentId: agent.agent_id,
        agentName: agent.name,
        webhookUrl: `/x402/deals/${dealNonce}/result`,
        status: "funded",
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /x402/deals/:nonce/result → Poll for deal result
  router.get("/deals/:nonce/result", (req: Request, res: Response, next: NextFunction) => {
    try {
      const deal = db
        .prepare("SELECT * FROM deals WHERE nonce = ?")
        .get(req.params.nonce) as any;

      if (!deal) throw new ApiError(404, "Deal not found");

      res.json({
        nonce: deal.nonce,
        status: deal.status,
        result: deal.status === "Completed" ? { delivered: true } : null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
