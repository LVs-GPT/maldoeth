# Maldo Agents PoC — Project Constitution

**Project:** Maldo for Agents — Trust Layer for Agentic Commerce
**Version:** 1.0
**Date:** February 2026
**Status:** Governing document — non-negotiable

---

## 1. Mission

Build the trust infrastructure layer that enables AI agents to transact with each other safely and autonomously, using open standards and real economic guarantees — not walled gardens.

---

## 2. Non-Negotiable Principles

### 2.1 Open Standards Over Proprietary Lock-in

- **MUST** use ERC-8004 for agent identity and reputation (official mainnet registries)
- **MUST** use x402 for HTTP-native payments (Coinbase protocol, no forks)
- **MUST** use Kleros for dispute arbitration (no custom juries)
- **MUST NOT** invent new token standards, identity formats, or payment protocols
- **MUST NOT** require a proprietary token — USDC only

### 2.2 Wrapper Architecture Over Rewrites

- **MUST** wrap the existing Registry.sol (deployed on Arbitrum One, verified) without modifying it
- **MUST** add functionality via satellite contracts, not by changing core registry logic
- **MUST NOT** rewrite or fork Registry.sol, Kleros, ERC-8004 registries, or x402 facilitator
- New contracts are wrappers and adapters — never replacements

### 2.3 Security-First, Always

- **MUST** follow Checks-Effects-Interactions (CEI) pattern in every state-changing function
- **MUST** use OpenZeppelin's ReentrancyGuard on all external-call functions
- **MUST** use custom errors (not require strings) for gas efficiency
- **MUST** emit events for every state change (auditability)
- **MUST NOT** use tx.origin for authorization — only msg.sender
- **MUST NOT** have unbounded loops that could cause DoS
- Fee cap of 5% is **hardcoded** in contract — MUST NOT be overrideable by any role

### 2.4 Dual Entry: Crypto-Native AND Web-Native

- **MUST** support blockchain-native agents (wallets, direct contract calls)
- **MUST** support web-native agents (Python scripts, LangChain, n8n) via x402 HTTP API
- **MUST NOT** require any agent to understand blockchain to use Maldo
- x402 path MUST produce identical on-chain guarantees as direct contract path

### 2.5 Organic Reputation — Never Curated

- **MUST** compute reputation automatically from on-chain data only
- **MUST NOT** allow Maldo team to manually approve, ban, or rank agents
- Bayesian score, vouching, and badges are **always computed** — never granted
- Discovery ranking MUST be derived 100% from on-chain data via subgraph

### 2.6 Programmable Trust Boundaries (Agentic Criteria)

- **MUST** allow human principals to define automation thresholds (reputation, price, risk)
- **MUST** support three preset tiers: Conservative, Balanced, Aggressive
- **MUST** default to Conservative for new users
- Human override **MUST** always be available — no forced automation
- High-value threshold (>$100 USDC) **MUST** always require explicit confirmation by default

### 2.7 Fee Transparency

- Default fee: 1% per deal
- Maximum fee: 5% — hardcoded in contract, immutable
- **MUST** be visible on-chain at all times
- **MUST NOT** have hidden fees, withdrawal fees, or gas subsidies from user funds

### 2.8 PoC Scope Discipline

- **MUST NOT** build features outside the PoC scope during this phase
- **MUST NOT** add "nice to have" features that delay core functionality
- Every feature **MUST** trace back to a user story in spec.md
- Target: functional PoC on Ethereum Sepolia in 3 weeks
- Audit and mainnet deployment are explicitly OUT OF SCOPE for PoC

### 2.9 Documentation Separation of Concerns

- **spec.md**: WHAT and WHY — technology-agnostic, for product/business stakeholders
- **plan.md**: HOW — all technical decisions, stack, architecture
- **tasks.md**: executable task list for implementation agent
- Technical details in spec.md are a blocker — must be removed

---

## 3. Architectural Constraints

```
Layer 0 (Existing, DO NOT MODIFY):
  Registry.sol — Arbitrum One (0xB55d05a...)
  Kleros Escrow v2
  ERC-8004 Identity Registry (Sepolia: 0x8004A818...)
  ERC-8004 Reputation Registry (Sepolia: 0x8004B663...)
  x402 Facilitator (Coinbase, https://www.x402.org/facilitator)

Layer 1 (New Satellite Contracts):
  MaldoEscrowX402.sol — wraps Registry + receives x402 payments
  MaldoRouter.sol — fee logic + agentic criteria engine

Layer 2 (Off-chain Services):
  API Server (Node.js/TypeScript)
  Event Listener (ethers.js)
  x402 HTTP Middleware

Layer 3 (Interfaces):
  Dashboard (monitoring, NOT primary interface)
  SDK (@maldo/sdk — TypeScript + Python)
```

---

## 4. Definition of Done for PoC

A feature is DONE when:
- [ ] Smart contract function compiles and passes unit tests
- [ ] Integration test covers the happy path end-to-end
- [ ] Event is emitted and captured by listener
- [ ] API endpoint returns correct response
- [ ] Works via both crypto-native path AND x402 HTTP path (where applicable)

---

## 5. Out of Scope (PoC)

- Mainnet deployment
- External security audit
- Mobile app
- DAO governance
- Token launch
- ZK proof validation
- Cross-chain reputation bridging
- Production monitoring/alerting infrastructure
- Marketing website
