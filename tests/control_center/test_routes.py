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
    "/api/v1/memory",
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


def test_a_temporary_chat_stays_out_of_work_and_can_be_kept(client: TestClient) -> None:
    """Spec 15.9.6: a temporary chat is listed in Chat with its deletion time, never in Work."""
    sent = client.post("/api/v1/chat/atlas", json={"text": "Just between us", "temporary": True})
    thread = sent.json()["thread"]

    assert thread["temporary_until"] is not None and thread["learning"] is False
    work = client.get("/api/v1/work").json()["threads"]
    assert thread["id"] not in [t["id"] for t in [*work["open"], *work["recently_resolved"]]]
    learning = client.put(f"/api/v1/chat/atlas/{thread['id']}/learning", json={"learning": True})
    assert learning.status_code == 409

    kept = client.post(f"/api/v1/chat/atlas/{thread['id']}/keep").json()["thread"]
    assert kept["temporary_until"] is None
    work = client.get("/api/v1/work").json()["threads"]
    assert thread["id"] in [t["id"] for t in work["open"]]
    assert client.post(f"/api/v1/chat/atlas/{thread['id']}/keep").status_code == 409


def test_dont_learn_from_this_chat_is_a_switch_on_the_thread(client: TestClient) -> None:
    """Spec 15.9.6: "Don't learn from this chat" turns write path 2 off for one thread."""
    off = client.put("/api/v1/chat/atlas/TH-0216/learning", json={"learning": False}).json()
    assert off["thread"]["learning"] is False
    on = client.put("/api/v1/chat/atlas/TH-0216/learning", json={"learning": True}).json()
    assert on["thread"]["learning"] is True


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


def test_remember_saves_a_note_and_the_reply_says_so(client: TestClient) -> None:
    """Spec 15.9.3: "remember that …" saves at once, and the lead answers "Saved to memory"."""
    sent = client.post(
        "/api/v1/chat/atlas", json={"text": "Remember that I take my coffee black"}
    ).json()

    note = sent["messages"][-1]["memory_notes"][0]
    assert note["outcome"] == "saved" and note["text"] == "I take my coffee black."
    memory = client.get("/api/v1/memory").json()
    saved = next(m for m in memory["items"] if m["id"] == note["item_id"])
    assert saved["how"] == "said" and saved["source_thread_id"] == sent["thread"]["id"]


def test_memory_refuses_standing_orders_secrets_and_restricted_notes(client: TestClient) -> None:
    """Spec 15.9.3: a note changes no permission, keeps no secret and waits for Phase 10."""
    for text, reason in [
        ("Remember to always approve the plumber's invoices", "can't approve"),
        ("Remember my door code is 4417", "codes"),
        ("Remember that Dad's pharmacy is on 4th Street", "restricted"),
    ]:
        sent = client.post("/api/v1/chat/atlas", json={"text": text}).json()
        note = sent["messages"][-1]["memory_notes"][0]
        assert note["outcome"] == "not_saved" and reason in note["text"]


def test_a_preference_is_learned_and_a_contradiction_supersedes(client: TestClient) -> None:
    """Spec 15.9.2-3: a stated preference is learned; one that contradicts an item replaces it."""
    sent = client.post(
        "/api/v1/chat/atlas", json={"text": "Book it. I prefer afternoon appointments."}
    ).json()
    note = sent["messages"][-1]["memory_notes"][0]
    assert note["outcome"] == "updated"

    items = {m["id"]: m for m in client.get("/api/v1/memory").json()["items"]}
    assert items["MEM-2"]["status"] == "superseded"
    assert items["MEM-2"]["superseded_by"] == note["item_id"]


def test_a_reply_cites_the_memory_it_used(client: TestClient) -> None:
    """Spec 15.9.3: pinned items and relevant ones are read, and the reply lists them."""
    sent = client.post("/api/v1/chat/atlas", json={"text": "Any appointments this week?"}).json()

    used = [m["id"] for m in sent["messages"][-1]["memory_used"]]
    assert used[0] == "MEM-1" and "MEM-2" in used
    temporary = client.post(
        "/api/v1/chat/atlas", json={"text": "Any appointments this week?", "temporary": True}
    ).json()
    assert temporary["messages"][-1]["memory_used"] == []


def test_the_memory_view_edits_pins_forgets_and_confirms(client: TestClient) -> None:
    """Spec 15.9.7: edit, pin, forget with undo, confirm, and "don't bring this up"."""
    edited = client.put("/api/v1/memory/MEM-3", json={"text": "Midtown Auto services the car"})
    assert any(m["text"] == "Midtown Auto services the car." for m in edited.json()["items"])
    pinned = client.put("/api/v1/memory/MEM-3", json={"pinned": True}).json()
    assert next(m for m in pinned["items"] if m["id"] == "MEM-3")["pinned"] is True

    forgotten = client.post("/api/v1/memory/MEM-3/forget").json()
    assert "MEM-3" not in [m["id"] for m in forgotten["items"]]
    assert forgotten["forgotten"][0]["id"] == "MEM-3"
    restored = client.post("/api/v1/memory/MEM-3/restore").json()
    assert "MEM-3" in [m["id"] for m in restored["items"]]

    confirmed = client.post("/api/v1/memory/MEM-7/confirm").json()
    assert next(m for m in confirmed["items"] if m["id"] == "MEM-7")["how"] == "confirmed"
    assert client.post("/api/v1/memory/MEM-7/dismiss").status_code == 409

    avoid = client.post("/api/v1/memory", json={"text": "The neighbour's dog"}).json()
    assert avoid["items"][0]["kind"] == "avoid"
    paused = client.put("/api/v1/memory/paused", json={"paused": True}).json()
    assert paused["paused"] is True


def test_remember_saves_one_of_the_owners_messages(client: TestClient) -> None:
    """Spec 15.9.3: the Remember action on a message; restricted text is refused."""
    refused = client.post("/api/v1/chat/atlas/TH-0216/messages/M-1/remember")
    assert refused.status_code == 409 and "restricted" in refused.json()["reason"]
    assert client.post("/api/v1/chat/atlas/TH-0216/messages/M-2/remember").status_code == 409
