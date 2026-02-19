import type Database from "better-sqlite3";

export type DealEventType =
  | "deal.created"
  | "deal.funded"
  | "deal.delivered"
  | "deal.completed"
  | "deal.disputed"
  | "deal.resolved"
  | "deal.refunded";

export interface DealEvent {
  type: DealEventType;
  nonce: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Webhook service — notifies agents when deal events occur.
 * Uses the agent's registered endpoint from the agents table,
 * or a custom webhook_registrations entry if set.
 */
export class WebhookService {
  private listeners: Array<(event: DealEvent) => void> = [];

  constructor(private db: Database.Database) {}

  /** Subscribe to all deal events (used by SSE) */
  subscribe(fn: (event: DealEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** Emit event to SSE listeners + fire webhook to agent */
  async emit(event: DealEvent): Promise<void> {
    // Notify SSE subscribers
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch {
        // SSE listener errors are non-fatal
      }
    }

    // Find which agent to notify based on the deal
    const deal = this.db
      .prepare("SELECT server FROM deals WHERE nonce = ?")
      .get(event.nonce) as { server: string } | undefined;
    if (!deal) return;

    // Look up webhook endpoint: first check webhook_registrations, then agent's endpoint
    const webhook = this.db
      .prepare("SELECT endpoint, secret FROM webhook_registrations WHERE agent_id = ?")
      .get(deal.server) as { endpoint: string; secret: string | null } | undefined;

    let endpoint = webhook?.endpoint;
    if (!endpoint) {
      const agent = this.db
        .prepare("SELECT endpoint FROM agents WHERE agent_id = ? OR wallet = ?")
        .get(deal.server, deal.server) as { endpoint: string } | undefined;
      endpoint = agent?.endpoint;
    }

    if (!endpoint) return;

    // Fire-and-forget POST to agent's endpoint
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Maldo-Event": event.type,
          ...(webhook?.secret ? { "X-Maldo-Secret": webhook.secret } : {}),
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      console.log(`[Webhook] ${event.type} → ${endpoint.slice(0, 40)}...`);
    } catch (err: any) {
      console.warn(`[Webhook] Failed to notify ${endpoint.slice(0, 40)}...: ${err.message}`);
    }
  }

  /** Register or update a webhook for an agent */
  registerWebhook(agentId: string, endpoint: string, secret?: string): void {
    this.db
      .prepare(
        `INSERT INTO webhook_registrations (agent_id, endpoint, secret)
         VALUES (?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           endpoint = excluded.endpoint,
           secret = excluded.secret`,
      )
      .run(agentId, endpoint, secret || null);
  }

  /** Remove a webhook registration */
  removeWebhook(agentId: string): void {
    this.db
      .prepare("DELETE FROM webhook_registrations WHERE agent_id = ?")
      .run(agentId);
  }

  /** Get webhook info for an agent */
  getWebhook(agentId: string) {
    return this.db
      .prepare("SELECT * FROM webhook_registrations WHERE agent_id = ?")
      .get(agentId);
  }
}
