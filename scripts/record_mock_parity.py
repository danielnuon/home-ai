"""Record the server's answers to a scripted session, for the preview's parity test.

Usage: uv run python scripts/record_mock_parity.py src/control_center/web/src/preview/parity.json

The preview answers the API from a TypeScript port of the mock backends. This script drives the
real server, on the mock backends, through a fixed session that touches every route and rule:
each refusal, each step-up, the undo window, expiry, the kill switch. It runs on a fake clock that
starts at the export instant and hands out ids from a counter, so the answers are the same on
every run. The front end's parity test replays the same requests against the port and requires the
same statuses, bodies and published events. `make ci` regenerates the file and fails if it
changed, so a change to a mock rule that the port lacks fails CI on one side or the other.
"""

import itertools
import json
import secrets
import sys
from collections.abc import Callable
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from export_mock_world import EXPORT_NOW
from fastapi.testclient import TestClient

from control_center import wiring
from control_center.app import create_app
from control_center.backends.mock.world import build_world
from control_center.config import load_config
from control_center.events import EventBus
from control_center.routes import personal

PROOF = "$proof"
"""Stands for the proof from the most recent step-up in a scripted request."""

Step = dict[str, Any]


def step_up() -> list[Step]:
    """A challenge and its verification; the proof goes to the next request that names `$proof`."""
    return [
        {"method": "POST", "path": "/step-up/challenge"},
        {"method": "POST", "path": "/step-up/verify", "body": "$assertion"},
    ]


def reads() -> list[Step]:
    """Every read, so a snapshot of each page is compared."""
    paths = [
        "/platform", "/approvals", "/decisions", "/settings", "/contacts", "/live", "/live/T-5521",
        "/work", "/directory", "/today", "/personal", "/finance/owner", "/finance/mom",
        "/setup", "/chat/atlas", "/chat/spark", "/system", "/services", "/models", "/spend",
        "/schedule", "/security", "/backups", "/maintenance", "/connections", "/voice", "/docs",
    ]  # fmt: skip
    return [{"method": "GET", "path": path} for path in paths]


def gate_steps() -> list[Step]:
    """Approvals, decisions, settings and the controls, with each refusal."""
    return [
        {"method": "POST", "path": "/approvals/AP-0107/decision", "body": {"decision": "deny"}},
        {"method": "POST", "path": "/approvals/AP-0107/undo"},
        {"method": "POST", "path": "/approvals/AP-0110/decision", "body": {"decision": "approve"}},
        *step_up(),
        {
            "method": "POST",
            "path": "/approvals/AP-0110/decision",
            "body": {"decision": "approve"},
            "step_up": PROOF,
        },
        {"method": "POST", "path": "/approvals/AP-0110/decision", "body": {"decision": "deny"}},
        {"advance": 9},
        {"method": "POST", "path": "/approvals/AP-0110/undo"},
        {"method": "POST", "path": "/approvals/nope/undo"},
        {"method": "POST", "path": "/decisions/CDR-0012/acknowledge"},
        {"method": "POST", "path": "/decisions/CDR-0012/acknowledge"},
        {"method": "POST", "path": "/decisions/CDR-0012/reopen"},
        {"method": "POST", "path": "/decisions/CDR-0012/veto", "body": {"reason": "Not yet."}},
        {"method": "POST", "path": "/decisions/CDR-0012/veto", "body": {}},
        {"method": "POST", "path": "/decisions/CDR-0012/reopen"},
        {"method": "POST", "path": "/decisions/CDR-0001/veto", "body": {}},
        {"method": "POST", "path": "/decisions/CDR-0001/reopen"},
        {"method": "PUT", "path": "/settings/away_mode", "body": {"value": "on"}},
        {"method": "GET", "path": "/platform"},
        {"method": "PUT", "path": "/settings/away_mode", "body": {"value": "maybe"}},
        {"method": "PUT", "path": "/settings/budget.anthropic", "body": {"value": "5000"}},
        {"method": "PUT", "path": "/settings/budget.anthropic", "body": {"value": "1²"}},
        {"method": "PUT", "path": "/settings/models.review.independent", "body": {"value": "on"}},
        *step_up(),
        {
            "method": "PUT",
            "path": "/settings/models.review.independent",
            "body": {"value": "on"},
            "step_up": PROOF,
        },
        {"method": "GET", "path": "/models"},
        {"method": "POST", "path": "/settings/quiet_hours/revert"},
        {"method": "PUT", "path": "/settings/nope", "body": {"value": "on"}},
        {"method": "PUT", "path": "/contacts/C-02/trust", "body": {"trust": "blocked"}},
        {"method": "PUT", "path": "/contacts/C-02/trust", "body": {"trust": "allowlisted"}},
        {"method": "PUT", "path": "/directory/ENG-1/enabled", "body": {"enabled": False}},
        {"method": "PUT", "path": "/directory/ENG-1/enabled", "body": {"enabled": True}},
        {"method": "GET", "path": "/directory"},
        {"method": "POST", "path": "/proposals/LP-0003/decision", "body": {"decision": "decline"}},
        {"method": "POST", "path": "/proposals/LP-0003/decision", "body": {"decision": "approve"}},
        {"method": "POST", "path": "/services/nope/restart"},
        *step_up(),
        {"method": "POST", "path": "/services/watchdog/restart", "step_up": PROOF},
        *step_up(),
        {
            "method": "POST",
            "path": "/backups/restore",
            "body": {"what": "tasks.db", "point": "Today 20:00"},
            "step_up": PROOF,
        },
    ]


