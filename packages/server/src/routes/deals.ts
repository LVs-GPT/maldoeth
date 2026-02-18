import { Router, type Request, type Response, type NextFunction } from "express";
import type { DealService } from "../services/deals.js";
import { ApiError } from "../services/registration.js";

export function createDealsRouter(dealService: DealService): Router {
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
  router.post("/approve/:id", (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = dealService.approveOrReject(parseInt(req.params.id, 10), "approved");
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/deals/reject/:id
  router.post("/reject/:id", (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = dealService.approveOrReject(parseInt(req.params.id, 10), "rejected");
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
