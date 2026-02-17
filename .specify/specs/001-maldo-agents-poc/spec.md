# Feature Specification: Maldo Agents PoC

**Branch:** 001-maldo-agents-poc
**Date:** February 2026
**Status:** Ready for Planning
**Author:** Maldo Core Team

---

## Overview

AI agents are already hiring other agents to do specialized work — data collection, research, analysis, code review. But every one of these transactions happens without trust guarantees. There is no escrow, no reputation system that follows the agent across platforms, and no mechanism to dispute a bad outcome.

Maldo provides the trust layer that makes agent-to-agent commerce safe. A client agent can discover a service agent, pay for work, hold funds in escrow until delivery is confirmed, dispute if needed, and have that transaction count toward the service agent's portable reputation — all without a human needing to manually intervene.

This PoC demonstrates the full cycle: discovery → payment → escrow → delivery → completion (or dispute) → reputation update.

---

## Problem Statement

When an AI agent wants to hire another agent for a specialized task:

1. **No verifiable identity**: Any agent can claim any capability. There is no portable, cross-platform identity.
2. **No payment safety**: Paying upfront means trusting blindly. There is no mechanism to hold funds until delivery.
3. **No dispute resolution**: If an agent delivers poor work, there is no recourse — no arbitration, no refund mechanism.
4. **No portable reputation**: Even if one platform tracks ratings, those ratings don't follow the agent elsewhere. Starting fresh on every platform destroys the incentive to build quality.
5. **High barrier for web-native agents**: Agents built without blockchain knowledge cannot participate in on-chain marketplaces, even if they would benefit from the guarantees.

---

## Goals

- Enable an AI agent to discover other agents by capability and reputation
- Enable safe payment for agent services with funds held in escrow until delivery
- Enable autonomous execution for trusted agents meeting user-defined criteria
- Enable dispute initiation when a service is not delivered as agreed
- Enable reputation to accumulate on-chain and be portable across any platform using the same standard
- Enable web-native agents (no blockchain knowledge) to access the same guarantees via HTTP

---

## User Stories

### US1 — Agent Registration and Identity

**As** a developer operating an AI agent that provides services,
**I want** to register my agent with a verifiable on-chain identity that includes my capabilities and pricing,
**So that** other agents can discover me and trust my identity is real and persistent.

**Acceptance Criteria:**
- AC1.1: A service agent can be registered with a name, description, list of capabilities, and a base price
- AC1.2: The registered agent receives a persistent identifier that does not change between transactions
- AC1.3: The agent's identity is resolvable by any compatible system using the public standard — not just Maldo
- AC1.4: The agent's service endpoint is discoverable from the identifier
- AC1.5: Registering an agent does not require the agent to hold or spend a proprietary token
- AC1.6: A web-native agent (no wallet) can be registered by its operator on its behalf

**Edge Cases:**
- Attempting to register an agent with an already-claimed name should fail with a clear error
- Registration should succeed even if the ERC-8004 name registration is done separately or later

---

### US2 — Agent Discovery

**As** a client agent (or its human operator) looking for a specialized service,
**I want** to search for service agents by capability, filter by reputation score, and see pricing,
**So that** I can make an informed decision about which agent to hire without manual curation.

**Acceptance Criteria:**
- AC2.1: Client can search agents by capability keyword (e.g. "market-analysis", "code-review")
- AC2.2: Results are ranked by a composite reputation score that includes rating, number of reviews, and dispute rate
- AC2.3: Each result shows: agent name, capabilities, base price, reputation score, number of completed deals, and dispute rate
- AC2.4: A new agent with zero history appears in results but is ranked below established agents
- AC2.5: Discovery does not require authentication — it is a public read
- AC2.6: Filtering by minimum reputation score is supported

**Edge Cases:**
- Search with no matching agents returns an empty list, not an error
- Agents with active disputes but not yet resolved still appear in results, with dispute status visible

---

### US3 — Agentic Criteria (Programmable Trust Boundaries)

**As** a human principal who operates a client agent,
**I want** to define rules for when my agent can autonomously approve a deal without asking me,
**So that** my agent can operate efficiently on routine tasks while I retain oversight for risky ones.

