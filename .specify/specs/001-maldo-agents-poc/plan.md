# Implementation Plan: Maldo Agents PoC

**Branch:** 001-maldo-agents-poc
**Date:** February 2026
**Input:** specs/001-maldo-agents-poc/spec.md
**Network:** Ethereum Sepolia (testnet)

---

## Technical Context

| Concern | Decision | Rationale |
|---|---|---|
| **Network** | Ethereum Sepolia | ERC-8004 registries already deployed there |
| **Smart Contracts** | Solidity ^0.8.20, Foundry | OpenZeppelin patterns, best tooling for tests |
| **Contract Libraries** | OpenZeppelin 5.x | ReentrancyGuard, Ownable2Step, IERC20 |
| **Off-chain Server** | Node.js + TypeScript + Express | x402 SDK is TypeScript-native |
| **Event Listener** | ethers.js v6 | Best-in-class Ethereum provider support |
| **Task Queue** | Bull + Redis | Reliable async task processing for deal events |
| **Database** | PostgreSQL (off-chain state only) | Criteria config, session data — chain is source of truth |
| **Subgraph** | The Graph (Sepolia) | Indexing on-chain deals, ratings, reputation |
| **Frontend Dashboard** | Next.js 14 + wagmi + viem | Wallet connection, chain reads, minimal off-chain |
| **SDK** | TypeScript (primary), Python (secondary) | Agent integrations |
| **x402 Payment** | @coinbase/x402 SDK | Official facilitator, gasless for clients |
| **Testing** | Foundry (contracts), Vitest (server), Playwright (E2E) | Full coverage stack |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 0 — EXISTING PROTOCOLS (DO NOT MODIFY)               │
│                                                             │
│  Registry.sol (Arbitrum, redeploy to Sepolia)               │
│  ERC-8004 Identity Registry  0x8004A818... (Sepolia)        │
│  ERC-8004 Reputation Registry  0x8004B663... (Sepolia)      │
│  x402 Facilitator  https://www.x402.org/facilitator         │
│  Kleros Escrow v2  (Sepolia or mock for PoC)                │
└───────────────────────┬─────────────────────────────────────┘
                        │ wraps / integrates
┌───────────────────────▼─────────────────────────────────────┐
│  LAYER 1 — MALDO SATELLITE CONTRACTS                        │
│                                                             │
│  MaldoEscrowX402.sol                                        │
│    - Receives x402 payments (from facilitator)              │
│    - Locks USDC in escrow per deal                          │
│    - Emits DealFunded, DealCompleted, DisputeInitiated      │
│    - Calls Registry.sol for deal lifecycle                  │
│    - Timeout refund (7 days)                                │
│                                                             │
│  MaldoRouter.sol                                            │
│    - Agentic criteria evaluation                            │
│    - Fee collection (1%, hardcoded max 5%)                  │
│    - Routes to x402 (instant) or escrow (guarded)          │
│    - Returns x402 PaymentRequirements for HTTP path         │
└───────────────────────┬─────────────────────────────────────┘
                        │ listens / calls
┌───────────────────────▼─────────────────────────────────────┐
│  LAYER 2 — OFF-CHAIN SERVICES                               │
│                                                             │
│  API Server (Express + TypeScript)                          │
│    POST /services/register                                  │
│    GET  /services/discover                                  │
│    POST /deals/create (crypto-native path)                  │
│    GET  /deals/status/:nonce                                │
│    POST /deals/complete                                     │
│    POST /deals/dispute                                      │
│    GET  /agents/:id/reputation                              │
│    POST /agents/:id/vouch                                   │
│    GET  /principals/:address/criteria                       │
│    PUT  /principals/:address/criteria                       │
│                                                             │
│  x402 Middleware Layer                                      │
│    GET  /x402/services/:capability  →  402 + requirements  │
│    POST /x402/services/:capability  →  execute on payment  │
│                                                             │
│  Event Listener (ethers.js)                                 │
│    Listens: DealFunded → enqueue task                       │
│    Listens: DealCompleted → update reputation               │
│    Listens: DisputeInitiated → notify parties               │
│                                                             │
│  Reputation Engine (off-chain computation)                  │
│    Bayesian score computation from on-chain data            │
│    Vouch weight calculation                                 │
│    Badge computation (100 deals, 0 disputes, etc.)          │
└───────────────────────┬─────────────────────────────────────┘
                        │ displays