def work_steps() -> list[Step]:
    """Stepping in, threads, the kill switch, personal records, Setup, schedule and search."""
    task = "/live/T-5521/interventions"
    return [
        {"method": "POST", "path": task, "body": {"kind": "note", "text": "  "}},
        {"method": "POST", "path": task, "body": {"kind": "note", "text": "Use 30 days too."}},
        {"method": "POST", "path": task, "body": {"kind": "pause"}},
        {"method": "GET", "path": "/work"},
        {"method": "POST", "path": task, "body": {"kind": "redirect", "text": "Start over."}},
        {"method": "POST", "path": "/live/T-5517/interventions", "body": {"kind": "stop"}},
        {"method": "POST", "path": "/threads/TH-0129/resolve"},
        {"method": "POST", "path": "/threads/TH-0131/resolve"},
        {"method": "POST", "path": "/threads/TH-0131/resolve"},
        {"method": "POST", "path": "/threads/TH-0131/reopen"},
        {"method": "POST", "path": "/threads/TH-0131/reopen"},
        {"method": "POST", "path": "/platform/stop"},
        {"method": "GET", "path": "/live"},
        {"method": "GET", "path": "/today"},
        {"method": "POST", "path": "/schedule/snapshots/run"},
        {"method": "POST", "path": "/platform/resume"},
        *step_up(),
        {"method": "POST", "path": "/platform/resume", "step_up": PROOF},
        {"method": "POST", "path": "/cases/CS-0201/action", "body": {"action": "snooze"}},
        {"method": "POST", "path": "/cases/CS-0201/action", "body": {"action": "done"}},
        {"method": "POST", "path": "/changes/AC-1/undo"},
        {"method": "POST", "path": "/setup/OI-15", "body": {"action": "defer"}},
        {"method": "POST", "path": "/setup/OI-16", "body": {"action": "defer"}},
        {"method": "POST", "path": "/setup/OI-13", "body": {"action": "resume"}},
        {"method": "PUT", "path": "/maintenance/running", "body": {"running": False}},
        {"method": "POST", "path": "/maintenance/fixes/F-031/revert"},
        {"method": "POST", "path": "/maintenance/fixes/nope/revert"},
        {"method": "PUT", "path": "/schedule/snapshots/paused", "body": {"paused": True}},
        {"method": "GET", "path": "/search?q=lease"},
        {"method": "GET", "path": "/search?q="},
        {"method": "GET", "path": "/search?q=backup"},
        {"method": "GET", "path": "/chat/nobody"},
    ]


