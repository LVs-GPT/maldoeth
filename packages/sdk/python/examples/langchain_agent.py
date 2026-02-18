"""
Maldo SDK — LangChain Agent Example
====================================
A LangChain agent that uses MaldoTool to autonomously hire
a market analyst — zero blockchain knowledge from the agent's perspective.

Requirements:
    pip install requests langchain langchain-openai

Usage:
    OPENAI_API_KEY=sk-... python langchain_agent.py
"""

import os
import json
from typing import Optional

# --- Maldo SDK import ---
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from maldo import MaldoClient

# --- LangChain imports ---
try:
    from langchain.tools import BaseTool
    from langchain.agents import AgentExecutor, create_openai_functions_agent
    from langchain_openai import ChatOpenAI
    from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
except ImportError:
    print("Install langchain: pip install langchain langchain-openai")
    exit(1)


MALDO_API = os.getenv("MALDO_API", "http://localhost:3000")
PRINCIPAL = os.getenv("PRINCIPAL", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")


class MaldoDiscoverTool(BaseTool):
    """Discover available AI agents on the Maldo network."""

    name: str = "maldo_discover"
    description: str = (
        "Search for AI service agents by capability. "
        "Returns ranked list with reputation scores and prices. "
        "Input: capability name (e.g. 'market-analysis', 'code-review', 'translation')"
    )

    def _run(self, capability: str) -> str:
        client = MaldoClient(api_url=MALDO_API)
        try:
            result = client.agents.discover(capability=capability.strip())
            agents = result.get("agents", [])
            if not agents:
                return f"No agents found for capability '{capability}'"

            lines = [f"Found {len(agents)} agent(s):"]
            for a in agents:
                rep = a.get("reputation", {})
                lines.append(
                    f"  - {a['name']} (ID: {a['agentId']}) | "
                    f"Score: {rep.get('bayesianScore', 'N/A')} | "
                    f"Reviews: {rep.get('reviewCount', 0)} | "
                    f"Price: ${a.get('basePrice', 0) / 1e6:.2f}"
                )
            return "\n".join(lines)
        except Exception as e:
            return f"Error discovering agents: {e}"


class MaldoHireTool(BaseTool):
    """Hire an AI agent through Maldo's trust layer."""

    name: str = "maldo_hire"
    description: str = (
        "Hire an AI agent to perform a task. Maldo handles escrow, trust evaluation, "
        "and payment automatically. Input should be JSON with: "
        "agentId (string), taskDescription (string), priceUSDC (number in cents, e.g. 50000000 for $50)"
    )

    def _run(self, input_str: str) -> str:
        client = MaldoClient(api_url=MALDO_API)
        try:
            params = json.loads(input_str)
            result = client.deals.create(
                agent_id=params["agentId"],
                client_address=PRINCIPAL,
                price_usdc=params["priceUSDC"],
                task_description=params["taskDescription"],
                principal=PRINCIPAL,
            )

            if result.get("requiresHumanApproval"):
                # Auto-approve for demo
                client.deals.approve(result["pendingApprovalId"])
                return (
                    f"Deal created (required human approval, auto-approved for demo). "
                    f"Approval ID: {result['pendingApprovalId']}"
                )
            return f"Deal created successfully! Nonce: {result.get('nonce', 'N/A')}"
        except Exception as e:
            return f"Error creating deal: {e}"


class MaldoReputationTool(BaseTool):
    """Check an AI agent's reputation on Maldo."""

    name: str = "maldo_reputation"
    description: str = (
        "Check the reputation of an AI agent. Returns Bayesian score, "
        "review count, dispute rate, and badges. Input: agent ID"
    )

    def _run(self, agent_id: str) -> str:
        client = MaldoClient(api_url=MALDO_API)
        try:
            rep = client.agents.reputation(agent_id.strip())
            return (
                f"Agent {rep['agentId']}:\n"
                f"  Score: {rep['score']}\n"
                f"  Bayesian Score: {rep['bayesianScore']}\n"
                f"  Reviews: {rep['reviewCount']}\n"
                f"  Dispute Rate: {rep['disputeRate']}\n"
                f"  Badges: {', '.join(rep.get('badges', [])) or 'None'}"
            )
        except Exception as e:
            return f"Error checking reputation: {e}"


def main():
    print("=" * 60)
    print("Maldo + LangChain: Autonomous Agent Hiring")
    print("The LangChain agent has zero blockchain knowledge.")
    print("Maldo handles trust, escrow, and reputation.")
    print("=" * 60)

    llm = ChatOpenAI(model="gpt-4", temperature=0)

    tools = [MaldoDiscoverTool(), MaldoHireTool(), MaldoReputationTool()]

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a research assistant that can hire specialized AI agents "
            "through the Maldo network. When asked to analyze a topic, first discover "
            "available agents, check their reputation, then hire the best one. "
            "Always check reputation before hiring."
        ),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    agent = create_openai_functions_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

    result = executor.invoke({
        "input": (
            "I need a market analysis of Paraguay's agricultural export sector "
            "for Q1 2026, focusing on soy and wheat. Find the best agent for this, "
            "check their reputation, and hire them. Budget: $50."
        )
    })

    print("\n" + "=" * 60)
    print("RESULT:")
    print("=" * 60)
    print(result["output"])


if __name__ == "__main__":
    if not os.getenv("OPENAI_API_KEY"):
        print("Set OPENAI_API_KEY to run the LangChain agent.")
        print("Or just read the code to see how MaldoTools work!")
        exit(1)
    main()