┌───────────────────────▼─────────────────────────────────────┐
│  LAYER 3 — INTERFACES                                       │
│                                                             │
│  Dashboard (Next.js)                                        │
│    /dashboard — deal status, criteria config, approvals     │
│    /agents — discovery UI                                   │
│    /agents/:id — agent profile                              │
│                                                             │
│  SDK                                                        │
│    @maldo/sdk (TypeScript)                                  │
│    maldo-sdk (Python)                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### Component 1: Smart Contracts

#### 1.1 MaldoEscrowX402.sol

**Purpose:** Receive x402 payments, lock USDC, manage deal lifecycle, integrate with Registry.

```
Storage:
  mapping(bytes32 nonce => Deal) public deals
  address public immutable usdc
  address public immutable registry
  address public immutable facilitator
  uint256 public constant TIMEOUT = 7 days

Struct Deal:
  uint256 dealId
  address client
  address server
  uint256 amount
  DealStatus status   // enum: Funded, Completed, Disputed, Refunded
  uint256 createdAt

Functions:
  receivePayment(address from, uint256 value, bytes32 nonce, uint40 serviceId)
    - ONLY callable by facilitator
    - Validates USDC balance received
    - Creates deal in Registry via createDealFromEscrow()
    - Emits DealFunded(nonce, dealId, client, server, amount)

  completeDeal(bytes32 nonce)
    - ONLY callable by client
    - CEI: set completed, transfer USDC to server, call registry.completeDeal()
    - Emits DealCompleted(dealId, server, amount)

  dispute(bytes32 nonce)
    - ONLY callable by client, within timeout window
    - Sets status to Disputed
    - Calls Kleros (or mock) to open dispute
    - Emits DisputeInitiated(dealId, client, server, amount)

  resolveDispute(bytes32 nonce, address winner)
    - ONLY callable by Kleros arbitrator
    - Transfers USDC to winner
    - Updates deal status

  refundTimeout(bytes32 nonce)
    - Callable by anyone after TIMEOUT
    - Refunds client if deal still Funded
    - Emits DealRefunded(dealId, client, amount)

Security:
  - ReentrancyGuard on all fund-moving functions
  - CEI pattern strictly enforced
  - Custom errors: OnlyFacilitator, OnlyClient, AlreadyCompleted, TooEarly
  - No tx.origin, no unbounded loops
  - Events on every state change
```

#### 1.2 MaldoRouter.sol

**Purpose:** Evaluate agentic criteria, collect fees, route payment method, provide x402 requirements.

```
Storage:
  mapping(address principal => Criteria) public principalCriteria
  uint256 public constant FEE_BPS = 100           // 1%
  uint256 public constant MAX_FEE_BPS = 500       // 5% hardcoded
  uint256 public constant HIGH_VALUE_THRESHOLD = 100_000_000  // $100 USDC
  address public immutable escrow
  address public immutable reputationRegistry     // ERC-8004

Struct Criteria:
  uint256 minReputation    // e.g. 450 = 4.50 stars (2 decimals)
  uint256 minReviewCount
  uint256 maxPriceUSDC
  bool requireHumanApproval  // override: always manual

Enum CriteriaPreset: Conservative, Balanced, Aggressive, Custom

Functions:
  setCriteria(Criteria calldata criteria)
    - Sets principal's custom criteria

  applyPreset(CriteriaPreset preset)
    - Conservative: minRep=480, minReviews=5, maxPrice=50e6
    - Balanced: minRep=450, minReviews=3, maxPrice=100e6
    - Aggressive: minRep=400, minReviews=1, maxPrice=500e6

  evaluateDeal(address principal, uint256 agentId, uint256 priceUSDC)
    returns (bool autoApprove, string memory reason)
    - Reads principal criteria
    - Reads ERC-8004 reputation summary for agentId
    - Checks all thresholds
    - Always returns false for price > HIGH_VALUE_THRESHOLD (unless overridden)

  getX402Requirements(uint40 serviceId, uint256 amount)
    returns (PaymentRequirements memory)
    - Returns x402-compatible requirements struct
    - payTo = escrow.address
    - Includes encoded serviceId in extra field

  collectFee(uint256 dealAmount)
    returns (uint256 fee, uint256 net)
    - Computes 1% fee, returns split amounts
```

#### 1.3 Interfaces

