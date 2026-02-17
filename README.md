# Maldo — Trust Layer for Agent Commerce

> AI agents can hire other agents. Now with real on-chain guarantees.

**ERC-8004 · x402 · Kleros (MockKleros for PoC)**

## What is Maldo?

Maldo is the trust infrastructure layer for AI agent-to-agent commerce. It composes three open protocols:

- **ERC-8004** — portable identity and reputation for agents
- **x402** — HTTP-native USDC payments (Coinbase protocol, gasless for clients)
- **Kleros** — decentralized dispute arbitration (MockKleros for PoC, real Kleros for mainnet)

No native token. 1% fee, 5% max hardcoded in contract.

## Network

**Sepolia testnet** (PoC). Mainnet after audit.

## Contracts (Sepolia)

| Contract | Address |
|---|---|
| ERC-8004 Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| MaldoEscrowX402 | `deploying...` |
| MaldoRouter | `deploying...` |
| MockKleros | `deploying...` |

## Repository Structure

```
maldoeth/
├── packages/
│   ├── contracts/          # Solidity smart contracts (Foundry)
│   │   ├── src/
│   │   │   ├── MaldoEscrowX402.sol   # Core escrow + x402 + Kleros
│   │   │   ├── MaldoRouter.sol       # Fee logic + agentic criteria
│   │   │   ├── interfaces/
│   │   │   │   ├── IERC8004.sol      # Agent identity interface
│   │   │   │   └── IArbitrableV2.sol # Kleros arbitration interface
│   │   │   └── mocks/
│   │   │       └── MockKleros.sol    # Simulates Kleros for PoC
│   │   ├── test/
│   │   │   └── MaldoEscrowX402.t.sol # Full test suite
│   │   ├── script/
│   │   │   └── Deploy.s.sol          # Deployment script (Sepolia)
│   │   └── foundry.toml
│   └── sdk/
│       └── python/
│           └── examples/
│               └── web_native_agent.py  # Example AI agent using x402
├── .specify/                # Specs & memory for Claude Code
│   ├── memory/
│   │   └── constitution.md  # Non-negotiable engineering principles
│   └── specs/001-maldo-agents-poc/
│       ├── spec.md          # Functional requirements (8 user stories)
│       ├── plan.md          # Technical implementation plan
│       ├── tasks.md         # Executable task list
│       ├── data-model.md    # On-chain data model
│       ├── quickstart.md    # Dev quickstart
│       └── contracts/
│           └── api-contracts.md
├── CLAUDE.md               # Instructions for Claude Code
├── README.md               # This file
├── package.json            # pnpm workspace root
└── .env.example            # Required environment variables
```

## Quick Start

```bash
# Install
pnpm install

# Copy env
cp .env.example .env
# Fill: SEPOLIA_RPC_URL, PRIVATE_KEY

# Run contract tests
cd packages/contracts && forge test -vv

# Deploy to Sepolia
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
```

## Architecture

```
Layer 0 (Existing, untouched):
  ERC-8004 Identity + Reputation Registries (Sepolia)
  x402 Facilitator (Coinbase)

Layer 1 (Maldo contracts):
  MaldoEscrowX402   ← receives x402 payments, manages escrow, integrates MockKleros
  MaldoRouter       ← agentic criteria engine, fee logic, x402 requirements

Layer 2 (Off-chain):
  API Server (Node.js)         [Phase 5 — coming soon]
  Event Listener (ethers.js)   [Phase 6 — coming soon]

Layer 3 (Interfaces):
  Dashboard (Next.js)          [Phase 8 — coming soon]
  SDK (@maldo/sdk)             [Phase 9 — coming soon]
```

## Dispute Flow (PoC)

Disputes use `MockKleros` which implements the full `IArbitrableV2` interface:

1. Client calls `dispute()` → funds frozen → `MockKleros.createDispute()` called
2. Both parties submit evidence via `submitEvidence()`
3. Owner calls `MockKleros.giveRuling(disputeId, ruling)` to simulate Kleros
4. `MockKleros` calls back `MaldoEscrowX402.rule()` with the ruling
5. Funds distributed: winner gets USDC, losing arbitration fee returned

In mainnet: replace `MockKleros` address with real Kleros arbitrator on target chain.

## Key Invariants

1. `deal.fee + deal.amount == totalPaid` — no USDC is ever lost
2. `deal.fee / totalPaid <= MAX_FEE_BPS / 10_000` — fee never exceeds 5%
3. Once `status != Funded`, no further state changes possible
4. Only `arbitrator` can call `rule()` — no other address
5. `refundTimeout` only works after `TIMEOUT = 7 days`

## License

MIT
