# Tasks: Maldo Agents PoC

**Branch:** 001-maldo-agents-poc
**Date:** February 2026
**Input:** plan.md, spec.md
**Executor:** Claude Code / AI coding agent

---

## Conventions

- `[P]` — Can run in parallel with other `[P]` tasks in the same phase
- `[USx]` — User story this task belongs to
- Tasks within a phase that are NOT marked `[P]` must run sequentially
- Phase 0 (Foundational) must complete before any user story phase begins
- Each phase has an independent checkpoint — verify before moving on

---

## Phase 0 — Foundational Setup

**Goal:** Project skeleton, tooling, contracts compiling, deployed to Sepolia.
**Checkpoint:** All contracts deploy and verify on Sepolia; basic Foundry tests pass.

### 0.1 Project Initialization

- [ ] Task: Initialize monorepo with pnpm workspaces in `maldo-agents-poc/`
  - Create `package.json` at root with workspaces: `["packages/*"]`
  - Create folders: `packages/contracts`, `packages/server`, `packages/subgraph`, `packages/dashboard`, `packages/sdk`

- [ ] Task: Initialize Foundry project in `packages/contracts/`
  - Run `forge init --no-git` inside `packages/contracts/`
  - Install OpenZeppelin: `forge install OpenZeppelin/openzeppelin-contracts`
  - Configure `foundry.toml`: solidity 0.8.20, optimizer 200 runs, via-IR off
  - Add remappings for `@openzeppelin/`

- [ ] Task: Initialize Node.js server in `packages/server/`
  - `pnpm init`, TypeScript 5, Express 4, ethers.js v6, Bull, ioredis
  - Add `tsconfig.json` with strict mode, target ES2022
  - Add `vitest.config.ts` for unit + integration tests

