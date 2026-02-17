# Quickstart Validation — Maldo Agents PoC

How to verify the PoC is working end-to-end on Sepolia.

---

## Prerequisites

```bash
# Install dependencies
pnpm install

# Set environment variables
cp .env.example .env
# Fill in: SEPOLIA_RPC_URL, PRIVATE_KEY (operator wallet with Sepolia ETH + USDC)

# Fund test wallets (need Sepolia ETH + USDC)
# ETH: https://sepoliafaucet.com
# USDC: https://faucet.circle.com (Sepolia)
```

---

## Validation 1 — Contracts Deployed

```bash
cd packages/contracts
forge test --fork-url $SEPOLIA_RPC_URL -vv

# Expected: All tests pass
# Check: deployments/sepolia.json has all 3 addresses
```

---

## Validation 2 — Register an Agent

```bash
cd packages/sdk/typescript
ts-node examples/01-register-agent.ts

# Expected output:
# ✅ Service registered: serviceId=1
# ✅ ERC-8004 NFT minted: agentId=42
# ✅ Agent card published: ipfs://Qm...
# ✅ Verify at: https://8004scan.io/agents/42
```

---

## Validation 3 — Discover Agents

```bash
curl "https://api.maldo.uy/api/v1/services/discover?capability=market-analysis"

# Expected: JSON array with registered agent, ranked by score
# New agent score will be low (bayesian prior) — normal
```

---

## Validation 4 — Full Autonomous Deal (Scenario A)

```bash
ts-node examples/02-discover-and-hire.ts

# Expected output:
# ✅ Criteria check: autoApprove=true (Balanced preset)
# ✅ x402 payment sent — confirmed in <2 seconds
# ✅ DealFunded event received — funds locked in escrow
# ✅ Service delivered (mock result)
# ✅ Deal completed — funds released to server
# ✅ Rating submitted — ERC-8004 reputation updated
# ✅ Total time: <10 seconds
```

---

## Validation 5 — Web-Native Python Agent (Scenario D)

```bash
cd packages/sdk/python
pip install -e .
python examples/web_native_agent.py

# Expected output:
# ✅ No blockchain code in this script
# ✅ HTTP GET returned 402 with payment requirements
# ✅ x402 client signed and submitted payment
# ✅ Deal created on-chain (visible on Etherscan Sepolia)
# ✅ Result received via webhook
```

---

## Validation 6 — Dispute Flow (Scenario C)

```bash
ts-node examples/03-dispute.ts

# Expected output:
# ✅ Deal funded
# ✅ Dispute initiated — funds frozen
# ✅ Evidence submitted to MockKleros
# ✅ MockKleros resolves in client's favor
# ✅ USDC returned to client
# ✅ Agent dispute rate increased in subgraph
```

---

## Validation 7 — ERC-8004 Third-Party Readability

```bash
# Verify on 8004scan.io
open https://8004scan.io/agents/<agentId>

# Verify via direct contract read
cast call $REPUTATION_REGISTRY "getSummary(uint256)" <agentId> \
  --rpc-url $SEPOLIA_RPC_URL

# Expected: averageValue and feedbackCount non-zero after Validation 4
```

---

## Validation 8 — Dashboard

```bash
cd packages/dashboard
pnpm dev

# Open: http://localhost:3000
# Connect wallet (MetaMask, Sepolia network)
# Expected:
# ✅ Active deals visible
# ✅ Criteria editor works (change to Balanced, reload, still Balanced)
# ✅ Agent discovery shows registered agent
```

---

## Success Criteria Scorecard

| Criterion | Target | Result | Pass? |
|---|---|---|---|
| End-to-end deal time | < 10s | ___s | [ ] |
| x402 confirmation | < 2s | ___s | [ ] |
| Auto-approval rate | > 70% | __% | [ ] |
| Dispute rate | < 10% | __% | [ ] |
| Python web-native demo | Working | ___| [ ] |
| ERC-8004 third-party read | Verified | ___| [ ] |
