import Database from "better-sqlite3";
import { config } from "../config.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Create an in-memory DB for testing */
export function createTestDb(): Database.Database {
  const testDb = new Database(":memory:");
  testDb.pragma("foreign_keys = ON");
  runMigrations(testDb);
  return testDb;
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    -- Registered service agents
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL UNIQUE,         -- ERC-8004 token ID
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      capabilities TEXT NOT NULL DEFAULT '[]', -- JSON array
      base_price INTEGER NOT NULL DEFAULT 0,   -- USDC atomic units
      endpoint TEXT NOT NULL DEFAULT '',
      wallet TEXT NOT NULL,
      tx_hash TEXT,
      ipfs_uri TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Criteria configurations per principal
    CREATE TABLE IF NOT EXISTS criteria_config (
      principal TEXT PRIMARY KEY,
      preset TEXT NOT NULL DEFAULT 'Conservative',
      min_reputation INTEGER NOT NULL DEFAULT 480,
      min_review_count INTEGER NOT NULL DEFAULT 5,
      max_price_usdc INTEGER NOT NULL DEFAULT 50000000,
      require_human_approval INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Deals tracked off-chain (chain is source of truth, this is cache)
    CREATE TABLE IF NOT EXISTS deals (
      nonce TEXT PRIMARY KEY,
      deal_id INTEGER,
      client TEXT NOT NULL,
      server TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Funded',
      task_description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Pending human approvals
    CREATE TABLE IF NOT EXISTS pending_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      principal TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      price_usdc INTEGER NOT NULL,
      task_description TEXT,
      failed_checks TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Webhook registrations for server agents
    CREATE TABLE IF NOT EXISTS webhook_registrations (
      agent_id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      secret TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Index for discovery
    CREATE INDEX IF NOT EXISTS idx_agents_capabilities ON agents(capabilities);
    CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
  `);
}
