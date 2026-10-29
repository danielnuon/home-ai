"""Owner identity, CSRF, security headers and fail-closed configuration (spec 7.1, 7.6)."""

import pytest
from fastapi.testclient import TestClient

from control_center.app import create_app
from control_center.config import ConfigError, load_config
from tests.control_center.conftest import make_config

OWNER = "owner@example.com"


@pytest.fixture
def tailnet_client() -> TestClient:
    """A client against an app that requires the Owner's Tailscale login."""
    return TestClient(create_app(make_config(dev_identity=False, owner_login=OWNER)))


def test_requests_without_the_owner_login_are_refused(tailnet_client: TestClient) -> None:
    """Spec 7.1: only the Owner's Tailscale identity gets an answer."""
    assert tailnet_client.get("/api/today").status_code == 403
    stranger = {"Tailscale-User-Login": "someone@example.com"}
    assert tailnet_client.get("/api/today", headers=stranger).status_code == 403
    assert (
        tailnet_client.get("/api/today", headers={"Tailscale-User-Login": OWNER}).status_code == 200
    )


def test_state_changes_need_the_csrf_token(client: TestClient) -> None:
    """Spec 7.6: every state-changing request carries the CSRF token."""
    del client.headers["X-CSRF-Token"]
    assert client.post("/api/platform/stop").status_code == 403

    client.headers["X-CSRF-Token"] = "wrong"
    assert client.post("/api/platform/stop").status_code == 403


def test_every_response_carries_the_strict_policy(client: TestClient) -> None:
    """Spec 7.6: every response sets the strict content security policy."""
    headers = client.get("/api/today").headers

    assert "script-src 'self'" in headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert headers["X-Content-Type-Options"] == "nosniff"


@pytest.mark.parametrize(
    "env",
    [
        {"BRAIN_BACKENDS": "real", "BRAIN_DEV_IDENTITY": "1"},
        {"BRAIN_DEV_IDENTITY": "1", "BRAIN_HOST": "0.0.0.0"},  # binding beyond loopback
        {},  # neither a dev identity nor an Owner login
    ],
)
def test_unsafe_configuration_stops_start_up(env: dict[str, str]) -> None:
    """Spec 7.6: Brain fails closed when its configuration is unsafe."""
    with pytest.raises(ConfigError):
        load_config(env)


def test_health_answers_without_identity(tailnet_client: TestClient) -> None:
    """Spec 7.6: the health check answers without an identity so the watchdog can reach it."""
    body = tailnet_client.get("/health").json()

    assert body["status"] == "ok"
    assert body["checks"][0]["name"] == "backends"
