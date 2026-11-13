"""Thread and session states are derived from recorded facts, in the spec's order (15.8)."""

import pytest
from fastapi.testclient import TestClient

from control_center.backends.mock.threads import STATE_ORDER, ThreadRecord, derive
from control_center.contract.work import BlockedCode, LiveTask, WaitingOn


def record(**facts: str | None) -> ThreadRecord:
    """A case led by Atlas with nothing recorded beyond `facts`."""
    return ThreadRecord(
        id="TH-1",
        title="Book the oil change",
        kind="case",
        unit_id=None,
        lead_id="atlas",
        lead_name="Atlas",
        lead_department="personal",
        pipeline="Personal",
        principal="owner",
        since="today",
        **facts,
    )


def session(
    *,
    queued: bool = False,
    paused: bool = False,
    waiting_on: WaitingOn | None = None,
    blocked_code: BlockedCode | None = None,
) -> LiveTask:
    """One of Chrono's sessions on the thread."""
    return LiveTask(
        id="T-1",
        employee_id="PO-2",
        employee_name="Chrono",
        department="personal",
        state="idle",
        doing="is calling the garage",
        item="Oil change",
        model="conversation model",
        lane="personal",
        started_at=None,
        tokens_per_second=None,
        queued=queued,
        paused=paused,
        waiting_on=waiting_on,
        blocked_code=blocked_code,
        thread_id="TH-1",
    )


@pytest.mark.parametrize(
    ("facts", "sessions", "expected"),
    [
        ({}, [session(blocked_code="budget"), session()], "blocked"),
        ({"owner_decision": "Pick a day."}, [session()], "needs_owner"),
        ({}, [session(waiting_on="owner")], "needs_owner"),
        ({}, [session(paused=True), session(paused=True)], "paused"),
        ({}, [session(paused=True), session()], "working"),
        ({}, [session(queued=True)], "working"),
        ({"proposed_resolution": "Booked."}, [], "review_ready"),
        ({}, [session(waiting_on="third_party")], "waiting"),
        ({"waiting_for": "the garage"}, [], "waiting"),
        ({}, [], "idle"),
        ({"outcome": "Booked.", "owner_decision": "Pick a day."}, [], "resolved"),
    ],
)
def test_the_first_rule_that_applies_decides_the_state(
    facts: dict[str, str | None], sessions: list[LiveTask], expected: str
) -> None:
    """Spec 15.8.3: blocked, needs you, paused, working, ready for review, waiting, idle."""
    state, _ = derive(record(**facts), sessions, approval_pending=False)

    assert state == expected


def test_a_pending_approval_card_makes_its_thread_need_the_owner() -> None:
    """Spec 15.8.3 rule 2: an approval card waiting is an Owner decision pending."""
    waiting = derive(record(approval_id="AP-1"), [], approval_pending=True)
    decided = derive(record(approval_id="AP-1"), [], approval_pending=False)

    assert waiting[0] == "needs_owner"
    assert decided[0] == "idle"


def test_a_session_state_comes_from_its_facts() -> None:
    """Spec 15.8.2: a pause holds a session whatever else is true; blocked outranks waiting."""
    assert session().session_state == "running"
    assert session(queued=True).session_state == "queued"
    assert session(waiting_on="gate").session_state == "waiting"
    assert session(waiting_on="gate", blocked_code="stalled").session_state == "blocked"
    assert session(blocked_code="stalled", paused=True).session_state == "paused"


def test_open_threads_are_listed_in_state_order(client: TestClient) -> None:
    """Spec 15.8.9: the Threads view groups open threads in the 15.8.3 order."""
    threads = client.get("/api/v1/work").json()["threads"]
    states = [thread["state"] for thread in threads["open"]]

    assert states == sorted(states, key=STATE_ORDER.index)
    assert {"blocked", "needs_owner", "working", "review_ready", "waiting", "idle"} <= set(states)
    assert all(thread["state"] == "resolved" for thread in threads["recently_resolved"])


