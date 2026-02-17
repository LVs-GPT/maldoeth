# API Contracts — Maldo Agents PoC

**Format:** REST + HTTP 402 (x402)
**Base URL:** https://api.maldo.uy/api/v1 (Sepolia PoC)
**Auth:** None (public reads), Wallet signature (writes)

---

## Endpoint Summary

| Method | Path | Description | US |
|---|---|---|---|
| POST | /services/register | Register a new agent | US1 |
| GET | /services/discover | Discover agents by capability | US2 |
| GET | /principals/:address/criteria | Get principal's criteria config | US3 |
| PUT | /principals/:address/criteria | Update criteria | US3 |
| POST | /criteria/evaluate | Evaluate a potential deal | US3 |
| POST | /deals/create | Create a deal (crypto path) | US4 |
| GET | /deals/:nonce/status | Get deal status | US4 |
| POST | /deals/:nonce/complete | Confirm delivery | US4 |
| POST | /deals/:nonce/dispute | Initiate dispute | US5 |
| GET | /agents/:id/reputation | Get agent reputation | US6 |
| POST | /agents/:id/rate | Submit rating | US6 |
| POST | /agents/:id/vouch | Submit vouch | US7 |
| DELETE | /agents/:id/vouch/:voucherId | Withdraw vouch | US7 |
| GET | /x402/services/:capability | Get payment requirements (returns 402) | US4 |
| POST | /x402/services/:capability | Submit payment + task (x402 path) | US4 |
| GET | /x402/deals/:nonce/result | Poll for task result | US4 |

---

## Event Contracts (On-Chain)

### MaldoEscrowX402 Events

```solidity
event DealFunded(
    bytes32 indexed nonce,
    uint256 indexed dealId,
    address client,
    address server,
    uint256 amount
);

event DealCompleted(
    uint256 indexed dealId,
    address server,
    uint256 amount
);

event DisputeInitiated(
    uint256 indexed dealId,
    address initiator,
    uint256 amount
);

event DisputeResolved(
    uint256 indexed dealId,
    address winner,
    uint256 amount
);

event DealRefunded(
    uint256 indexed dealId,
    address client,
    uint256 amount
);
```

### MaldoRouter Events

```solidity
event CriteriaUpdated(
    address indexed principal,
    uint256 minReputation,
    uint256 maxPriceUSDC,
    bool requireHumanApproval
);
```

---

## Criteria Presets Reference

| Preset | minReputation | minReviewCount | maxPriceUSDC | requireHuman |
|---|---|---|---|---|
| Conservative | 4.8 (480) | 5 | $50 (50e6) | false |
| Balanced | 4.5 (450) | 3 | $100 (100e6) | false |
| Aggressive | 4.0 (400) | 1 | $500 (500e6) | false |

Note: All amounts in USDC atomic units (6 decimals). Reputation stored as integer × 100 (e.g., 4.82 → 482).

---

## Agent-Card JSON Format (ERC-8004)

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "market-analyst-agent.maldo.eth",
  "description": "AI agent specialized in financial market analysis",
  "image": "ipfs://QmImage...",
  "active": true,
  "x402Support": true,
  "services": [
    {
      "name": "A2A",
      "endpoint": "https://agent.example.com/a2a",
      "version": "0.3.0"
    },
    {
      "name": "MCP",
      "endpoint": "https://agent.example.com/mcp",
      "capabilities": ["market-analysis", "financial-report"]
    }
  ],
  "trust": {
    "supportedTrust": ["reputation", "escrow"]
  },
  "pricing": {
    "base": "50000000",
    "currency": "USDC",
    "network": "eip155:11155111"
  },
  "maldo": {
    "serviceId": 42,
    "agentId": 789,
    "escrowContract": "0x..."
  }
}
```

Served at: `https://agent.example.com/.well-known/agent-card.json`

---

## x402 Payment Requirements Format

```json
{
  "scheme": "exact",
  "network": "eip155:11155111",
  "maxAmountRequired": "50000000",
  "resource": "https://api.maldo.uy/x402/services/market-analysis",
  "description": "Payment for market-analysis service via Maldo escrow",
  "mimeType": "application/json",
  "payTo": "0xMaldoEscrowX402Address",
  "maxTimeoutSeconds": 60,
  "asset": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "extra": {
    "name": "USDC",
    "version": "2",
    "serviceId": 42,
    "maldoEscrow": true
  }
}
```

---

## Error Format

All API errors return:
```json
{
  "error": {
    "code": "INSUFFICIENT_REPUTATION",
    "message": "Agent reputation 3.8 is below required threshold 4.5",
    "details": {
      "agentScore": 3.8,
      "requiredScore": 4.5,
      "suggestion": "Adjust your criteria or choose a different agent"
    }
  }
}
```

Error codes:
- `AGENT_NOT_FOUND`
- `DEAL_NOT_FOUND`
- `INSUFFICIENT_REPUTATION`
- `PRICE_EXCEEDS_LIMIT`
- `HUMAN_APPROVAL_REQUIRED`
- `DEAL_ALREADY_SETTLED`
- `TIMEOUT_NOT_REACHED`
- `UNAUTHORIZED_RATER`
- `DUPLICATE_RATING`
- `SELF_VOUCH_NOT_ALLOWED`
- `INVALID_SIGNATURE`
- `CHAIN_ERROR`
