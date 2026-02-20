import { Router, type Request, type Response, type NextFunction } from "express";
import type { RegistrationService } from "../services/registration.js";
import type { DiscoveryService } from "../services/discovery.js";
import { ApiError } from "../services/registration.js";
import { requireAuth } from "../middleware/auth.js";
import { writeRateLimit } from "../middleware/rateLimit.js";

export function createServicesRouter(
  registration: RegistrationService,
  discovery: DiscoveryService,
): Router {
  const router = Router();

  // POST /api/v1/services/register — auth required; uses authenticated wallet (not body-supplied)
  router.post("/register", requireAuth, writeRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, capabilities, basePrice, endpoint } = req.body;

      if (!name) throw new ApiError(400, "name is required");
      if (!capabilities || !Array.isArray(capabilities) || capabilities.length === 0) {
        throw new ApiError(400, "capabilities must be a non-empty array");
      }

      // Use authenticated wallet — prevents registering agents under another user's address
      const result = await registration.registerAgent({
        name,
        description: description || "",
        capabilities,
        basePrice: basePrice || 0,
        endpoint: endpoint || "",
        wallet: req.walletAddress!,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/services/discover
  router.get("/discover", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const capability = req.query.capability as string | undefined;
      const minRep = req.query.minRep ? parseFloat(req.query.minRep as string) : undefined;

      const agents = await discovery.discover({
        capability,
        minReputation: minRep,
      });

      res.json({ agents, count: agents.length });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/services/:agentId
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
