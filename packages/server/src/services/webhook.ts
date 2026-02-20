import { createHmac } from "node:crypto";
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
 * Blocked URL patterns for SSRF prevention (B-3).
 * Blocks: localhost, private IPs (dotted, decimal, octal, hex),
 * link-local, metadata endpoints, 0.0.0.0, and IPv6 private ranges.
 */
const SSRF_BLOCKED_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/0\./,
  /^https?:\/\/0+\./,                    // Octal: 0177.0.0.1
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/169\.254\./,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/\[fd/i,                   // IPv6 ULA
  /^https?:\/\/\[fe80:/i,               // IPv6 link-local
  /^https?:\/\/\[fc/i,                   // IPv6 ULA
  /^https?:\/\/\[::ffff:7f/i,           // IPv4-mapped loopback
  /^https?:\/\/\[::ffff:a\./i,          // IPv4-mapped 10.x
  /^https?:\/\/\[::ffff:c0a8/i,         // IPv4-mapped 192.168
  /^https?:\/\/metadata\./i,
  /^https?:\/\/0x[0-9a-f]/i,            // Hex IP: 0x7f000001
  /^https?:\/\/\d{8,}/,                 // Decimal IP: 2130706433 = 127.0.0.1
];

/** Additional hostname checks that regex can't cover */
function isBlockedHostname(hostname: string): boolean {
  // Block 0.0.0.0
  if (hostname === "0.0.0.0") return true;
  // Block any hostname that is a pure decimal number (decimal IP encoding)
  if (/^\d+$/.test(hostname)) return true;
  // Block hex-encoded IPs
  if (/^0x[0-9a-f]+$/i.test(hostname)) return true;
  // Block octal-encoded IPs (starts with 0 and all digits)
  if (/^0\d+$/.test(hostname)) return true;
  return false;
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (isBlockedHostname(parsed.hostname)) return false;
    for (const pattern of SSRF_BLOCKED_PATTERNS) {
      if (pattern.test(url)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Compute HMAC-SHA256 signature for webhook payload (B-4) */
function computeSignature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
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

    // SSRF prevention: validate URL before making request
    if (!isSafeUrl(endpoint)) {
      console.warn(`[Webhook] Blocked SSRF attempt to ${endpoint.slice(0, 40)}...`);
      return;
    }

    // Fire-and-forget POST to agent's endpoint
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const body = JSON.stringify(event);

      // Use HMAC signature instead of plaintext secret (B-4)
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Maldo-Event": event.type,
      };
      if (webhook?.secret) {
        headers["X-Maldo-Signature"] = `sha256=${computeSignature(body, webhook.secret)}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
        redirect: "error", // Prevent redirect-based SSRF bypass
      });
      // Ensure response is consumed to avoid memory leaks
      void response;

      clearTimeout(timeout);
      console.log(`[Webhook] ${event.type} → ${endpoint.slice(0, 40)}...`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.warn(`[Webhook] Failed to notify ${endpoint.slice(0, 40)}...: ${message}`);
    }
  }

  /** Register or update a webhook for an agent */
  registerWebhook(agentId: string, endpoint: string, secret?: string): void {
    // Validate endpoint URL before storing
    if (!isSafeUrl(endpoint)) {
      throw new Error("Invalid webhook URL: must be a public HTTP(S) endpoint");
    }

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