```
IRegistry.sol (existing Registry interface)
  getServiceOwner(uint40 serviceId) → address
  createDealFromEscrow(uint40 serviceId, address client, uint256 amount) → uint256 dealId
  completeDeal(uint256 dealId)
  dispute(uint256 dealId)

IERC8004Identity.sol
  mint(address to, string memory uri) → uint256
  tokenURI(uint256 tokenId) → string

IERC8004Reputation.sol
  postFeedback(uint256 agentId, uint256 value, uint8 decimals, string[] tags, string feedbackURI)
  getSummary(uint256 agentId) → Summary(averageValue, feedbackCount)

IKleros.sol (minimal mock for PoC)
  createDispute(bytes32 nonce, address client, address server, uint256 amount) → uint256 disputeId
  submitEvidence(uint256 disputeId, string calldata evidenceURI)
```

---

### Component 2: API Server

**Stack:** Node.js 20 LTS + TypeScript 5 + Express 4 + ethers.js v6

#### 2.1 Service Registration Endpoint

```
POST /api/v1/services/register

Request:
{
  "name": "market-analyst-agent",
  "description": "AI agent specialized in market analysis",
  "capabilities": ["market-analysis", "financial-report"],
  "basePrice": 50000000,   // in USDC atomic units (6 decimals)
  "endpoint": "https://agent.example.com/a2a",
  "wallet": "0x..."        // operator wallet (signs tx)
}

Response:
{
  "serviceId": 42,
  "agentId": 789,          // ERC-8004 NFT token ID
  "ensName": "market-analyst-agent.maldo.eth",
  "txHash": "0x..."
}

On-chain actions:
  1. Calls Registry.addService()
  2. Mints ERC-8004 identity NFT
  3. Links serviceId → agentId in MaldoRouter

Off-chain actions:
  - Generates and publishes agent-card.json to IPFS
  - Serves /.well-known/agent-card.json via subdomain (or instructs user to)
```

#### 2.2 Discovery Endpoint

```
GET /api/v1/services/discover?capability=market-analysis&minRep=4.5&limit=10

Response:
{
  "agents": [
    {
      "serviceId": 42,
      "agentId": 789,
      "name": "market-analyst-agent",
      "capabilities": ["market-analysis"],
      "basePrice": 50000000,
      "reputation": {
        "score": 4.82,
        "reviewCount": 34,
        "disputeRate": 0.02,
        "badges": ["50-deals", "zero-disputes-streak"]
      },
      "endpoint": "https://agent.example.com/a2a"
    }
  ]
}

Data source: The Graph subgraph (indexes Registry + ERC-8004)
Ranking formula: bayesianScore × volumeWeight × (1 - disputeRate) × vouchBonus
```

#### 2.3 Agentic Criteria Endpoints

```
GET /api/v1/principals/:address/criteria
Response:
{
  "preset": "Balanced",
  "criteria": {
    "minReputation": 4.5,
    "minReviewCount": 3,
    "maxPriceUSDC": 100,
    "requireHumanApproval": false
  }
}

PUT /api/v1/principals/:address/criteria
Request:
{
  "preset": "Conservative"   // OR
  "criteria": { ... }        // custom
}

POST /api/v1/criteria/evaluate
Request:
{
  "principal": "0x...",
  "agentId": 789,
  "price": 50000000
}
Response:
{
  "autoApprove": true,
  "reasons": [],
  "failedChecks": []
}
```

#### 2.4 Deal Endpoints (Crypto-Native Path)

```
POST /api/v1/deals/create
Request:
{
  "serviceId": 42,
  "clientAddress": "0x...",
  "priceUSDC": 50000000,
  "taskDescription": "Analyze Paraguay's agro market Q1 2026"
}
Response:
{
  "requiresHumanApproval": false,
  "dealId": 456,
  "nonce": "0xabc...",
  "txHash": "0x..."
}

GET /api/v1/deals/:nonce/status
Response:
{
  "nonce": "0xabc...",
  "dealId": 456,
  "status": "Funded",       // Funded | Completed | Disputed | Refunded
  "client": "0x...",
  "server": "0x...",
  "amount": 50000000,
  "createdAt": 1708000000
}

POST /api/v1/deals/:nonce/complete
POST /api/v1/deals/:nonce/dispute
  Request: { "evidenceURI": "ipfs://..." }
```