- [ ] Task: Create `.env.example` at repo root with all required variables
  - `SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `USDC_SEPOLIA`, `IDENTITY_REGISTRY`, `REPUTATION_REGISTRY`, `X402_FACILITATOR_URL`, `FACILITATOR_ADDRESS`, `REDIS_URL`, `DATABASE_URL`, `MALDO_ESCROW_ADDRESS`, `MALDO_ROUTER_ADDRESS`

---

### 0.2 Contract Interfaces

- [ ] `[P]` Task: Create `packages/contracts/src/interfaces/IRegistry.sol`
  ```solidity
  interface IRegistry {
      function getServiceOwner(uint40 serviceId) external view returns (address);
      function createDealFromEscrow(uint40 serviceId, address client, uint256 amount) external returns (uint256);
      function completeDeal(uint256 dealId) external;
      function dispute(uint256 dealId) external;
  }
  ```

- [ ] `[P]` Task: Create `packages/contracts/src/interfaces/IERC8004Identity.sol`
  ```solidity
  interface IERC8004Identity {
      function mint(address to, string memory uri) external returns (uint256);
      function tokenURI(uint256 tokenId) external view returns (string memory);
      function ownerOf(uint256 tokenId) external view returns (address);
  }
  ```

- [ ] `[P]` Task: Create `packages/contracts/src/interfaces/IERC8004Reputation.sol`
  ```solidity
  interface IERC8004Reputation {
      struct Summary { uint256 averageValue; uint256 feedbackCount; }
      function postFeedback(uint256 agentId, uint256 value, uint8 decimals, string[] calldata tags, string calldata feedbackURI) external;
      function getSummary(uint256 agentId) external view returns (Summary memory);
  }
  ```

- [ ] `[P]` Task: Create `packages/contracts/src/interfaces/IKleros.sol` (mock interface for PoC)
  ```solidity
  interface IKleros {
      function createDispute(bytes32 nonce, address client, address server, uint256 amount) external returns (uint256);
      function submitEvidence(uint256 disputeId, string calldata evidenceURI) external;
  }
  ```

- [ ] Task: Create `packages/contracts/src/mocks/MockKleros.sol`
  - Minimal mock: stores dispute, emits DisputeCreated, allows manual resolution via `resolveDispute(bytes32 nonce, address winner)`
  - Used ONLY in tests and Sepolia PoC (not production)

- [ ] `[P]` Task: Create `packages/contracts/src/mocks/MockRegistry.sol`
  - Minimal mock implementing IRegistry
  - Stores service owners, creates deal IDs sequentially

---

### 0.3 Core Contracts

- [ ] Task: Implement `packages/contracts/src/MaldoEscrowX402.sol`
  - Imports: IERC20, ReentrancyGuard (OZ), IRegistry, IKleros
  - Storage: `mapping(bytes32 => Deal) public deals`, immutables: usdc, registry, facilitator, klerosArbitrator
  - Enum DealStatus: Funded, Completed, Disputed, Refunded
  - Struct Deal: dealId, client, server, amount, status, createdAt
  - Custom errors: OnlyFacilitator, OnlyClient, OnlyArbitrator, AlreadySettled, TooEarlyForRefund, InvalidAmount
  - Events: DealFunded, DealCompleted, DisputeInitiated, DisputeResolved, DealRefunded
  - Functions: receivePayment, completeDeal, dispute, resolveDispute, refundTimeout
  - Apply CEI pattern strictly on all fund-moving functions
  - Apply ReentrancyGuard on: completeDeal, resolveDispute, refundTimeout

- [ ] Task: Implement `packages/contracts/src/MaldoRouter.sol`
  - Imports: Ownable2Step (OZ), IERC8004Reputation
  - Storage: `mapping(address => Criteria) public principalCriteria`, immutables: escrow, reputationRegistry
  - Constants: FEE_BPS=100, MAX_FEE_BPS=500 (immutable), HIGH_VALUE_THRESHOLD=100_000_000
  - Enum CriteriaPreset: Conservative, Balanced, Aggressive, Custom
  - Struct Criteria: minReputation, minReviewCount, maxPriceUSDC, requireHumanApproval
  - Functions: setCriteria, applyPreset, evaluateDeal, getX402Requirements, collectFee
  - evaluateDeal reads ERC-8004 reputation via IERC8004Reputation.getSummary
  - getX402Requirements returns struct with payTo=escrow.address

- [ ] Task: Write Foundry unit tests `packages/contracts/test/MaldoEscrowX402.t.sol`
  - setUp: deploy mocks (USDC, Registry, Kleros), deploy escrow
  - test_receivePayment_success
  - test_receivePayment_onlyFacilitator
  - test_completeDeal_success
  - test_completeDeal_onlyClient
  - test_completeDeal_alreadyCompleted
  - test_dispute_success
  - test_refundTimeout_success
  - test_refundTimeout_tooEarly
  - testFuzz_amounts (fuzz: uint256 amount)

- [ ] Task: Write Foundry unit tests `packages/contracts/test/MaldoRouter.t.sol`
  - test_applyPreset_conservative
  - test_applyPreset_balanced
  - test_applyPreset_aggressive
  - test_evaluateDeal_autoApprove
  - test_evaluateDeal_failsReputation
  - test_evaluateDeal_failsPrice
  - test_evaluateDeal_highValueRequiresHuman
  - test_collectFee_onePercent
  - test_feeCapCannotExceedMax (assert MAX_FEE_BPS is immutable)

- [ ] Task: Write integration test `packages/contracts/test/integration/FullFlow.t.sol`
  - Forks Sepolia (if feasible) or uses full mock stack
  - Simulates: register → fund escrow → complete deal → post reputation
  - Simulates: register → fund escrow → dispute → resolve → verify outcome

- [ ] Task: Run Slither on all contracts, fix all High and Medium findings
  - `slither packages/contracts/src/ --config-file slither.config.json`
  - Document any accepted Low findings with justification

- [ ] Task: Deploy contracts to Sepolia via Foundry script `packages/contracts/script/Deploy.s.sol`
  - Deploy order: MockKleros (PoC only) → MaldoEscrowX402 → MaldoRouter
  - Verify all on Etherscan Sepolia
  - Save deployed addresses to `packages/contracts/deployments/sepolia.json`

---

### 0.4 Foundational Server Setup

- [ ] Task: Set up Express app skeleton in `packages/server/src/app.ts`
  - Middleware: helmet, cors, express.json, morgan (logging)
  - Route mounting: /api/v1/services, /api/v1/deals, /api/v1/agents, /api/v1/criteria, /api/v1/principals, /x402
  - Global error handler with typed ApiError class
  - Health check: GET /health → { status: 'ok', network: 'sepolia' }

- [ ] Task: Set up ethers.js provider + contract instances in `packages/server/src/chain/provider.ts`
  - JsonRpcProvider connecting to SEPOLIA_RPC_URL
  - Typed contract instances: escrow, router, erc8004Identity, erc8004Reputation
  - Export singleton (reconnect-safe)

- [ ] Task: Set up database connection in `packages/server/src/db/index.ts`
  - PostgreSQL with node-postgres (pg)
  - Run migrations: create tables criteria_config, principal_sessions, webhook_registrations

- [ ] Task: Set up Bull queue + Redis in `packages/server/src/queue/index.ts`
  - Queue: 'deal-events' for DealFunded processing
  - Worker: processes task, calls registered agent endpoint or stores result

---

## Phase 1 — Agent Registration & Identity [US1]

**Goal:** An operator can register a service agent with on-chain identity (ERC-8004 NFT + Registry service).
**Checkpoint:** POST /api/v1/services/register returns serviceId + agentId; verify NFT on Etherscan; verify on 8004scan.io

- [ ] `[P]` Task: Implement registration service in `packages/server/src/services/registration.ts` [US1]
  - Function: `registerAgent(params)` → calls Registry.addService(), then ERC-8004.mint()
  - Generates agent-card.json (ERC-8004 format), uploads to IPFS via Pinata/nft.storage
  - Stores serviceId↔agentId mapping in DB
  - Returns: { serviceId, agentId, txHash, ipfsUri }

- [ ] `[P]` Task: Implement POST /api/v1/services/register route in `packages/server/src/routes/services.ts` [US1]
  - Validates request body: name, description, capabilities[], basePrice, endpoint, wallet
  - Calls registration service
  - Returns 201 with { serviceId, agentId, ensName (placeholder), txHash }

- [ ] Task: Write Vitest integration test for registration endpoint [US1]
  - Mock chain calls (ethers provider mock)
  - test: valid registration returns 201 with serviceId and agentId
  - test: duplicate name returns 409
  - test: missing required field returns 400

---

## Phase 2 — Agent Discovery [US2]

**Goal:** A client agent can query for service agents by capability and get ranked results.
**Checkpoint:** GET /discover with capability filter returns ranked list; new agent appears last.

- [ ] Task: Deploy The Graph subgraph to Sepolia [US2]
  - Write `packages/subgraph/schema.graphql` (Agent, Deal, Rating, Vouch entities as per plan.md)
  - Write `packages/subgraph/subgraph.yaml` pointing to MaldoEscrowX402 + Registry on Sepolia
  - Write mappings in `packages/subgraph/src/mappings.ts` for DealFunded, DealCompleted events
  - Deploy: `graph deploy --studio maldo-agents-sepolia`

- [ ] `[P]` Task: Implement reputation engine in `packages/server/src/services/reputation.ts` [US2]
  - bayesianScore(reviewCount, averageRating): applies Bayesian formula (C=3.5, m=10)
  - rankScore(agent): bayesian × volumeWeight × (1-disputeRate) × vouchBonus
  - computeBadges(agent): evaluates all badge conditions, returns string[]
  - All data sourced from The Graph GraphQL queries

- [ ] `[P]` Task: Implement discovery service in `packages/server/src/services/discovery.ts` [US2]
  - Queries subgraph for agents matching capability
  - Applies minReputation filter post-query
  - Sorts by rankScore descending
  - Returns paginated list with reputation details and badges

- [ ] Task: Implement GET /api/v1/services/discover route [US2]
  - Query params: capability (required), minRep (optional), limit (default 10, max 50)
  - Returns 200 with agents array
  - Returns 200 with empty array if no matches (not 404)

- [ ] Task: Write Vitest tests for discovery [US2]
  - test: returns agents sorted by rank score
  - test: new agent (0 reviews) appears after established agents
  - test: minRep filter excludes low-reputation agents
  - test: unknown capability returns empty array

---

## Phase 3 — Agentic Criteria [US3]

**Goal:** A human principal can configure trust thresholds; the system auto-approves or flags deals accordingly.
**Checkpoint:** PUT criteria → GET criteria returns correct values; evaluate with matching deal returns autoApprove=true; evaluate with failing deal returns autoApprove=false with reason.

- [ ] `[P]` Task: Implement criteria service in `packages/server/src/services/criteria.ts` [US3]
  - getCriteria(principal): reads from DB (or returns Conservative default)
  - setCriteria(principal, criteria): validates, persists to DB
  - applyPreset(principal, preset): maps Conservative/Balanced/Aggressive to Criteria struct
  - evaluateDeal(principal, agentId, priceUSDC): reads criteria, reads ERC-8004 reputation, checks all rules
  - Returns: { autoApprove: boolean, failedChecks: string[], reasons: string[] }

- [ ] `[P]` Task: Implement criteria routes in `packages/server/src/routes/criteria.ts` [US3]
  - GET /api/v1/principals/:address/criteria → current config
  - PUT /api/v1/principals/:address/criteria → update (preset or custom)
  - POST /api/v1/criteria/evaluate → { principal, agentId, price } → evaluation result

- [ ] Task: Write Vitest tests for criteria engine [US3]
  - test: default criteria is Conservative when none set
  - test: Conservative preset values are correct (4.8, 5, $50)
  - test: evaluateDeal autoApprove=true when all pass
  - test: evaluateDeal autoApprove=false when reputation fails
  - test: evaluateDeal autoApprove=false when price fails
  - test: price > $100 always fails unless human override explicitly set
  - test: requireHumanApproval=true always fails regardless of other checks
  - test: changing criteria does not affect already-pending deals

---

## Phase 4 — Deal Lifecycle [US4]

**Goal:** Full deal cycle works: create → fund escrow → deliver → complete; and create via x402 HTTP path.
**Checkpoint:** 5 end-to-end deals on Sepolia: 3 crypto-native, 2 via x402 Python script.

- [ ] Task: Implement event listener in `packages/server/src/listeners/escrowEvents.ts` [US4]
  - Subscribe to MaldoEscrowX402 events: DealFunded, DealCompleted, DisputeInitiated, DisputeResolved
  - On DealFunded: enqueue job to 'deal-events' queue with all deal data
  - On startup: replay last 500 blocks to recover missed events
  - Reconnect logic: re-subscribe on provider disconnect with exponential backoff

- [ ] `[P]` Task: Implement deal service in `packages/server/src/services/deals.ts` [US4]
  - createDeal(serviceId, clientAddress, priceUSDC, taskDescription)
    - Evaluates criteria first (if principal config exists)
    - Returns { requiresHumanApproval, dealId?, nonce? } or { requiresHumanApproval: true, pendingApprovalId }
  - completeDeal(nonce, clientAddress): calls escrow.completeDeal(), then posts ERC-8004 feedback
  - getDealStatus(nonce): queries chain directly (not just DB)

- [ ] `[P]` Task: Implement deal routes in `packages/server/src/routes/deals.ts` [US4]
  - POST /api/v1/deals/create
  - GET  /api/v1/deals/:nonce/status
  - POST /api/v1/deals/:nonce/complete
  - POST /api/v1/deals/:nonce/dispute

- [ ] Task: Implement x402 middleware in `packages/server/src/middleware/x402Payment.ts` [US4]
  - Integrates @coinbase/x402 SDK
  - paymentMiddleware: wraps routes that require payment
  - payTo set to MaldoEscrowX402 address (NOT server wallet)
  - extraData encodes serviceId for escrow.receivePayment()

- [ ] Task: Implement x402 routes in `packages/server/src/routes/x402.ts` [US4]
  - GET  /x402/services/:capability → 402 with payment requirements
  - POST /x402/services/:capability → process payment + enqueue task + return { dealId, nonce, webhookUrl }
  - GET  /x402/deals/:nonce/result → result or { status: 'pending' }

- [ ] Task: Write Vitest integration tests for deal lifecycle [US4]
  - test: createDeal returns requiresHumanApproval=false for trusted agent (mocked)
  - test: createDeal returns requiresHumanApproval=true for unknown agent
  - test: completeDeal emits ERC-8004 reputation post
  - test: getDealStatus returns correct status from chain

- [ ] Task: Write Python example script `packages/sdk/python/examples/web_native_agent.py` [US4]
  - Uses maldo Python SDK
  - Makes x402 HTTP request with no direct blockchain calls
  - Demonstrates the web-native agent scenario end-to-end
  - Add README explaining how to run it

---

## Phase 5 — Dispute Resolution [US5]

**Goal:** A client can dispute a deal; funds are frozen; MockKleros resolves; outcome is reflected on-chain.
**Checkpoint:** One full dispute cycle on Sepolia with MockKleros. Dispute outcome visible in dashboard and reflected in agent reputation.

- [ ] `[P]` Task: Implement dispute flow in deal service [US5]
  - disputeDeal(nonce, clientAddress, evidenceURI)
    - Calls escrow.dispute(nonce)
    - Calls MockKleros.submitEvidence()
    - Records dispute in DB with status=Pending
  - handleDisputeResolved(event) (triggered by listener)
    - Posts ERC-8004 feedback with "dispute-lost" or "dispute-won" tag
    - Updates dispute record in DB

- [ ] `[P]` Task: Implement POST /api/v1/deals/:nonce/dispute route [US5]
  - Request: { evidenceURI: "ipfs://..." }
  - Calls disputeDeal service
  - Returns { disputeId, status: "Pending" }

- [ ] Task: Add DisputeResolved handler to event listener [US5]
  - On DisputeResolved: call handleDisputeResolved service
  - Update deal status in DB
  - Trigger ERC-8004 reputation post for both parties

- [ ] Task: Write Vitest tests for dispute flow [US5]
  - test: dispute on Funded deal succeeds
  - test: dispute on Completed deal fails
  - test: dispute on Refunded deal fails
  - test: after resolution in client's favor, client balance increases (mocked)
  - test: after resolution, losing agent's dispute rate increases in subgraph

---

## Phase 6 — Ratings & Reputation [US6]

**Goal:** After any completed or resolved deal, ratings can be submitted; Bayesian score updates; ERC-8004 standard used.
**Checkpoint:** Post rating via API; verify on ERC-8004 registry via direct contract read; verify 8004scan.io shows updated score.

- [ ] `[P]` Task: Implement rating service in `packages/server/src/services/rating.ts` [US6]
  - submitRating(dealId, raterAgentId, rateeAgentId, score, comment)
    - Validates deal exists and is Completed or Resolved
    - Validates rater was party to the deal
    - Rejects duplicate rating for same deal+rater
    - Calls ERC-8004 Reputation Registry.postFeedback() on-chain
    - Tags: ["deal-completed", "rating-{score}"] or ["deal-disputed", "resolution-{outcome}"]

- [ ] `[P]` Task: Implement POST /api/v1/agents/:id/rate route [US6]
  - Request: { dealId, raterAgentId, rating, comment }
  - Returns 200 with { txHash, updatedScore }

- [ ] `[P]` Task: Implement GET /api/v1/agents/:id/reputation route [US6]
  - Aggregates from subgraph: bayesian score, review count, dispute rate
  - Includes: vouches list, badges list
  - Returns real-time data (not cached)

- [ ] Task: Write Vitest tests for ratings [US6]
  - test: valid rating from deal participant succeeds
  - test: rating from non-participant is rejected
  - test: duplicate rating for same deal is rejected
  - test: new rating correctly adjusts bayesian score (mock ERC-8004)
  - test: agent with 50×5.0 scores lower than agent with 50×4.8 if volume difference is large (Bayesian)

---

## Phase 7 — Vouching [US7]

**Goal:** An established agent can vouch for another; vouch weight is proportional to voucher reputation; vouch can be withdrawn.
**Checkpoint:** Vouch recorded on-chain (or in ERC-8004 extension); vouched agent's discovery rank increases; withdraw removes rank boost.

- [ ] `[P]` Task: Implement vouch service in `packages/server/src/services/vouch.ts` [US7]
  - submitVouch(voucherAgentId, voucheeAgentId, voucherWallet, signature)
    - Validates EIP-712 signature (voucher signed the vouch off-chain)
    - Validates no self-vouching
    - Records vouch on-chain (or in a Vouch event on MaldoRouter)
    - Weight = voucherBayesianScore × 0.2 (cap at 0.2 per vouch)
  - withdrawVouch(voucherAgentId, voucheeAgentId)
    - Removes vouch record, recalculates rank on next discovery query

- [ ] `[P]` Task: Implement vouch routes [US7]
  - POST /api/v1/agents/:id/vouch → submit vouch
  - DELETE /api/v1/agents/:voucheeId/vouch/:voucherId → withdraw
  - GET /api/v1/agents/:id/vouches → list active vouches

- [ ] Task: Write Vitest tests for vouching [US7]
  - test: self-vouch rejected
  - test: vouch from high-rep agent has higher weight than low-rep agent
  - test: circular vouch (A→B, B→A) does not compound (diminishing returns)
  - test: withdrawing vouch removes it from vouchee's rank calculation

---

## Phase 8 — Dashboard [US8]

**Goal:** Human principal can monitor deals, edit criteria, and approve flagged deals via web UI.
**Checkpoint:** Connect wallet; see active deals; change criteria preset; approve a pending deal in one click.

- [ ] Task: Initialize Next.js 14 app in `packages/dashboard/` [US8]
  - App router, TypeScript, Tailwind CSS
  - Install: wagmi v2, viem, @rainbow-me/rainbowkit
  - Configure wagmi: Sepolia chain, Alchemy/Infura provider

- [ ] `[P]` Task: Implement `/dashboard` page [US8]
  - Fetches active deals via /api/v1/deals (filtered by connected wallet)
  - Shows PendingApprovalCard for flagged deals (prominently, top of page)
  - Shows DealStatusTable for all deals
  - ReputationSummary card for each registered agent

- [ ] `[P]` Task: Implement PendingApprovalCard component [US8]
  - Shows: agent name, reputation, price, reason for flag
  - Two actions: "Approve" (calls /deals/create with manual=true) and "Reject"
  - This is the most critical component for the semi-autonomous UX

- [ ] `[P]` Task: Implement `/dashboard/criteria` page [US8]
  - Shows current preset (pill: Conservative / Balanced / Aggressive)
  - Preset selector with description of each
  - "Advanced" toggle shows custom sliders
  - Impact preview: "With Balanced, X% of test agents would auto-approve"
  - Save button calls PUT /api/v1/principals/:address/criteria

- [ ] `[P]` Task: Implement `/agents` discovery page [US8]
  - Search input for capability
  - Reputation filter slider (min rep)
  - Results grid: AgentCard with name, score, badges, price, "Hire" button

- [ ] `[P]` Task: Implement `/agents/:id` profile page [US8]
  - Agent name, capabilities, reputation score with confidence bar
  - Badges display
  - Vouch list
  - Rating history chart (last 10 ratings)

- [ ] Task: Write Playwright E2E tests for dashboard [US8]
  - test: connect wallet → see empty state with onboarding
  - test: change criteria to Balanced → reload → criteria still Balanced
  - test: pending approval card appears for flagged deal → approve → deal created

---

## Phase 9 — SDK [US4, US2, US3]

**Goal:** TypeScript and Python SDKs allow agents to use Maldo without raw API calls.
**Checkpoint:** Example scripts run end-to-end on Sepolia using SDK only.

- [ ] `[P]` Task: Implement TypeScript SDK core in `packages/sdk/typescript/src/` [US4]
  - MaldoClient class: constructor({ network, signer?, apiKey? })
  - maldo.agents.register(params)
  - maldo.agents.discover(params)
  - maldo.deals.create(params)
  - maldo.deals.complete(nonce)
  - maldo.deals.dispute(nonce, evidenceURI)
  - maldo.criteria.applyPreset(preset)
  - maldo.criteria.evaluate(agentId, price)
  - maldo.x402.request(capability, task, maxPrice)

- [ ] `[P]` Task: Implement Python SDK in `packages/sdk/python/maldo/` [US4]
  - MaldoClient class with same surface area
  - x402 path using requests + maldo x402 support
  - Async variant using aiohttp

- [ ] Task: Write example scripts in `packages/sdk/typescript/examples/` [US4]
  - `01-register-agent.ts` — register a service agent
  - `02-discover-and-hire.ts` — discover agents, hire, confirm
  - `03-dispute.ts` — create deal, dispute, simulate resolution
  - `04-autonomous.ts` — full autonomous flow with criteria evaluation

- [ ] Task: Write Python example `packages/sdk/python/examples/langchain_agent.py` [US4]
  - LangChain agent that uses MaldoTool to autonomously hire a market analyst
  - Demonstrates zero blockchain knowledge from agent perspective

---

## Phase 10 — End-to-End Validation

**Goal:** Run all four user scenarios from spec.md on live Sepolia. Confirm all success criteria met.
**Checkpoint:** All 6 success criteria metrics verified and documented.

- [ ] Task: Execute Scenario A (Fully Autonomous Deal) on Sepolia — document results
- [ ] Task: Execute Scenario B (Human Approval Required) on Sepolia — document results
- [ ] Task: Execute Scenario C (Dispute) on Sepolia with MockKleros — document results
- [ ] Task: Execute Scenario D (Web-Native Python Agent) on Sepolia — document results
- [ ] Task: Verify ERC-8004 data readable on 8004scan.io for at least 2 registered agents
- [ ] Task: Measure and document all 6 success criteria metrics
  - [ ] End-to-end deal time < 10 seconds
  - [ ] x402 payment confirmation < 2 seconds
  - [ ] Auto-approval rate > 70% of test deals
  - [ ] Dispute rate < 10%
  - [ ] Python web-native demo working
  - [ ] Third-party ERC-8004 readability verified
- [ ] Task: Create `docs/quickstart.md` — 5-minute getting started guide for agent developers
- [ ] Task: Create `docs/api-spec.json` — OpenAPI 3.0 spec for all endpoints

---

## Dependency Map

```
Phase 0 (Foundation)
    ↓