def test_resolving_a_thread_ends_its_sessions_and_reopening_undoes_it(client: TestClient) -> None:
    """Spec 15.8.7, 15.8.10: resolve is one tap, ends the sessions, and Reopen undoes it."""
    resolved = client.post("/api/v1/threads/TH-0131/resolve").json()
    sessions = client.get("/api/v1/live").json()

    assert resolved["state"] == "resolved"
    assert all(s["thread_id"] != "TH-0131" for s in sessions)

    reopened = client.post("/api/v1/threads/TH-0131/reopen").json()

    assert reopened["state"] == "idle"


def test_a_thread_waiting_on_the_owner_cannot_be_resolved(client: TestClient) -> None:
    """Spec 15.8.10: a thread closed while a decision is pending would hide that decision."""
    for thread_id in ("TH-0129", "TH-0209"):  # an Owner gate, and an approval card
        answer = client.post(f"/api/v1/threads/{thread_id}/resolve")

        assert answer.status_code == 409, thread_id


def test_today_counts_threads_and_lists_the_ones_that_need_the_owner(client: TestClient) -> None:
    """Spec 15.8.9: Today counts blocked and review-ready threads; Needs you lists needs_owner."""
    approvals = client.get("/api/v1/approvals").json()
    pending = sum(1 for approval in approvals if approval["state"] == "pending")
    today = client.get("/api/v1/today").json()
    asking = [thread["id"] for thread in today["needs_you_threads"]]

    assert today["blocked_threads"] == 1
    assert today["review_ready_threads"] == 1
    assert asking == ["TH-0129"], "the thread behind an approval card is shown as that card"
    assert today["needs_you_count"] == pending + 1


def test_the_kill_switch_shows_every_thread_with_sessions_as_paused(client: TestClient) -> None:
    """Spec 15.8.2: the kill switch pauses every session, so their threads derive as paused."""
    client.post("/api/v1/platform/stop")
    threads = {t["id"]: t["state"] for t in client.get("/api/v1/work").json()["threads"]["open"]}

    assert threads["TH-0131"] == "paused"
    assert threads["TH-0120"] == "blocked", "blocked still outranks paused"


def test_directory_status_is_rolled_up_from_sessions(client: TestClient) -> None:
    """Spec 15.8.9: active now, waiting on Owner, blocked, idle, not yet hired, disabled."""
    client.put("/api/v1/directory/PO-2/enabled", json={"enabled": False})
    employees = client.get("/api/v1/directory").json()["employees"]
    status = {employee["name"]: employee["status"] for employee in employees}

    assert status["Bolt"] == "active_now"
    assert status["Foreman"] == "waiting_on_owner"
    assert status["Spark"] == "blocked"
    assert status["Keystone"] == "idle", "waiting on a third party needs no one here"
    assert status["Gremlin"] == "not_yet_hired"
    assert status["Chrono"] == "disabled"


def test_models_has_a_tokens_panel_and_token_cap_settings(client: TestClient) -> None:
    """Spec 8.8.7: Models shows token figures with their source; caps are settings."""
    tokens = client.get("/api/v1/models").json()["tokens"]
    names = {figure["name"] for figure in tokens["speeds"]}
    settings = client.get("/api/v1/settings").json()["settings"]
    caps = [s for s in settings if s["key"].startswith("models.tokens.")]

    assert {"Decode speed", "Prefill speed", "Cache hit rate", "Reasoning share"} <= names
    assert all(figure["source"] for figure in tokens["speeds"])
    assert len(caps) == 11
    assert all(cap["owner_page"] == "models" for cap in caps)


def test_raising_a_token_cap_needs_the_passkey_and_lowering_does_not(client: TestClient) -> None:
    """Spec 8.8.7: lowering a cap is tightening, one tap; raising one is loosening."""
    key = "/api/v1/settings/models.tokens.output_cap.CODE"

    assert client.put(key, json={"value": "4096"}).status_code == 200
    assert client.put(key, json={"value": "16384"}).status_code == 403
