# CLAUDE.md — Maldo Agents PoC

This file tells Claude Code how to work on this project.

## Project Overview

Maldo is a trust layer for AI agent-to-agent commerce on Ethereum.
- **Network:** Sepolia testnet
- **Core contracts:** MaldoEscrowX402.sol + MaldoRouter.sol + MockKleros.sol
- **Spec:** See `.specify/specs/001-maldo-agents-poc/`

## How to Execute Tasks

Always read the spec first:
1. `.specify/memory/constitution.md` — non-negotiable principles
2. `.specify/specs/001-maldo-agents-poc/tasks.md` — task list with phases

Execute one phase at a time. Stop and report after each phase. Do not start Phase N+1 without confirmation.

## Foundry Commands

```bash
# Test contracts (run from packages/contracts/)
forge test -vv

# Test with gas report
forge test --gas-report

# Run a specific test
forge test --match-test test_dispute_buyerWins_fullFlow -vvv

# Check coverage
forge coverage

# Run Slither (install separately: pip install slither-analyzer)
slither src/ --config-file slither.config.json

# Deploy to Sepolia
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
```

## Security Rules (from constitution.md)

ALWAYS:
- CEI pattern on every state-changing function
- ReentrancyGuard on all fund-moving functions
- Custom errors (no require strings)
- Events on every state change
- Immutables for addresses set in constructor

NEVER:
- tx.origin for authorization
- Unbounded loops
- External calls before state updates
- FEE_BPS > MAX_FEE_BPS (500)

## Dispute Flow (Critical)

MockKleros implements IArbitratorV2. MaldoEscrowX402 implements IArbitrableV2.
The full callback chain is:

```
client.dispute() 
  → MaldoEscrowX402.dispute()
    → MockKleros.createDispute()         [pays ETH fee]
      → returns disputeId

[owner calls]
  → MockKleros.giveRuling(disputeId, ruling)
    → MaldoEscrowX402.rule(disputeId, ruling)  [CALLBACK]
      → distributes USDC to winner
```

This pattern is the same as real Kleros. To upgrade to mainnet: 
change the arbitrator address in the constructor. No code changes.

## Contract Addresses (Sepolia — fill after deploy)

```
MOCK_KLEROS_ADDRESS=0x05D54DB4F36dCcf095B0945eB4dDD014bAe17FC2
MALDO_ESCROW_ADDRESS=0x050F6703697727BdE54a8A753a18A1E269F58209
MALDO_ROUTER_ADDRESS=0x3085A84e511063760d22535E22a688E99592520B
```

## Git Worktree Workflow

This project uses git worktrees to work on different areas of the monorepo in parallel.
Each worktree is a full checkout on its own feature branch, but only the relevant packages should be modified.

| Worktree | Branch | Packages |
|----------|--------|----------|
| `wt/contracts` | `feat/contracts-audit` | `packages/contracts/` + `packages/subgraph/` |
| `wt/server` | `feat/server-improvements` | `packages/server/` + `packages/sdk/` |
| `wt/dashboard` | `feat/dashboard-cleanup` | `packages/dashboard/` |

```
/home/user/maldoeth/                              ← session branch (active dev)
/home/user/maldoeth-worktrees/wt/contracts/       ← feat/contracts-audit
/home/user/maldoeth-worktrees/wt/server/          ← feat/server-improvements
/home/user/maldoeth-worktrees/wt/dashboard/       ← feat/dashboard-cleanup
```

**Common commands:**

```bash
# List all worktrees
git worktree list

# Work on contracts
cd /home/user/maldoeth-worktrees/wt/contracts

# Remove a worktree when done
git worktree remove /home/user/maldoeth-worktrees/wt/contracts

# Prune stale worktree references
git worktree prune
```

**Branch flow:**
```
feat/* → develop → main (manual push only)
```

- Feature branches merge into `develop` via PR
- `develop` merges into `main` manually from GitHub
- Never push directly to `main`

## Key Invariants (must hold in all tests)

1. `deal.fee + deal.amount == totalPaid` — no USDC is ever lost
2. `deal.fee / totalPaid <= MAX_FEE_BPS / 10_000` — fee never exceeds 5%
3. Once `status != Funded`, no further state changes possible
4. Only `arbitrator` can call `rule()` — no other address
5. `refundTimeout` only works after `TIMEOUT = 7 days`
