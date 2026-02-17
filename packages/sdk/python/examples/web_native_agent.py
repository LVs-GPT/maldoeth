"""
Maldo SDK — Web-Native Agent Example (Scenario D)
==================================================
Demonstrates that a Python agent with NO blockchain knowledge
can hire a service agent via x402 HTTP payments.

The agent never touches a wallet, never signs a transaction,
never knows about USDC or escrow. The operator's key handles
payment authorization behind the scenes.

Requirements:
    pip install requests eth-account

Usage:
    OPERATOR_KEY=0x... python web_native_agent.py
"""

import os
import time
import requests
from eth_account import Account
from eth_account.messages import encode_defunct

# ─── Config ───────────────────────────────────────────────────────
MALDO_API = os.getenv("MALDO_API", "https://api.maldo.uy")
OPERATOR_KEY = os.getenv("OPERATOR_KEY")  # Human principal's private key
TASK = "Analyze Paraguay's agro-export market for Q1 2026. Focus on soy and wheat."
MAX_PRICE_USDC = 50  # $50 — auto-approves under Balanced criteria


def main():
    print("=" * 60)
    print("Maldo Web-Native Agent — Scenario D")
    print("Zero blockchain code from the agent's perspective.")
    print("=" * 60)

    # ── Step 1: Discover a market-analysis service ──────────────
    print("\n[1/5] Discovering market-analysis agents...")
    r = requests.get(f"{MALDO_API}/api/v1/services/discover", params={
        "capability": "market-analysis",
        "minRep": 4.5,
        "limit": 1
    })
    r.raise_for_status()

    agents = r.json().get("agents", [])
    if not agents:
        print("No agents found. Register one first.")
        return

    agent = agents[0]
    print(f"  Found: {agent['name']} | ⭐ {agent['reputation']['score']} | ${agent['basePrice'] / 1e6:.2f}")

    # ── Step 2: Check agentic criteria ──────────────────────────
    print("\n[2/5] Evaluating against principal's criteria...")
    operator = Account.from_key(OPERATOR_KEY)

    r = requests.post(f"{MALDO_API}/api/v1/criteria/evaluate", json={
        "principal": operator.address,
        "agentId": agent["agentId"],
        "price": int(MAX_PRICE_USDC * 1e6)
    })
    r.raise_for_status()
    evaluation = r.json()

    if not evaluation["autoApprove"]:
        print(f"  ⚠ Human approval required: {evaluation['failedChecks']}")
        print("  (In production: surface this to the human principal's dashboard)")
        return

    print(f"  ✅ Auto-approved — all criteria pass")

    # ── Step 3: Initiate x402 payment request ───────────────────
    print("\n[3/5] Requesting service via x402...")
    r = requests.get(f"{MALDO_API}/x402/services/market-analysis", headers={
        "X-Maldo-Service-Id": str(agent["serviceId"])
    })

    if r.status_code != 402:
        print(f"  Unexpected status: {r.status_code}")
        return

    # Parse x402 payment requirements from header
    import base64, json
    payment_header = r.headers.get("Payment-Required") or r.headers.get("X-Payment-Required")
    requirements = json.loads(base64.b64decode(payment_header + "=="))

    print(f"  Payment required: ${int(requirements['maxAmountRequired']) / 1e6:.2f} USDC")
    print(f"  Pay to: {requirements['payTo']}")

    # ── Step 4: Sign EIP-3009 USDC authorization ────────────────
    print("\n[4/5] Signing USDC authorization (operator key)...")

    # In a real implementation, this uses EIP-3009 transferWithAuthorization
    # For the PoC demo, we sign a simple message
    nonce = os.urandom(32).hex()
    message = encode_defunct(text=f"Maldo payment: {requirements['maxAmountRequired']} USDC to {requirements['payTo']} nonce:{nonce}")
    signed = operator.sign_message(message)

    # ── Step 5: Submit payment + task ───────────────────────────
    print("\n[5/5] Submitting payment and task...")
    r = requests.post(f"{MALDO_API}/x402/services/market-analysis", json={
        "task": TASK,
        "maxPriceUsdc": int(MAX_PRICE_USDC * 1e6),
        "serviceId": agent["serviceId"]
    }, headers={
        "Payment-Signature": signed.signature.hex(),
        "Payment-Nonce": nonce,
        "Payment-Amount": requirements["maxAmountRequired"],
        "Payment-To": requirements["payTo"]
    })

    if r.status_code == 200:
        data = r.json()
        deal_nonce = data["nonce"]
        print(f"  ✅ Deal created: {deal_nonce}")
        print(f"  Deal ID: {data['dealId']}")
        print(f"  Funds locked in escrow on Sepolia ⛓")

        # ── Step 6: Poll for result ──────────────────────────────
        print("\n[6/6] Waiting for service delivery...")
        for attempt in range(30):
            time.sleep(2)
            r = requests.get(f"{MALDO_API}/x402/deals/{deal_nonce}/result")
            result = r.json()

            if result.get("status") == "delivered":
                print("\n✅ Service delivered!")
                print(f"\n{'='*60}")
                print("RESULT:")
                print(f"{'='*60}")
                print(result.get("result", {}).get("content", "No content"))
                print(f"{'='*60}")

                # Auto-confirm delivery (within criteria)
                requests.post(f"{MALDO_API}/api/v1/deals/{deal_nonce}/complete")
                print("\n✅ Delivery confirmed — USDC released to service agent")
                print("✅ ERC-8004 reputation updated")
                return

            print(f"  Waiting... ({attempt + 1}/30)")

        print("  Timeout — deal can be refunded after 7 days")

    else:
        print(f"  Error: {r.status_code} — {r.text}")


if __name__ == "__main__":
    if not OPERATOR_KEY:
        print("Set OPERATOR_KEY environment variable first")
        exit(1)
    main()
