import { Router, type Request, type Response, type NextFunction } from "express";
import type { RegistrationService } from "../services/registration.js";
import { ApiError } from "../services/registration.js";

export function createAgentsRouter(registration: RegistrationService): Router {
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

  return router;
}
