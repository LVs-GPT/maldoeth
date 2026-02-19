import { Router, type Request, type Response, type NextFunction } from "express";
import type { VouchService } from "../services/vouch.js";
import { ApiError } from "../services/registration.js";

export function createVouchRouter(vouchService: VouchService): Router {
  const router = Router();

  // POST /api/v1/agents/:agentId/vouch — submit a vouch for this agent
  router.post("/:agentId/vouch", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { voucherAgentId, voucherWallet, signature } = req.body;

      if (!voucherAgentId) throw new ApiError(400, "voucherAgentId is required");
      if (!voucherWallet) throw new ApiError(400, "voucherWallet is required");
      if (!signature) throw new ApiError(400, "signature is required");

      const result = await vouchService.submitVouch({
        voucherAgentId,
        voucheeAgentId: req.params.agentId,
        voucherWallet,
        signature,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/v1/agents/:voucheeId/vouch/:voucherId — withdraw vouch
  router.delete("/:voucheeId/vouch/:voucherId", (req: Request, res: Response, next: NextFunction) => {
    try {
      vouchService.withdrawVouch(req.params.voucherId, req.params.voucheeId);
      res.json({ status: "withdrawn" });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/agents/:agentId/vouches — list active vouches for this agent
  router.get("/:agentId/vouches", (req: Request, res: Response, next: NextFunction) => {
    try {
      const vouches = vouchService.getVouchesFor(req.params.agentId);
      const bonus = vouchService.getVouchBonus(req.params.agentId);
      res.json({ vouches, totalBonus: Math.round(bonus * 100) / 100 });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
