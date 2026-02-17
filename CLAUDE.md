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
MOCK_KLEROS_ADDRESS=
MALDO_ESCROW_ADDRESS=
MALDO_ROUTER_ADDRESS=
```

## Key Invariants (must hold in all tests)

1. `deal.fee + deal.amount == totalPaid` — no USDC is ever lost
2. `deal.fee / totalPaid <= MAX_FEE_BPS / 10_000` — fee never exceeds 5%
3. Once `status != Funded`, no further state changes possible
4. Only `arbitrator` can call `rule()` — no other address
5. `refundTimeout` only works after `TIMEOUT = 7 days`
