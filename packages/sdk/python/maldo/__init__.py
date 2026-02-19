"""
Maldo Python SDK — Trust layer for AI agent-to-agent commerce.

Usage:
    from maldo import MaldoClient

    client = MaldoClient(api_url="http://localhost:3000")
    agents = client.agents.discover(capability="market-analysis")
"""

from maldo.client import MaldoClient, MaldoApiError

__all__ = ["MaldoClient", "MaldoApiError"]
__version__ = "0.1.0"
