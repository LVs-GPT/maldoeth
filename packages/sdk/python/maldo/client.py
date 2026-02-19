"""
Maldo Python SDK Client

Wraps the Maldo REST API for Python agents.
Supports both sync (requests) and async (aiohttp) usage.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional

import requests


class MaldoApiError(Exception):
    """Raised when the Maldo API returns an error."""

    def __init__(self, status: int, message: str):
        self.status = status
        super().__init__(f"[{status}] {message}")


@dataclass
class AgentNamespace:
    """Agent-related operations."""

    _client: "MaldoClient"

    def register(
        self,
        name: str,
        capabilities: list[str],
        wallet: str,
        description: str = "",
        base_price: int = 0,
        endpoint: str = "",
    ) -> dict:
        return self._client._post(
            "/api/v1/services/register",
            {
                "name": name,
                "description": description,
                "capabilities": capabilities,
                "basePrice": base_price,
                "endpoint": endpoint,
                "wallet": wallet,
            },
        )

    def discover(
        self,
        capability: str,
        min_rep: Optional[int] = None,
        limit: int = 10,
    ) -> dict:
        params = {"capability": capability, "limit": str(limit)}
        if min_rep is not None:
            params["minRep"] = str(min_rep)
        return self._client._get("/api/v1/services/discover", params=params)

    def get(self, agent_id: str) -> dict:
        return self._client._get(f"/api/v1/agents/{agent_id}")

    def list(self) -> dict:
        return self._client._get("/api/v1/agents")

    def reputation(self, agent_id: str) -> dict:
        return self._client._get(f"/api/v1/agents/{agent_id}/reputation")

    def rate(
        self,
        agent_id: str,
        deal_nonce: str,
        rater_address: str,
        score: int,
        comment: str = "",
    ) -> dict:
        return self._client._post(
            f"/api/v1/agents/{agent_id}/rate",
            {
                "dealNonce": deal_nonce,
                "raterAddress": rater_address,
                "score": score,
                "comment": comment,
            },
        )

    def vouch(
        self,
        vouchee_agent_id: str,
        voucher_agent_id: str,
        voucher_wallet: str,
        signature: str,
    ) -> dict:
        return self._client._post(
            f"/api/v1/agents/{vouchee_agent_id}/vouch",
            {
                "voucherAgentId": voucher_agent_id,
                "voucherWallet": voucher_wallet,
                "signature": signature,
            },
        )

    def vouches(self, agent_id: str) -> dict:
        return self._client._get(f"/api/v1/agents/{agent_id}/vouches")


@dataclass
class DealNamespace:
    """Deal-related operations."""

    _client: "MaldoClient"

    def create(
        self,
        agent_id: str,
        client_address: str,
        price_usdc: int,
        task_description: str,
        principal: Optional[str] = None,
    ) -> dict:
        body: dict[str, Any] = {
            "agentId": agent_id,
            "clientAddress": client_address,
            "priceUSDC": price_usdc,
            "taskDescription": task_description,
        }
        if principal:
            body["principal"] = principal
        return self._client._post("/api/v1/deals/create", body)

    def status(self, nonce: str) -> dict:
        return self._client._get(f"/api/v1/deals/{nonce}/status")

    def approve(self, approval_id: int) -> dict:
        return self._client._post(f"/api/v1/deals/approve/{approval_id}", {})

    def reject(self, approval_id: int) -> dict:
        return self._client._post(f"/api/v1/deals/reject/{approval_id}", {})

    def pending(self, principal: str) -> dict:
        return self._client._get(f"/api/v1/deals/pending/{principal}")

    def list(self) -> dict:
        return self._client._get("/api/v1/deals")


@dataclass
class CriteriaNamespace:
    """Criteria (trust boundary) operations."""

    _client: "MaldoClient"

    def get(self, principal: str) -> dict:
        return self._client._get(f"/api/v1/principals/{principal}/criteria")

    def apply_preset(self, principal: str, preset: str) -> dict:
        return self._client._put(
            f"/api/v1/principals/{principal}/criteria",
            {"preset": preset},
        )

    def evaluate(self, principal: str, agent_id: str, price: int) -> dict:
        return self._client._post(
            "/api/v1/criteria/evaluate",
            {"principal": principal, "agentId": agent_id, "price": price},
        )


@dataclass
class X402Namespace:
    """x402 web-native payment path."""

    _client: "MaldoClient"

    def get_requirements(self, capability: str) -> dict:
        """Get payment requirements (returns 402 response body)."""
        res = requests.get(f"{self._client.base_url}/x402/services/{capability}")
        return res.json()

    def request(
        self,
        capability: str,
        task_description: str,
        client_address: str,
        max_price: Optional[int] = None,
    ) -> dict:
        # Check requirements first
        reqs = self.get_requirements(capability)
        if max_price and int(reqs.get("requirements", {}).get("amount", 0)) > max_price:
            raise MaldoApiError(
                402,
                f"Price {reqs['requirements']['amount']} exceeds max {max_price}",
            )

        return self._client._post(
            f"/x402/services/{capability}",
            {
                "taskDescription": task_description,
                "clientAddress": client_address,
            },
        )

    def poll_result(self, nonce: str) -> dict:
        return self._client._get(f"/x402/deals/{nonce}/result")


class MaldoClient:
    """
    Maldo SDK client for Python agents.

    Usage:
        client = MaldoClient(api_url="http://localhost:3000")
        agents = client.agents.discover(capability="market-analysis")
    """

    def __init__(self, api_url: str = "http://localhost:3000"):
        self.base_url = api_url.rstrip("/")
        self.agents = AgentNamespace(_client=self)
        self.deals = DealNamespace(_client=self)
        self.criteria = CriteriaNamespace(_client=self)
        self.x402 = X402Namespace(_client=self)

    def health(self) -> dict:
        return self._get("/health")

    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        res = requests.get(f"{self.base_url}{path}", params=params)
        if not res.ok:
            body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            raise MaldoApiError(res.status_code, body.get("error", res.reason))
        return res.json()

    def _post(self, path: str, body: dict) -> dict:
        res = requests.post(
            f"{self.base_url}{path}",
            json=body,
            headers={"Content-Type": "application/json"},
        )
        if not res.ok and res.status_code != 402:
            data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            raise MaldoApiError(res.status_code, data.get("error", res.reason))
        return res.json()

    def _put(self, path: str, body: dict) -> dict:
        res = requests.put(
            f"{self.base_url}{path}",
            json=body,
            headers={"Content-Type": "application/json"},
        )
        if not res.ok:
            data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            raise MaldoApiError(res.status_code, data.get("error", res.reason))
        return res.json()

    def _delete(self, path: str) -> dict:
        res = requests.delete(f"{self.base_url}{path}")
        if not res.ok:
            data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            raise MaldoApiError(res.status_code, data.get("error", res.reason))
        return res.json()
