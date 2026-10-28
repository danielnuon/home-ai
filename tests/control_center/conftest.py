"""Shared fixtures: an app on mock backends, and a client that has opened a session."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from control_center.app import create_app
from control_center.config import Config


def make_config(*, dev_identity: bool = True, owner_login: str | None = None) -> Config:
    """A loopback config with no built front end."""
    return Config(
        backends="mock",
        dev_identity=dev_identity,
        owner_login=owner_login,
        host="127.0.0.1",
        port=8406,
        web_dist=Path("/nonexistent"),
    )


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A client with a session open and its CSRF token set on every request."""
    with TestClient(create_app(make_config())) as test_client:
        token = test_client.get("/api/session").json()["csrf_token"]
        test_client.headers["X-CSRF-Token"] = token
        yield test_client


def step_up(client: TestClient) -> str:
    """Run the mock passkey round and return a fresh proof."""
    challenge = client.post("/api/step-up/challenge").json()["challenge"]
    answer = client.post(
        "/api/step-up/verify", json={"challenge": challenge, "assertion": f"virtual:{challenge}"}
    )
    proof: str = answer.json()["proof"]
    return proof