def later_steps() -> list[Step]:
    """Time passing: cards expire and decisions take effect."""
    return [
        {"advance": 7 * 3600},
        {"method": "GET", "path": "/approvals"},
        {"method": "POST", "path": "/approvals/AP-0108/decision", "body": {"decision": "deny"}},
        {"advance": 12 * 3600},
        {"method": "GET", "path": "/decisions"},
        {"method": "GET", "path": "/platform"},
        {"method": "GET", "path": "/today"},
    ]


class FakeClock:
    """A clock the script moves by hand, starting at the export instant."""

    def __init__(self) -> None:
        """Start at `EXPORT_NOW`."""
        self.now = EXPORT_NOW

    def __call__(self) -> datetime:
        """The current fake time."""
        return self.now


def counter_ids() -> Callable[[int], str]:
    """Ids `id1`, `id2`, … in call order; the preview's test hands them out the same way."""
    numbers = itertools.count(1)
    return lambda _bytes=0: f"id{next(numbers)}"


def deterministic_app(clock: FakeClock) -> tuple[TestClient, EventBus]:
    """The app on mock backends with the fake clock and counter ids, and its event bus."""
    wiring.build_world = lambda bus: build_world(bus, clock)  # type: ignore[assignment]

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz: Any = None) -> datetime:
            return clock().astimezone(tz)

    personal.datetime = FrozenDatetime  # type: ignore[misc]
    app = create_app(load_config({"BRAIN_DEV_IDENTITY": "1"}))
    client = TestClient(app)
    client.headers["X-CSRF-Token"] = client.get("/api/v1/session").json()["csrf_token"]
    # Counter ids from here on, after the bus and the session have taken their random ones.
    ids = counter_ids()
    secrets.token_hex = ids  # type: ignore[assignment]
    secrets.token_urlsafe = ids  # type: ignore[assignment]
    return client, app.state.backends.bus


def run(steps: list[Step]) -> list[Step]:
    """Send each step and record its answer and the events it published."""
    clock = FakeClock()
    client, bus = deterministic_app(clock)
    challenge = proof = ""
    recorded: list[Step] = []
    for step in steps:
        if "advance" in step:
            clock.now += timedelta(seconds=step["advance"])
            recorded.append(step)
            continue
        body = step.get("body")
        if body == "$assertion":
            body = {"challenge": challenge, "assertion": f"virtual:{challenge}"}
        headers = {"X-Step-Up": proof} if step.get("step_up") == PROOF else {}
        before = bus.last_id
        answer = client.request(
            step["method"], f"/api/v1{step['path']}", json=body, headers=headers
        )
        is_json = (
            answer.status_code != 204 and answer.headers.get("content-type") == "application/json"
        )
        response = answer.json() if is_json else None
        found = response if isinstance(response, dict) else {}
        challenge = found.get("challenge", challenge)
        proof = found.get("proof", proof)
        events = [{"kind": e.kind, "payload": e.payload} for e in bus.replay_after(before)]
        recorded.append(
            {
                "method": step["method"],
                "path": step["path"],
                "body": body,
                "step_up": headers.get("X-Step-Up"),
                "status": answer.status_code,
                "response": response,
                "events": events,
            }
        )
    return recorded


def main() -> None:
    """Record the scripted session to the path given."""
    steps = [*reads(), *gate_steps(), *work_steps(), *later_steps()]
    payload = {"exported_at": EXPORT_NOW.isoformat(), "steps": run(steps)}
    text = json.dumps(payload, indent=1, ensure_ascii=False, sort_keys=True) + "\n"
    Path(sys.argv[1]).write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
