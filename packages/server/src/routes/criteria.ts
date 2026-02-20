import { Router, type Request, type Response, type NextFunction } from "express";
import type { CriteriaService } from "../services/criteria.js";
import { ApiError } from "../services/registration.js";
import { requireAuth } from "../middleware/auth.js";
import { writeRateLimit } from "../middleware/rateLimit.js";

export function createCriteriaRouter(criteriaService: CriteriaService): Router {
  const router = Router();

  // GET /api/v1/principals/:address/criteria
  router.get("/:address/criteria", (req: Request, res: Response, next: NextFunction) => {
    try {
      const criteria = criteriaService.getCriteria(req.params.address);
      res.json(criteria);
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/v1/principals/:address/criteria — auth + authorization: only the principal can update their own criteria
  router.put("/:address/criteria", requireAuth, writeRateLimit, (req: Request, res: Response, next: NextFunction) => {
    try {
      // Authorization: only the principal can update their own criteria
      if (req.walletAddress!.toLowerCase() !== req.params.address.toLowerCase()) {
        res.status(403).json({ error: "You can only update your own criteria" });
        return;
      }

      const { preset, minReputation, minReviewCount, maxPriceUSDC, requireHumanApproval } = req.body;

      const criteria = criteriaService.setCriteria(req.params.address, {
        preset,
        minReputation,
        minReviewCount,
        maxPriceUSDC,
        requireHumanApproval,
      });

      res.json(criteria);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/criteria/evaluate
  router.post("/evaluate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { principal, agentId, price } = req.body;
      if (!principal) throw new ApiError(400, "principal is required");
      if (!agentId) throw new ApiError(400, "agentId is required");
      if (!price) throw new ApiError(400, "price is required");

      const result = await criteriaService.evaluateDeal(principal, agentId, price);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