Phase 1 (Registration)  ←  requires: 0.2 interfaces, 0.3 contracts, 0.4 server
Phase 2 (Discovery)     ←  requires: Phase 1 (agents to discover), Phase 0 subgraph setup
Phase 3 (Criteria)      ←  requires: Phase 0 server, Phase 2 (reputation data)
Phase 4 (Deals)         ←  requires: Phase 1, Phase 3
Phase 5 (Disputes)      ←  requires: Phase 4
Phase 6 (Ratings)       ←  requires: Phase 4, Phase 5
Phase 7 (Vouching)      ←  requires: Phase 1, Phase 6
Phase 8 (Dashboard)     ←  requires: Phase 1-7 APIs
Phase 9 (SDK)           ←  requires: Phase 4 (API stable)
Phase 10 (Validation)   ←  requires: All phases complete
```

---

## Parallelization Strategy

**Week 1 — Contracts (sequential, critical path):**
All Phase 0 tasks sequential (each depends on previous)

**Week 2 — Server (parallel streams):**
- Stream A: Phase 1 (Registration) → Phase 2 (Discovery)
- Stream B: Phase 3 (Criteria) → Phase 4 (Deals, crypto path)
- Stream C: Phase 4 x402 path (depends on contracts only)

**Week 3 — Integration + UI (parallel streams):**
- Stream A: Phase 5 (Disputes) → Phase 6 (Ratings) → Phase 7 (Vouching)
- Stream B: Phase 8 (Dashboard, can start as soon as APIs are stable)
- Stream C: Phase 9 (SDK, wraps existing APIs)
- Stream D: Phase 10 (validation, as each scenario becomes available)
