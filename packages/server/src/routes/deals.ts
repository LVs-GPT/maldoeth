import { Router, type Request, type Response, type NextFunction } from "express";
import type { DealService } from "../services/deals.js";
import type { WebhookService } from "../services/webhook.js";
import { ApiError } from "../services/registration.js";

export function createDealsRouter(dealService: DealService, webhookService?: WebhookService): Router {
  const router = Router();

  // POST /api/v1/deals/create — creates deal on-chain (USDC transfer + escrow)
  router.post("/create", async (req: Request, res: Response, next: NextFunction) => {
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
  router.post("/:nonce/complete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dealService.completeDeal(req.params.nonce);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/:nonce/dispute — disputes deal on-chain (freezes USDC, pays arbitration fee)
  router.post("/:nonce/dispute", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dealService.disputeDeal(req.params.nonce);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/:nonce/resolve — resolves dispute via MockKleros
  // Body: { ruling: 0 | 1 | 2 } → 0=split, 1=buyer wins, 2=seller wins
  router.post("/:nonce/resolve", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ruling } = req.body;
      if (ruling === undefined || ruling === null) throw new ApiError(400, "ruling is required (0=split, 1=buyer-wins, 2=seller-wins)");
      const result = await dealService.resolveDispute(req.params.nonce, Number(ruling));
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/approve/:id
  router.post("/approve/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dealService.approveOrReject(parseInt(req.params.id, 10), "approved");
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/reject/:id
  router.post("/reject/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dealService.approveOrReject(parseInt(req.params.id, 10), "rejected");
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/:nonce/deliver — agent submits work result
  router.post("/:nonce/deliver", (req: Request, res: Response, next: NextFunction) => {
    try {
      const { result, agentWallet } = req.body;
      if (!result) throw new ApiError(400, "result is required (the work output)");

      const delivery = dealService.deliverResult(req.params.nonce, result, agentWallet);

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
    });
  });

  // POST /api/v1/deals/webhooks — register a webhook for an agent
  router.post("/webhooks", (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!webhookService) throw new ApiError(503, "Webhook service not available");
      const { agentId, endpoint, secret } = req.body;
      if (!agentId) throw new ApiError(400, "agentId is required");
      if (!endpoint) throw new ApiError(400, "endpoint URL is required");

      webhookService.registerWebhook(agentId, endpoint, secret);
      res.json({ agentId, endpoint, status: "registered" });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/v1/deals/webhooks/:agentId — remove webhook
  router.delete("/webhooks/:agentId", (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!webhookService) throw new ApiError(503, "Webhook service not available");
      webhookService.removeWebhook(req.params.agentId);
      res.json({ status: "removed" });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
