# Data Model — Maldo Agents PoC

---

## On-Chain (Source of Truth)

### Registry.sol (existing, Arbitrum → redeploy Sepolia)

```
Service {
  uint40  serviceId        // auto-increment
  address owner            // operator wallet
  string  description      // human-readable
  bool    active
}

Deal {
  uint256 dealId
  uint40  serviceId
  address client
  uint256 amount
  DealStatus status        // Open, Completed, Disputed, Refunded
}
```

### MaldoEscrowX402.sol (new)

```
Deal {
  uint256 dealId           // from Registry
  address client
  address server
  uint256 amount           // USDC atomic (6 decimals)
  DealStatus status        // Funded, Completed, Disputed, Refunded
  uint256 createdAt        // block.timestamp
}

key: bytes32 nonce → Deal
```

### ERC-8004 Identity Registry (Sepolia 0x8004A818...)

```
NFT {
  uint256 tokenId          // agentId
  address owner
  string  uri              // IPFS → agent-card.json
}
```

### ERC-8004 Reputation Registry (Sepolia 0x8004B663...)

```
Feedback {
  uint256 agentId
  uint256 value            // e.g. 500 = 5.00 stars
  uint8   decimals         // 2
  string[] tags            // ["deal-completed", "rating-5"]
  string  feedbackURI      // IPFS
}

Summary (aggregated on-chain):
  uint256 averageValue
  uint256 feedbackCount
```

---

## Off-Chain PostgreSQL (Derived State Only)

```sql
-- Principal criteria config
CREATE TABLE criteria_config (
  principal_address   VARCHAR(42) PRIMARY KEY,
  preset              VARCHAR(20) DEFAULT 'Conservative',
  min_reputation      INTEGER DEFAULT 480,     -- × 100
  min_review_count    INTEGER DEFAULT 5,
  max_price_usdc      BIGINT DEFAULT 50000000, -- atomic
  require_human       BOOLEAN DEFAULT FALSE,
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Pending human approvals (deals that failed criteria)
CREATE TABLE pending_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_address   VARCHAR(42),
  service_id          INTEGER,
  agent_id            INTEGER,
  price_usdc          BIGINT,
  task_description    TEXT,
  failed_checks       TEXT[],
  status              VARCHAR(20) DEFAULT 'Pending', -- Pending, Approved, Rejected
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Webhook registrations (for server agents to receive DealFunded events)
CREATE TABLE webhook_registrations (
  agent_id            INTEGER PRIMARY KEY,
  webhook_url         TEXT NOT NULL,
  secret              VARCHAR(64),
  active              BOOLEAN DEFAULT TRUE
);

-- Service → AgentId mapping (both live on-chain, this is a local index)
CREATE TABLE service_agent_map (
  service_id          INTEGER PRIMARY KEY,
  agent_id            INTEGER NOT NULL,
  ens_name            VARCHAR(255),
  capabilities        TEXT[],
  base_price          BIGINT,
  endpoint            TEXT
);

-- Dispute evidence (off-chain storage, disputeId → evidence)
CREATE TABLE dispute_evidence (
  dispute_id          INTEGER,
  submitter_agent_id  INTEGER,
  evidence_uri        TEXT,
  submitted_at        TIMESTAMP DEFAULT NOW()
);
```

---

## Subgraph Entities (The Graph)

```graphql
type Agent @entity {
  id: ID!                        # agentId (string)
  serviceId: BigInt!
  owner: Bytes!
  name: String!
  capabilities: [String!]!
  basePrice: BigInt!
  endpoint: String
  registeredAt: BigInt!
  totalDeals: BigInt!
  completedDeals: BigInt!
  disputedDeals: BigInt!
  averageRating: BigDecimal!     # computed from Feedback events
  reviewCount: BigInt!
  rankScore: BigDecimal!         # recomputed on each feedback event
  vouches: [Vouch!]! @derivedFrom(field: "vouchee")
  ratings: [Rating!]! @derivedFrom(field: "ratee")
  deals: [Deal!]! @derivedFrom(field: "server")
}

type Deal @entity {
  id: ID!                        # nonce (hex string)
  dealId: BigInt!
  client: Agent!
  server: Agent!
  amount: BigInt!
  status: String!                # Funded | Completed | Disputed | Refunded
  createdAt: BigInt!
  completedAt: BigInt
}

type Rating @entity {
  id: ID!                        # dealId + rater agentId
  deal: Deal!
  rater: Agent!
  ratee: Agent!
  score: Int!                    # 1-5
  tags: [String!]!
  submittedAt: BigInt!
}

type Vouch @entity {
  id: ID!                        # voucher agentId + vouchee agentId
  voucher: Agent!
  vouchee: Agent!
  active: Boolean!
  weight: BigDecimal!            # computed from voucher's rankScore
  createdAt: BigInt!
}
```

---

## IPFS Stored Objects

### agent-card.json (ERC-8004 registration file)
Schema defined in contracts/api-contracts.md

### dispute-evidence.json
```json
{
  "dealId": 456,
  "submitterAgentId": 12,
  "description": "The analysis delivered was incomplete...",
  "evidence": [
    { "type": "transaction", "hash": "0x..." },
    { "type": "screenshot", "url": "ipfs://Qm..." },
    { "type": "text", "content": "..." }
  ],
  "submittedAt": "2026-02-17T10:00:00Z"
}
```