#### 2.5 x402 HTTP Path (Web-Native Agents)

```
GET /x402/services/:capability
Response: HTTP 402
  PAYMENT-REQUIRED: <base64-encoded requirements>
  {
    "scheme": "exact",
    "network": "eip155:11155111",
    "amount": "<base price in atomic USDC>",
    "asset": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    "payTo": "<MaldoEscrowX402 address>",
    "extra": { "serviceId": 42, "capability": "market-analysis" }
  }

POST /x402/services/:capability
  PAYMENT-SIGNATURE: <client's signed EIP-3009 authorization>
  Body: { "taskDescription": "..." }
Response: HTTP 200
  {
    "dealId": 456,
    "nonce": "0xabc...",
    "webhookUrl": "https://api.maldo.uy/x402/deals/0xabc.../result"
  }

GET /x402/deals/:nonce/result
Response (when ready):
  {
    "status": "delivered",
    "result": { ... }        // service-specific payload
  }
```

#### 2.6 Reputation Endpoints

```
GET /api/v1/agents/:agentId/reputation
Response:
{
  "agentId": 789,
  "score": 4.82,
  "reviewCount": 34,
  "disputeRate": 0.02,
  "vouches": [
    { "voucherAgentId": 11, "voucherScore": 4.9, "weight": 0.85 }
  ],
  "badges": ["50-deals", "zero-disputes-streak", "top-10-pct"]
}

POST /api/v1/agents/:agentId/rate
Request:
{
  "dealId": 456,
  "raterAgentId": 12,
  "rating": 5,
  "comment": "Excellent analysis"
}

POST /api/v1/agents/:agentId/vouch
Request:
{
  "voucherAgentId": 11,
  "voucherWallet": "0x...",
  "signature": "0x..."   // EIP-712 vouch signature
}
```

---

### Component 3: Event Listener

**Stack:** ethers.js v6 + Bull queues + Redis

```
Listened events → Actions:

DealFunded(nonce, dealId, client, server, amount)
  → Enqueue task: { type: "DEAL_FUNDED", dealId, nonce, server, amount }
  → Server polls /x402/deals/:nonce/result for task assignment
  → Or: notify server agent via webhook (if registered endpoint)

DealCompleted(dealId, server, amount)
  → Trigger: post feedback prompt to client (if auto-rating configured)
  → Update: off-chain deal status cache

DisputeInitiated(dealId, client, server, amount)
  → Notify: both parties via registered webhook (if any)
  → Log: dispute opened, waiting Kleros resolution

DisputeResolved(dealId, winner, amount)
  → Trigger: ERC-8004 reputation post with dispute outcome tag
  → Update: deal status to Resolved

Recovery:
  - On startup: replay last 1000 blocks to catch missed events
  - Dead letter queue: failed events retried 3 times then logged
```

---

### Component 4: Reputation Engine

**Stack:** Off-chain computation, data from The Graph subgraph

#### Bayesian Score Formula

```typescript
function bayesianScore(agent: Agent): number {
  const C = 3.5      // global prior mean (neutral)
  const m = 10       // minimum reviews for full confidence

  const R = agent.averageRating     // agent's average
  const v = agent.reviewCount       // number of reviews

  return (v / (v + m)) * R + (m / (v + m)) * C
}
```

#### Discovery Ranking Formula

```typescript
function rankScore(agent: Agent): number {
  const base = bayesianScore(agent)
  const volumeWeight = Math.min(agent.reviewCount / 100, 1)  // caps at 100 reviews
  const disputePenalty = 1 - agent.disputeRate
  const vouchBonus = computeVouchBonus(agent.vouches)        // max 1.2x

  return base * volumeWeight * disputePenalty * vouchBonus
}
```

#### Badge Computation (auto, never manual)

```
"50-deals": agent.completedDeals >= 50
"100-deals": agent.completedDeals >= 100
"zero-disputes-streak": last 20 deals with zero disputes
"top-10-pct": rankScore in top 10% of category
"veteran": agent registered > 180 days
```

---

### Component 5: The Graph Subgraph

**Purpose:** Index on-chain data for efficient querying without running an archive node.

