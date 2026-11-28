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


def test_editing_a_message_starts_a_branch_beside_it(client: TestClient) -> None:
    """Spec 15.9.8: an edit re-runs the turn as a new branch; the original stays to switch back."""
    chat = client.post(
        "/api/v1/chat/atlas/TH-0216/messages/M-1/edit", json={"text": "Just the passport, please"}
    ).json()

    first = chat["messages"][0]
    assert first["text"] == "Just the passport, please"
    assert first["branch"] == 2 and first["sibling_ids"][0] == "M-1"
    assert chat["messages"][-1]["author"] == "lead"

    back = client.post("/api/v1/chat/atlas/TH-0216/messages/M-1/switch").json()
    assert [m["id"] for m in back["messages"]] == ["M-1", "M-2"]


def test_regenerating_a_reply_keeps_the_old_one_as_a_branch(client: TestClient) -> None:
    """Spec 15.9.8: regenerate writes the reply again as a sibling of the one it replaces."""
    chat = client.post("/api/v1/chat/atlas/TH-0216/messages/M-2/regenerate").json()

    reply = chat["messages"][-1]
    assert reply["parent_id"] == "M-1"
    assert reply["sibling_ids"] == ["M-2", reply["id"]]
    refused = client.post("/api/v1/chat/atlas/TH-0216/messages/M-1/regenerate")
    assert refused.status_code == 409


def test_stop_ends_the_reply_being_written(client: TestClient) -> None:
    """Spec 15.9.8: Stop ends the reply at once and keeps what it wrote."""
    client.post("/api/v1/chat/atlas", json={"text": "Hello", "thread_id": "TH-0216"})
    stopped = client.post("/api/v1/chat/atlas/TH-0216/stop").json()

    assert stopped["messages"][-1]["stopped"] is True
    assert stopped["messages"][-1]["streaming"] is False
    assert client.post("/api/v1/chat/atlas/TH-0216/stop").status_code == 409


def test_branching_starts_a_new_thread_that_links_back(client: TestClient) -> None:
    """Spec 15.9.8: branch into a new thread from a message; it keeps the way back."""
    branched = client.post("/api/v1/chat/atlas/TH-0216/messages/M-1/branch").json()

    assert branched["thread"]["branched_from"] == "TH-0216"
    assert branched["thread"]["kind"] == "conversation"
    assert [m["author"] for m in branched["messages"]] == ["owner"]


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
