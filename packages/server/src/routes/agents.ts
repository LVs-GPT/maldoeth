import { Router, type Request, type Response, type NextFunction } from "express";
import type { RegistrationService } from "../services/registration.js";
import type { RatingService } from "../services/rating.js";
import { ApiError } from "../services/registration.js";

export function createAgentsRouter(registration: RegistrationService, ratingService?: RatingService): Router {
  const router = Router();

  // GET /api/v1/agents — list all agents
  router.get("/", (_req: Request, res: Response, next: NextFunction) => {
    try {
      const agents = registration.listAgents();
      res.json({ agents });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/agents/:agentId
  router.get("/:agentId", (req: Request, res: Response, next: NextFunction) => {
    try {
      const agent = registration.getAgent(req.params.agentId);
      if (!agent) throw new ApiError(404, "Agent not found");
      res.json(agent);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/agents/:agentId/reputation
  router.get("/:agentId/reputation", (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!ratingService) throw new ApiError(500, "Rating service not available");
      const reputation = ratingService.getAgentReputation(req.params.agentId);
      res.json(reputation);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/agents/:agentId/rate
  router.post("/:agentId/rate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!ratingService) throw new ApiError(500, "Rating service not available");
      const { dealNonce, raterAddress, score, comment } = req.body;

      if (!dealNonce) throw new ApiError(400, "dealNonce is required");
      if (!raterAddress) throw new ApiError(400, "raterAddress is required");
      if (score === undefined) throw new ApiError(400, "score is required");

      const result = await ratingService.submitRating({
        dealNonce,
        raterAddress,
        rateeAgentId: req.params.agentId,
        score,
        comment,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/agents/:agentId/ratings
  router.get("/:agentId/ratings", (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!ratingService) throw new ApiError(500, "Rating service not available");
      const ratings = ratingService.getAgentRatings(req.params.agentId);
      res.json({ ratings });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