```graphql
# Entities indexed from Registry + MaldoEscrow + ERC-8004

type Agent @entity {
  id: ID!                    # agentId (ERC-8004 NFT)
  serviceId: BigInt!
  owner: Bytes!
  name: String!
  capabilities: [String!]!
  registeredAt: BigInt!
  totalDeals: BigInt!
  completedDeals: BigInt!
  disputedDeals: BigInt!
  averageRating: BigDecimal!
  reviewCount: BigInt!
  vouches: [Vouch!]! @derivedFrom(field: "vouchee")
}

type Deal @entity {
  id: ID!                    # nonce
  dealId: BigInt!
  client: Agent!
  server: Agent!
  amount: BigInt!
  status: DealStatus!
  createdAt: BigInt!
  completedAt: BigInt
}

type Rating @entity {
  id: ID!                    # dealId + rater
  deal: Deal!
  rater: Agent!
  ratee: Agent!
  score: Int!
  submittedAt: BigInt!
}

type Vouch @entity {
  id: ID!
  voucher: Agent!
  vouchee: Agent!
  active: Boolean!
  createdAt: BigInt!
}
```

---

### Component 6: Dashboard (Next.js)

**Pages:**

```
/ (landing)
  - Brief explanation + connect wallet CTA
  - OR: enter API key for web-native principals

/dashboard
  - Overview: active deals, pending approvals, reputation summary
  - "Pending Approval" section: deals that failed criteria, with approve/reject

/dashboard/deals
  - Table: all deals with status, amount, counterparty, actions
  - Actions: complete, dispute, view details

/dashboard/criteria
  - Current preset display
  - Preset selector: Conservative / Balanced / Aggressive
  - Advanced: custom criteria sliders
  - Impact preview: "With this config, X% of past test deals would auto-approve"

/agents
  - Discovery search: capability filter, min reputation slider
  - Results grid with reputation badges

/agents/:id
  - Agent profile: name, capabilities, reputation history chart
  - Vouch list, badge display
  - "Hire this agent" CTA

Key components:
  - WalletConnectButton (wagmi)
  - DealStatusBadge
  - ReputationDisplay (Bayesian score + confidence bar)
  - CriteriaEditor
  - PendingApprovalCard (most important for semi-autonomous UX)
```

---

### Component 7: SDK

#### TypeScript SDK (@maldo/sdk)

```typescript
// Agent registration
const maldo = new MaldoClient({ network: 'sepolia', signer });
const { serviceId, agentId } = await maldo.agents.register({
  name: 'my-analyst',
  capabilities: ['market-analysis'],
  basePrice: 50_000_000,
  endpoint: 'https://myagent.example.com'
});

// Discovery
const agents = await maldo.agents.discover({
  capability: 'market-analysis',
  minReputation: 4.5
});

// Deal (crypto-native)
const { dealId, nonce } = await maldo.deals.create({
  serviceId: agents[0].serviceId,
  price: 50_000_000,
  task: 'Analyze Paraguay market Q1 2026'
});

// Deal (x402 - web-native compatible)
const result = await maldo.x402.request({
  capability: 'market-analysis',
  task: 'Analyze Paraguay market Q1 2026',
  maxPrice: 50_000_000
});

// Criteria
await maldo.criteria.applyPreset('Balanced');
const { autoApprove } = await maldo.criteria.evaluate({
  agentId, price: 50_000_000
});
```

#### Python SDK (maldo-sdk)

```python
from maldo import MaldoClient

client = MaldoClient(network="sepolia", private_key=os.environ["OPERATOR_KEY"])

# x402 path (web-native agent)
result = client.x402.request(
    capability="market-analysis",
    task="Analyze Paraguay market Q1 2026",
    max_price_usdc=50
)

# Or HTTP-only (no wallet at all — operator handles signing)
result = client.http.request(
    capability="market-analysis",
    task="Analyze Paraguay market Q1 2026"
)
```

---

## Data Model

**On-chain (source of truth):**
- Registry.sol: services, deals, dispute status
- ERC-8004 Identity: agent NFTs, registration URIs
- ERC-8004 Reputation: ratings, feedback summaries
- MaldoEscrowX402: escrow state per nonce

**Off-chain (derived, never primary):**
- PostgreSQL: criteria config per principal, session/API keys, webhook URLs
- The Graph: indexed view of all on-chain data for efficient querying
- Redis: task queue state, event listener job state
- IPFS: agent-card.json metadata, evidence URIs for disputes

---

## Project Structure

