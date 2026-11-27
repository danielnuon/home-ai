"""Every page's data answers, matches its contract, and the front end is served safely."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from control_center.app import create_app
from tests.control_center.conftest import make_config

PAGES = [
    "/api/v1/platform",
    "/api/v1/today",
    "/api/v1/approvals",
    "/api/v1/decisions",
    "/api/v1/settings",
    "/api/v1/contacts",
    "/api/v1/live",
    "/api/v1/live/T-5521",
    "/api/v1/work",
    "/api/v1/directory",
    "/api/v1/personal",
    "/api/v1/finance/owner",
    "/api/v1/finance/mom",
    "/api/v1/setup",
    "/api/v1/search?q=patel",
    "/api/v1/chat/atlas",
    "/api/v1/system",
    "/api/v1/services",
    "/api/v1/models",
    "/api/v1/spend",
    "/api/v1/schedule",
    "/api/v1/security",
    "/api/v1/backups",
    "/api/v1/maintenance",
    "/api/v1/connections",
    "/api/v1/voice",
    "/api/v1/docs",
]


@pytest.mark.parametrize("path", PAGES)
def test_every_page_answers(client: TestClient, path: str) -> None:
    """Spec 7.2: every page has a data endpoint that answers."""
    assert client.get(path).status_code == 200


def test_chat_stores_the_owner_message(client: TestClient) -> None:
    """Spec 7.7: a message continues the thread it was sent in."""
    thread = client.post(
        "/api/v1/chat/atlas", json={"text": "What's on today?", "thread_id": "TH-0216"}
    ).json()

    assert thread["thread"]["id"] == "TH-0216"
    assert any(m["text"] == "What's on today?" for m in thread["messages"])


def test_a_new_chat_starts_a_conversation_thread(client: TestClient) -> None:
    """Spec 15.8.9, Chat: New starts a thread, titled from the first words, in the lead's list."""
    before = client.get("/api/v1/chat/atlas").json()
    sent = client.post(
        "/api/v1/chat/atlas", json={"text": "Plan the week of the eighth for me please"}
    ).json()

    assert before["thread"] is None and before["messages"] == []
    assert sent["thread"]["kind"] == "conversation"
    assert sent["thread"]["title"] == "Plan the week of the eighth…"
    assert sent["thread"]["id"] in [t["id"] for t in sent["threads"]]
    assert all(m["thread_id"] == sent["thread"]["id"] for m in sent["messages"])


def test_chat_lists_only_the_leads_own_threads(client: TestClient) -> None:
    """Spec 15.8.9, Chat: each lead lists its own threads; another lead's is not found."""
    atlas = client.get("/api/v1/chat/atlas").json()

    assert atlas["threads"] and all(t["lead_id"] == "atlas" for t in atlas["threads"])
    assert client.get("/api/v1/chat/atlas", params={"thread": "TH-0216"}).json()["messages"]
    assert client.get("/api/v1/chat/wayfinder", params={"thread": "TH-0216"}).status_code == 404


def test_chat_leads_carry_their_live_state(client: TestClient) -> None:
    """Spec 7.2, Chat: each contact circle shows the lead's current state from the Directory."""
    leads = {lead["id"]: lead for lead in client.get("/api/v1/chat/atlas").json()["leads"]}

    assert leads["atlas"]["state"] == "generating"
    assert leads["atlas"]["now"]
    assert leads["wayfinder"]["state"] == "idle"


def test_front_end_routes_fall_back_to_the_app_and_never_escape_dist(tmp_path: Path) -> None:
    """Spec 7.6: page routes serve the app, and paths never reach files outside the build."""
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>Brain</title>")
    (tmp_path / "icon.svg").write_text("<svg/>")
    config = make_config()
    app = create_app(config.__class__(**{**config.__dict__, "web_dist": tmp_path}))
    client = TestClient(app)

    assert "Brain" in client.get("/decisions").text
    assert client.get("/icon.svg").text == "<svg/>"
    assert "Brain" in client.get("/..%2Fpyproject.toml").text


def test_the_api_is_served_under_its_version(client: TestClient) -> None:
    """Spec 17.18, design practice 8: the API carries a version, in every path."""
    assert client.get("/api/v1/today").status_code == 200
    assert client.get("/api/today").status_code == 404
