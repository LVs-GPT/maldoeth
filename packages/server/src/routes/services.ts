import { Router, type Request, type Response, type NextFunction } from "express";
import type { RegistrationService } from "../services/registration.js";
import type { DiscoveryService } from "../services/discovery.js";
import { ApiError } from "../services/registration.js";

export function createServicesRouter(
  registration: RegistrationService,
  discovery: DiscoveryService,
): Router {
  const router = Router();

  // POST /api/v1/services/register
  router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, capabilities, basePrice, endpoint, wallet } = req.body;

      if (!name) throw new ApiError(400, "name is required");
      if (!capabilities || !Array.isArray(capabilities) || capabilities.length === 0) {
        throw new ApiError(400, "capabilities must be a non-empty array");
      }
      if (!wallet) throw new ApiError(400, "wallet is required");

      const result = await registration.registerAgent({
        name,
        description: description || "",
        capabilities,
        basePrice: basePrice || 0,
        endpoint: endpoint || "",
        wallet,
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

      res.json({ agents });
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