```
maldo-agents-poc/
├── packages/
│   ├── contracts/                   # Foundry project
│   │   ├── src/
│   │   │   ├── MaldoEscrowX402.sol
│   │   │   ├── MaldoRouter.sol
│   │   │   └── interfaces/
│   │   │       ├── IRegistry.sol
│   │   │       ├── IERC8004Identity.sol
│   │   │       ├── IERC8004Reputation.sol
│   │   │       └── IKleros.sol
│   │   ├── test/
│   │   │   ├── MaldoEscrowX402.t.sol
│   │   │   ├── MaldoRouter.t.sol
│   │   │   └── integration/
│   │   │       └── FullFlow.t.sol
│   │   └── script/
│   │       └── Deploy.s.sol
│   │
│   ├── server/                      # Node.js API + event listener
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── services.ts
│   │   │   │   ├── deals.ts
│   │   │   │   ├── agents.ts
│   │   │   │   ├── criteria.ts
│   │   │   │   └── x402.ts
│   │   │   ├── listeners/
│   │   │   │   └── escrowEvents.ts
│   │   │   ├── services/
│   │   │   │   ├── reputation.ts
│   │   │   │   ├── criteria.ts
│   │   │   │   ├── discovery.ts
│   │   │   │   └── x402.ts
│   │   │   └── middleware/
│   │   │       └── x402Payment.ts
│   │   └── tests/
│   │       ├── routes/
│   │       └── integration/
│   │
│   ├── subgraph/                    # The Graph
│   │   ├── schema.graphql
│   │   ├── subgraph.yaml
│   │   └── src/
│   │       └── mappings.ts
│   │
│   ├── dashboard/                   # Next.js
│   │   ├── app/
│   │   │   ├── dashboard/
│   │   │   ├── agents/
│   │   │   └── page.tsx
│   │   └── components/
│   │
│   └── sdk/
│       ├── typescript/
│       │   └── src/
│       └── python/
│           └── maldo/
│
└── docs/
    ├── api-spec.json                # OpenAPI 3.0
    └── quickstart.md
```

---

## Constitution Compliance Check

| Principle | Status | Notes |
|---|---|---|
| Open standards | ✅ | ERC-8004, x402, Kleros only |
| Wrapper architecture | ✅ | Registry.sol untouched |
| Security-first | ✅ | CEI, ReentrancyGuard, custom errors |
| Dual entry | ✅ | crypto-native + x402 HTTP paths |
| Organic reputation | ✅ | Bayesian + on-chain only |
| Programmable trust | ✅ | MaldoRouter criteria engine |
| Fee transparency | ✅ | 1% hardcoded, 5% max immutable |
| PoC scope | ✅ | No mainnet, no token, no audit |

---

## Non-Functional Requirements

| Requirement | Target | Notes |
|---|---|---|
| x402 payment confirmation | < 2 seconds | Sepolia block time ~12s; facilitator async |
| End-to-end deal time | < 10 seconds | From HTTP call to event received |
| Contract test coverage | > 80% | Foundry coverage tool |
| Slither findings | 0 High, 0 Medium | Run before any testnet deploy |
| Gas: receivePayment | < 100k gas | Benchmark in Foundry tests |
| Gas: completeDeal | < 80k gas | Benchmark in Foundry tests |
| API response time | < 500ms | For non-chain-reading endpoints |

---

## Deployment Sequence

```
Phase 1 (Week 1): Contracts
  1. Deploy Registry.sol clone to Sepolia
  2. Deploy MaldoEscrowX402.sol (immutable: usdc, registry, facilitator)
  3. Deploy MaldoRouter.sol (immutable: escrow, erc8004Reputation)
  4. Verify all contracts on Etherscan
  5. Run Slither — fix all High/Medium
  6. Fund test wallets with Sepolia ETH + USDC

Phase 2 (Week 2): Server + Listener
  7. Deploy API server (Railway or Fly.io)
  8. Deploy Redis (Upstash)
  9. Deploy PostgreSQL (Supabase or Neon)
  10. Configure ethers.js listener with contract ABIs
  11. Deploy The Graph subgraph to Sepolia

Phase 3 (Week 3): Dashboard + SDK + Integration Tests
  12. Deploy Next.js dashboard (Vercel)
  13. Publish @maldo/sdk to npm (beta)
  14. Run 10+ end-to-end test deals
  15. Verify ERC-8004 data readable on 8004scan.io
  16. Demo Scenario D (Python web-native agent)
```
