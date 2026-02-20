import { Router, type Request, type Response, type NextFunction } from "express";
import type { DealService } from "../services/deals.js";
import type { WebhookService } from "../services/webhook.js";
import { ApiError } from "../services/registration.js";
import { requireAuth } from "../middleware/auth.js";
import { writeRateLimit } from "../middleware/rateLimit.js";

// Max concurrent SSE connections to prevent DoS (B-NEW-2 / BE-15)
const MAX_SSE_CONNECTIONS = 100;
let activeSseConnections = 0;

export function createDealsRouter(dealService: DealService, webhookService?: WebhookService): Router {
  const router = Router();

  // POST /api/v1/deals/create — creates deal on-chain (USDC transfer + escrow)
  router.post("/create", requireAuth, writeRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { agentId, clientAddress, priceUSDC, taskDescription, principal } = req.body;
      if (!agentId) throw new ApiError(400, "agentId is required");
      if (!clientAddress) throw new ApiError(400, "clientAddress is required");
      if (!priceUSDC) throw new ApiError(400, "priceUSDC is required");

      const result = await dealService.createDeal({
        agentId,
        clientAddress,
        priceUSDC,
        taskDescription: taskDescription || "",
        principal,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/deals/:nonce/status
  router.get("/:nonce/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await dealService.getDealStatus(req.params.nonce);
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/deals — list all deals
  router.get("/", (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = req.query.client as string | undefined;
      const deals = dealService.listDeals(client);
      res.json({ deals });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/deals/pending — list pending approvals
  router.get("/pending/:principal", (req: Request, res: Response, next: NextFunction) => {
    try {
      const approvals = dealService.getPendingApprovals(req.params.principal);
      res.json({ approvals });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/:nonce/complete — completes deal on-chain (releases USDC to server)
  // Authorization: only the deal's client can complete it
  router.post("/:nonce/complete", requireAuth, writeRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dealService.completeDeal(req.params.nonce, req.walletAddress!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/:nonce/dispute — disputes deal on-chain (freezes USDC, pays arbitration fee)
  // Authorization: only the deal's client can dispute it
  router.post("/:nonce/dispute", requireAuth, writeRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dealService.disputeDeal(req.params.nonce, req.walletAddress!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/:nonce/resolve — resolves dispute via MockKleros
  // Body: { ruling: 0 | 1 | 2 } → 0=split, 1=buyer wins, 2=seller wins
  router.post("/:nonce/resolve", requireAuth, writeRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ruling } = req.body;
      if (ruling === undefined || ruling === null) throw new ApiError(400, "ruling is required (0=split, 1=buyer-wins, 2=seller-wins)");
      const result = await dealService.resolveDispute(req.params.nonce, Number(ruling));
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/approve/:id — authorization: only the principal can approve their own pending deals
  router.post("/approve/:id", requireAuth, writeRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dealService.approveOrReject(parseInt(req.params.id, 10), "approved", req.walletAddress!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/reject/:id — authorization: only the principal can reject their own pending deals
  router.post("/reject/:id", requireAuth, writeRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dealService.approveOrReject(parseInt(req.params.id, 10), "rejected", req.walletAddress!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/:nonce/deliver — agent submits work result
  // B-7: Use authenticated wallet instead of body-supplied agentWallet to prevent spoofing
  router.post("/:nonce/deliver", requireAuth, writeRateLimit, (req: Request, res: Response, next: NextFunction) => {
    try {
      const { result } = req.body;
      if (!result) throw new ApiError(400, "result is required (the work output)");

      // Use authenticated wallet (from header) — prevents delivery auth bypass
      const delivery = dealService.deliverResult(req.params.nonce, result, req.walletAddress);

      // Notify via webhook
      webhookService?.emit({
        type: "deal.delivered",
        nonce: req.params.nonce,
        timestamp: new Date().toISOString(),
        data: { result: result.slice(0, 200) },
      });

      res.json(delivery);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/deals/:nonce/delivery — check delivery status
  router.get("/:nonce/delivery", (req: Request, res: Response, next: NextFunction) => {
    try {
      const delivery = dealService.getDelivery(req.params.nonce);
      res.json(delivery);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/deals/events — SSE stream for real-time deal updates
  router.get("/events", (req: Request, res: Response) => {
    if (!webhookService) {
      res.status(503).json({ error: "Event streaming not available" });
      return;
    }

    // Limit concurrent SSE connections to prevent DoS
    if (activeSseConnections >= MAX_SSE_CONNECTIONS) {
      res.status(503).json({ error: "Too many active connections" });
      return;
    }
    activeSseConnections++;

    const wallet = (req.query.wallet as string || "").toLowerCase();

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("event: connected\ndata: {\"status\":\"connected\"}\n\n");

    // Keep-alive ping every 30s
    const keepAlive = setInterval(() => {
      res.write(": ping\n\n");
    }, 30_000);

    const unsubscribe = webhookService.subscribe((event) => {
      // If wallet filter is set, only send events for that wallet's deals
      if (wallet && event.data) {
        const client = ((event.data.client as string) || "").toLowerCase();
        const server = ((event.data.server as string) || "").toLowerCase();
        if (client !== wallet && server !== wallet) return;
      }
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
      activeSseConnections--;
    });
  });

  // POST /api/v1/deals/webhooks — register a webhook for an agent
  // Authorization: only the agent's owner can register webhooks for it
  router.post("/webhooks", requireAuth, writeRateLimit, (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!webhookService) throw new ApiError(503, "Webhook service not available");
      const { agentId, endpoint, secret } = req.body;
      if (!agentId) throw new ApiError(400, "agentId is required");
      if (!endpoint) throw new ApiError(400, "endpoint URL is required");

      // Verify caller owns the agent
      const agent = dealService.getAgentWallet(agentId);
      if (agent && agent.toLowerCase() !== req.walletAddress!.toLowerCase()) {
        throw new ApiError(403, "You can only register webhooks for your own agents");
      }

      webhookService.registerWebhook(agentId, endpoint, secret);
      res.json({ agentId, endpoint, status: "registered" });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/v1/deals/webhooks/:agentId — remove webhook
  // Authorization: only the agent's owner can remove webhooks
  router.delete("/webhooks/:agentId", requireAuth, (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!webhookService) throw new ApiError(503, "Webhook service not available");

      // Verify caller owns the agent
      const agent = dealService.getAgentWallet(req.params.agentId);
      if (agent && agent.toLowerCase() !== req.walletAddress!.toLowerCase()) {
        throw new ApiError(403, "You can only remove webhooks for your own agents");
      }

      webhookService.removeWebhook(req.params.agentId);
      res.json({ status: "removed" });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
