import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import type Database from "better-sqlite3";

import { RegistrationService, ApiError } from "./services/registration.js";
import { DiscoveryService } from "./services/discovery.js";
import { CriteriaService } from "./services/criteria.js";
import { DealService } from "./services/deals.js";
import { RatingService } from "./services/rating.js";
import { VouchService } from "./services/vouch.js";
import { WebhookService } from "./services/webhook.js";
import { DbReputationAdapter } from "./services/db-reputation-adapter.js";
import { ChainReputationAdapter } from "./services/chain-reputation-adapter.js";
import { HybridReputationAdapter } from "./services/hybrid-reputation-adapter.js";
import { config } from "./config.js";

import { createServicesRouter } from "./routes/services.js";
import { createCriteriaRouter } from "./routes/criteria.js";
import { createDealsRouter } from "./routes/deals.js";
import { createAgentsRouter } from "./routes/agents.js";
import { createX402Router } from "./routes/x402.js";
import { createVouchRouter } from "./routes/vouches.js";

export interface AppDeps {
  db: Database.Database;
}

export function createApp(deps: AppDeps) {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(","),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }));
  app.use(express.json());
  app.use(morgan("short"));

  // Services — hybrid adapter: tries on-chain first, falls back to DB for agents
  // not registered on-chain (e.g. demo/seed agents)
  const dbRep = new DbReputationAdapter(deps.db);
  const hasRpc = config.sepoliaRpcUrl && config.sepoliaRpcUrl !== "https://sepolia.infura.io/v3/demo";
  const repAdapter = hasRpc ? new HybridReputationAdapter(new ChainReputationAdapter(), dbRep) : dbRep;
  const registration = new RegistrationService(deps.db);
  const discovery = new DiscoveryService(deps.db, repAdapter);
  const criteriaService = new CriteriaService(deps.db, repAdapter);
  const dealService = new DealService(deps.db, criteriaService);
  const ratingService = new RatingService(deps.db);
  const vouchService = new VouchService(deps.db);
  const webhookService = new WebhookService(deps.db);

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", network: "sepolia", timestamp: new Date().toISOString() });
  });

  // Routes
  app.use("/api/v1/services", createServicesRouter(registration, discovery));
  app.use("/api/v1/principals", createCriteriaRouter(criteriaService));
  app.use("/api/v1/criteria", createCriteriaRouter(criteriaService));
  app.use("/api/v1/deals", createDealsRouter(dealService, webhookService));
  app.use("/api/v1/agents", createAgentsRouter(registration, ratingService));
  app.use("/api/v1/agents", createVouchRouter(vouchService));
  app.use("/x402", createX402Router(deps.db));

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return; // Response already sent (e.g. proxy timeout)
    if (err instanceof ApiError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error("Unhandled error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  });

  return { app, registration, discovery, criteriaService, dealService, ratingService, vouchService, webhookService };
}