**Acceptance Criteria:**
- AC3.1: A human principal can configure a minimum reputation score threshold for auto-approval
- AC3.2: A human principal can configure a maximum deal price threshold for auto-approval
- AC3.3: Three preset tiers are available: Conservative (4.8★, max $50), Balanced (4.5★, max $100), Aggressive (4.0★, max $500)
- AC3.4: Custom criteria can be set, overriding presets
- AC3.5: Deals that meet ALL active criteria are executed automatically by the agent without human prompt
- AC3.6: Deals that fail ANY criterion are surfaced to the human principal for explicit approval
- AC3.7: The human principal can always override and approve a deal that failed criteria
- AC3.8: Deals above $100 USDC require explicit human confirmation by default, even if criteria are met, unless the principal has explicitly disabled this safeguard
- AC3.9: The active criteria configuration is stored and persists between agent sessions

**Edge Cases:**
- If criteria configuration is missing or corrupted, system defaults to Conservative
- Changing criteria mid-session does not retroactively affect pending deals

---

### US4 — Deal Creation and Escrow

**As** a client agent (operating under its principal's criteria),
**I want** to initiate a deal with a service agent, with payment held securely until I confirm delivery,
**So that** I am not exposed to losing funds if the service is not delivered.

**Acceptance Criteria:**
- AC4.1: A deal is created by specifying: service agent identifier, task description, and agreed price
- AC4.2: The agreed payment amount is locked in escrow at deal creation — it is not accessible by the service agent until the deal is completed
- AC4.3: The service agent receives a notification (on-chain event) when funds are locked, and can begin work
- AC4.4: The client agent can confirm delivery, releasing escrowed funds to the service agent
- AC4.5: A deal that is not confirmed within 7 days can be refunded to the client agent
- AC4.6: A deal can be created via direct on-chain interaction (crypto-native path)
- AC4.7: A deal can be created via a single HTTP call (x402 path) — the web-native agent never touches blockchain directly

**Edge Cases:**
- Attempting to create a deal with insufficient USDC balance fails before any escrow lock
- Two simultaneous deal creation attempts from the same client for the same service do not conflict

---

### US5 — Dispute Resolution

**As** a client agent whose service was not delivered as agreed,
**I want** to initiate a dispute so that a neutral third party reviews the evidence and decides the outcome,
**So that** I have recourse and am not forced to absorb the loss of a failed service.

**Acceptance Criteria:**
- AC5.1: A client agent can initiate a dispute on any deal that is in "funded" state (not yet completed or refunded)
- AC5.2: Initiating a dispute freezes the escrowed funds — neither party can access them until resolution
- AC5.3: Both parties can submit evidence (text description, links, transaction hashes)
- AC5.4: The dispute is submitted to a neutral arbitration system for resolution
- AC5.5: On resolution in the client's favor: funds are returned to the client
- AC5.6: On resolution in the service agent's favor: funds are released to the service agent
- AC5.7: The dispute outcome is recorded on-chain and reflected in both agents' reputation scores

**Edge Cases:**
- A deal that has already been completed (funds released) cannot be disputed
- A deal that has been refunded due to timeout cannot be disputed

---

### US6 — Reputation and Ratings

**As** a client agent that completed a deal,
**I want** to submit a rating for the service agent, and have that rating reflected in their public reputation score,
**So that** future agents can benefit from my experience when making discovery decisions.

**Acceptance Criteria:**
- AC6.1: After a deal is completed or resolved, the client agent can submit a rating from 1 to 5
- AC6.2: Ratings can only be submitted by agents that participated in a real deal — no anonymous or unlinked ratings
- AC6.3: The service agent can also rate the client agent (bidirectional ratings)
- AC6.4: A new rating updates the agent's Bayesian reputation score, weighted by the agent's total review history
- AC6.5: An agent with 2 reviews of 5.0 ranks lower than an agent with 50 reviews of 4.8 (volume matters)
- AC6.6: Ratings and the resulting scores are publicly readable without authentication
- AC6.7: Ratings submitted via the standard are readable by any third-party system using the same standard

**Edge Cases:**
- Attempting to rate an agent without a completed deal between both parties is rejected
- Duplicate ratings for the same deal from the same party are rejected

---

### US7 — Vouching

**As** an established service agent with a strong reputation,
**I want** to vouch for a newer agent whose quality I can personally attest to,
**So that** that agent can gain initial trust faster without waiting for many completed deals.

**Acceptance Criteria:**
- AC7.1: An agent can vouch for another agent they have not necessarily transacted with
- AC7.2: A vouch from a higher-reputation agent carries more weight than a vouch from a lower-reputation one
- AC7.3: If a vouched agent accrues a dispute or a negative outcome, the voucher's score is negatively affected
- AC7.4: An agent can withdraw a vouch they previously gave
- AC7.5: Vouches are visible in the vouched agent's public profile

**Edge Cases:**
- Self-vouching is not allowed
- Circular vouching rings (A vouches B, B vouches A) have diminishing returns, not compounding rewards

---

### US8 — Monitoring Dashboard

**As** a developer or human principal operating one or more agents,
**I want** a web interface to view the status of my agents' deals, reputation scores, and criteria configuration,
**So that** I can monitor activity and intervene when needed without reading raw blockchain data.

**Acceptance Criteria:**
- AC8.1: Dashboard shows all deals associated with my agent(s): pending, completed, disputed, refunded
- AC8.2: Dashboard shows current reputation score, number of reviews, and dispute rate for each agent
- AC8.3: Dashboard shows current agentic criteria configuration and allows editing it
- AC8.4: Deals that require human approval (failed criteria) are surfaced prominently with a one-click approve/reject action
- AC8.5: Dashboard is read-only for data from the chain — no data is stored in a centralized database for display
- AC8.6: Dashboard connects via wallet (for crypto-native principals) or via API key (for web-native principals)

**Edge Cases:**
- If the chain is slow, dashboard shows last-known state with a timestamp and a "refresh" indicator
- A principal with zero agents sees an empty state with clear onboarding instructions

---

## User Scenarios — End-to-End Flows

### Scenario A: Fully Autonomous Deal (Happy Path)

1. Client agent receives task: "Analyze Paraguay's market conditions"
2. Client queries Maldo discovery API for agents with "market-analysis" capability
3. Discovery returns AgentX (4.9★, 30 deals, $50 base price)
4. Agentic criteria check: reputation 4.9 ≥ 4.5 threshold ✅, price $50 ≤ $100 threshold ✅
5. Deal auto-approved — client sends x402 payment request
6. x402 payment locks $50 USDC in escrow, AgentX receives on-chain notification
7. AgentX performs the analysis and returns the report
8. Client confirms delivery — escrow releases $50 to AgentX
9. Client submits 5-star rating — AgentX reputation updates

### Scenario B: Human Approval Required

1. Client agent finds AgentY (3.8★, 5 deals, $50 base price)
2. Agentic criteria check: reputation 3.8 < 4.5 threshold ❌
3. Deal surfaced to human principal with: agent details, reputation, price, reason for flag
4. Human reviews and approves manually
5. Flow continues as Scenario A from step 5

### Scenario C: Dispute

1. Steps 1-7 from Scenario A
2. Client receives the report but it is incomplete/incorrect
3. Client initiates dispute — funds frozen
4. Both parties submit evidence
5. Arbitration resolves: client wins
6. $50 USDC returned to client, AgentX dispute rate increases, score decreases

### Scenario D: Web-Native Agent (No Wallet)

1. Python script (LangChain agent) makes HTTP GET to `api.maldo.uy/services/market-analysis`
2. Server returns 402 with x402 payment requirements
3. Python script uses x402 client library — signs USDC authorization (operator's wallet, gasless for script)
4. On payment confirmation, deal is created on-chain transparently
5. Script receives result via webhook callback
6. Script confirms delivery via HTTP POST — escrow releases

---

## Success Criteria

| Metric | Target |
|---|---|
| End-to-end deal time (happy path) | < 10 seconds |
| x402 payment confirmation | < 2 seconds |
| Auto-approval rate (agents meeting criteria) | > 70% of test deals |
| Dispute rate in test suite | < 10% |
| Web-native agent integration (zero blockchain code) | Demonstrated with a Python script example |
| On-chain data readable by third-party ERC-8004 tool | Verified via 8004scan.io |

---

## Assumptions

- Ethereum Sepolia is the target network for the PoC (ERC-8004 registries are already deployed there)
- Coinbase's x402 facilitator is available on Sepolia
- Kleros arbitration is available on the target network or a suitable mock is used for PoC
- USDC on Sepolia is available via faucet for testing
- The existing Registry.sol from Arbitrum is redeployable to Sepolia without modification

---

## Out of Scope (PoC)

- Mainnet deployment
- ZK proof validation for task outputs
- Cross-chain reputation bridging
- Mobile app or native desktop client
- DAO governance for fee changes
- Production SLA / uptime guarantees
- Automated market making or liquidity provision
- Any form of native token

---

## Review & Acceptance Checklist

**Content Quality:**
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

**Requirement Completeness:**
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

**Feature Readiness:**
- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows (happy path, approval, dispute, web-native)
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details in spec
