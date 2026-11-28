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
        "/docs/infra", "/docs/nope", "/trash", "/offline-pack", "/library", "/contacts/C-02",
        "/contacts/nope",
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
        {"method": "GET", "path": "/chat/atlas?thread=TH-0216"},
        {"method": "GET", "path": "/chat/spark?thread=TH-0216"},
        # Only the reply controls that start no streamed reply, so the answers are deterministic.
        {"method": "POST", "path": "/chat/atlas/TH-0216/messages/M-1/regenerate"},
        {"method": "POST", "path": "/chat/atlas/TH-0216/messages/M-2/edit", "body": {"text": "x"}},
        {"method": "POST", "path": "/chat/atlas/TH-0216/messages/M-1/edit", "body": {"text": " "}},
        {"method": "POST", "path": "/chat/atlas/TH-0216/messages/M-2/switch"},
        {"method": "POST", "path": "/chat/atlas/TH-0216/messages/nope/switch"},
        {"method": "POST", "path": "/chat/atlas/TH-0216/stop"},
        {"method": "POST", "path": "/chat/atlas/TH-0216/messages/M-1/branch"},
        {"method": "POST", "path": "/chat/atlas/TH-0216/keep"},
        {"method": "PUT", "path": "/chat/atlas/TH-0216/learning", "body": {"learning": False}},
        {"method": "PUT", "path": "/chat/atlas/nope/learning", "body": {"learning": True}},
        {"method": "POST", "path": "/chat/atlas/TH-0216/messages/M-1/remember"},
        {"method": "POST", "path": "/chat/atlas/TH-0216/messages/M-2/remember"},
        {"method": "GET", "path": "/memory"},
        {
            "method": "PUT",
            "path": "/memory/MEM-3",
            "body": {"text": "midtown auto services the car"},
        },
        {"method": "PUT", "path": "/memory/MEM-3", "body": {"text": "Auto-pay the garage"}},
        {"method": "PUT", "path": "/memory/MEM-3", "body": {"pinned": True}},
        {"method": "PUT", "path": "/memory/MEM-8", "body": {"pinned": True}},
        {"method": "PUT", "path": "/memory/nope", "body": {"pinned": True}},
        {"method": "POST", "path": "/memory/MEM-3/forget"},
        {"method": "POST", "path": "/memory/MEM-3/restore"},
        {"method": "POST", "path": "/memory/MEM-3/restore"},
        {"method": "POST", "path": "/memory/MEM-4/forget"},
        {"method": "POST", "path": "/memory/MEM-7/confirm"},
        {"method": "POST", "path": "/memory/MEM-7/dismiss"},
        {"method": "POST", "path": "/memory", "body": {"text": "the neighbour's dog"}},
        {"method": "POST", "path": "/memory", "body": {"text": "My PIN is 1234", "kind": "note"}},
        {"method": "PUT", "path": "/memory/paused", "body": {"paused": True}},
    ]


def shell_steps() -> list[Step]:
    """The Guide panel, Docs, alerts, the trash, the offline pack and the library."""
    ask = "/guide/ask"
    return [
        {"method": "POST", "path": ask, "body": {"question": " ", "page": "/"}},
        {"method": "POST", "path": ask, "body": {"question": "What is this?", "page": "/"}},
        {
            "method": "POST",
            "path": ask,
            "body": {"question": "Why?", "page": "/docs/infra", "context": "INFRASTRUCTURE.md"},
        },
        {"method": "POST", "path": ask, "body": {"question": "When is insurance?", "page": "/x"}},
        {"method": "POST", "path": "/docs/infra/change-requests", "body": {"text": " "}},
        {"method": "POST", "path": "/docs/infra/change-requests", "body": {"text": "Add a step."}},
        {"method": "POST", "path": "/docs/nope/change-requests", "body": {"text": "Hi."}},
        {"method": "POST", "path": "/alerts/AL-0042/action", "body": {"action": "acknowledge"}},
        {"method": "POST", "path": "/alerts/AL-0042/action", "body": {"action": "reopen"}},
        {"method": "POST", "path": "/alerts/AL-0043/action", "body": {"action": "snooze"}},
        {"method": "POST", "path": "/alerts/nope/action", "body": {"action": "snooze"}},
        {"method": "GET", "path": "/today"},
        {"method": "POST", "path": "/trash/TR-0007/restore"},
        {"method": "POST", "path": "/trash/TR-0006/purge"},
        {"method": "POST", "path": "/trash/TR-0006/restore"},
        {"method": "POST", "path": "/trash/TR-0001/restore"},
        {"method": "GET", "path": "/trash"},
        {"method": "POST", "path": "/library/ark-drive", "body": {"volume": "ARK-1"}},
        *step_up(),
        {
            "method": "PUT",
            "path": "/settings/offline_library",
            "body": {"value": "on"},
            "step_up": PROOF,
        },
        *step_up(),
        {
            "method": "PUT",
            "path": "/settings/offline_pack",
            "body": {"value": "on"},
            "step_up": PROOF,
        },
        {"method": "GET", "path": "/platform"},
        {"method": "GET", "path": "/offline-pack"},
        {"method": "GET", "path": "/library"},
        {"method": "GET", "path": "/library/search?q=boil"},
        {"method": "GET", "path": "/library/search?q="},
        {"method": "POST", "path": "/library/ask", "body": {"question": ""}},
        {"method": "POST", "path": "/library/ask", "body": {"question": "Chest pain, what now?"}},
        {"method": "POST", "path": "/library/ask", "body": {"question": "Is this water safe?"}},
        {"method": "POST", "path": "/library/ask", "body": {"question": "Tan leather?"}},
        {"method": "POST", "path": "/library/ark-drive", "body": {"volume": "ARK-9"}},
        {"method": "POST", "path": "/library/ark-drive", "body": {"volume": "ARK-1"}},
        *step_up(),
        {
            "method": "POST",
            "path": "/library/ark-drive",
            "body": {"volume": "ARK-1"},
            "step_up": PROOF,
        },
        {"method": "PUT", "path": "/settings/offline_library", "body": {"value": "off"}},
    ]


def accounts_steps() -> list[Step]:
    """Connections, Voice, Security, data export and impact previews, with each refusal."""
    conn = "/connections"
    voice = "/voice/profiles"
    sec = "/security"
    clone = {"kind": "consented_clone", "name": "Grandma", "sample": "memo.m4a"}
    consented = {**clone, "consent": "She agreed in person"}
    celebrity = {"kind": "celebrity_clone", "name": "Anchor", "sample": "clip.wav"}
    return [
        {"method": "POST", "path": f"{conn}/huggingface/disconnect"},
        {"method": "POST", "path": f"{conn}/huggingface/disconnect"},
        {"method": "POST", "path": f"{conn}/huggingface/test"},
        {"method": "POST", "path": f"{conn}/huggingface/connect"},
        *step_up(),
        {"method": "POST", "path": f"{conn}/huggingface/connect", "step_up": PROOF},
        {"method": "POST", "path": f"{conn}/huggingface/test"},
        {"method": "POST", "path": f"{conn}/calendar/connect"},
        {"method": "POST", "path": f"{conn}/calendar/disconnect"},
        {"method": "POST", "path": f"{conn}/calendar/permission"},
        {"method": "POST", "path": f"{conn}/messages/permission"},
        {"method": "POST", "path": f"{conn}/tailscale/permission"},
        {"method": "POST", "path": f"{conn}/acct-mom/test"},
        {"method": "PUT", "path": f"{conn}/tailscale/secret", "body": {"value": "x"}},
        {"method": "PUT", "path": f"{conn}/provider-openai/secret", "body": {"value": " "}},
        {"method": "PUT", "path": f"{conn}/provider-openai/secret", "body": {"value": "sk-1"}},
        *step_up(),
        {
            "method": "PUT",
            "path": f"{conn}/provider-openai/secret",
            "body": {"value": "sk-1"},
            "step_up": PROOF,
        },
        *step_up(),
        {
            "method": "PUT",
            "path": f"{conn}/acct-mom/secret",
            "body": {"value": "new"},
            "step_up": PROOF,
        },
        {"method": "POST", "path": f"{conn}/provider-openai/secret/remove"},
        {"method": "POST", "path": f"{conn}/provider-openai/secret/remove"},
        {"method": "POST", "path": f"{conn}/provider-video/connect"},
        {"method": "POST", "path": f"{conn}/nope/test"},
        {"method": "GET", "path": "/connections"},
        {"method": "POST", "path": voice, "body": {"kind": "stock", "stock_id": "bella"}},
        {"method": "POST", "path": voice, "body": {"kind": "stock", "stock_id": "bella"}},
        {"method": "POST", "path": voice, "body": {"kind": "stock", "stock_id": "nope"}},
        {"method": "POST", "path": voice, "body": {"kind": "consented_clone", "name": " "}},
        {"method": "POST", "path": voice, "body": {"kind": "consented_clone", "name": "Grandma"}},
        {"method": "POST", "path": voice, "body": clone},
        {"method": "POST", "path": voice, "body": consented},
        *step_up(),
        {"method": "POST", "path": voice, "body": consented, "step_up": PROOF},
        *step_up(),
        {"method": "POST", "path": voice, "body": consented, "step_up": PROOF},
        {"method": "POST", "path": voice, "body": celebrity},
        {"method": "POST", "path": f"{voice}/public_figure/render"},
        {"method": "POST", "path": f"{voice}/public_figure/preview"},
        {"method": "POST", "path": f"{voice}/twilio_default/render"},
        {"method": "POST", "path": f"{voice}/twilio_default/preview"},
        {"method": "POST", "path": f"{voice}/mom/render"},
        {"method": "POST", "path": f"{voice}/mom/preview"},
        {"method": "POST", "path": f"{voice}/twilio_default/delete"},
        {"method": "POST", "path": f"{voice}/heart/delete"},
        {"method": "POST", "path": f"{voice}/heart/delete"},
        *step_up(),
        {
            "method": "PUT",
            "path": "/settings/voice.profiles.celebrity_clones",
            "body": {"value": "on"},
            "step_up": PROOF,
        },
        {"method": "POST", "path": voice, "body": celebrity},
        {
            "method": "POST",
            "path": voice,
            "body": {**celebrity, "risk_acknowledged": True},
        },
        {"method": "GET", "path": "/voice"},
        {"method": "GET", "path": "/settings"},
        {"method": "POST", "path": f"{sec}/workspaces/ws-rental/resume"},
        {"method": "POST", "path": f"{sec}/workspaces/ws-rental/stop"},
        {"method": "POST", "path": f"{sec}/workspaces/ws-rental/resume"},
        *step_up(),
        {"method": "POST", "path": f"{sec}/workspaces/ws-rental/resume", "step_up": PROOF},
        {"method": "POST", "path": f"{sec}/workspaces/nope/stop"},
        {"method": "POST", "path": f"{sec}/devices/dev-mac/sign-out"},
        {"method": "POST", "path": f"{sec}/devices/dev-ipad/sign-out"},
        {"method": "POST", "path": f"{sec}/devices/dev-ipad/sign-out"},
        *step_up(),
        {"method": "POST", "path": f"{sec}/passkeys/pk-key/remove", "step_up": PROOF},
        {"method": "POST", "path": f"{sec}/passkeys/pk-iphone/remove"},
        {"method": "POST", "path": f"{sec}/passkeys/pk-key/remove"},
        {"method": "POST", "path": f"{sec}/passkeys", "body": {"name": " "}},
        {"method": "POST", "path": f"{sec}/passkeys", "body": {"name": "Watch"}},
        *step_up(),
        {"method": "POST", "path": f"{sec}/passkeys", "body": {"name": "Watch"}, "step_up": PROOF},
        {"method": "POST", "path": f"{sec}/passkeys/pk-iphone/remove"},
        {"method": "POST", "path": f"{sec}/totp/reset"},
        *step_up(),
        {"method": "POST", "path": f"{sec}/totp/reset", "step_up": PROOF},
        *step_up(),
        {"method": "POST", "path": f"{sec}/recovery-codes", "step_up": PROOF},
        {"method": "POST", "path": f"{sec}/audit/export", "body": {}},
        {
            "method": "POST",
            "path": f"{sec}/audit/export",
            "body": {"range": "7d", "filter": "DENY"},
        },
        {"method": "PUT", "path": "/contacts/C-03/trust", "body": {"trust": "known"}},
        {"method": "GET", "path": "/security"},
        {"method": "POST", "path": "/exports", "body": {"scope": "all"}},
        *step_up(),
        {"method": "POST", "path": "/exports", "body": {"scope": "dad"}, "step_up": PROOF},
        {"method": "GET", "path": "/settings/budget.voice/impact?value=10"},
        {"method": "GET", "path": "/settings/budget.voice/impact?value=999"},
        {"method": "GET", "path": "/settings/budget.voice/impact?value=0"},
        {"method": "GET", "path": "/settings/models.review.independent/impact?value=on"},
        {"method": "GET", "path": "/settings/cloud.providers.anthropic/impact?value=on"},
        {"method": "GET", "path": "/settings/offline_library/impact?value=on"},
        {"method": "GET", "path": "/settings/image.enabled/impact?value=off"},
        {"method": "GET", "path": "/settings/models.tokens.output_cap.CODE/impact?value=4096"},
        {"method": "GET", "path": "/settings/away_mode/impact?value=on"},
        {"method": "GET", "path": "/settings/resources.desk_mode/impact?value=on"},
        {"method": "GET", "path": "/settings/resources.desk_mode/impact?value=off"},
        {"method": "GET", "path": "/settings/maintenance.receipt-scanner/impact?value=fix"},
        {"method": "GET", "path": "/settings/maintenance.lease-reminders/impact?value=scan"},
        {"method": "GET", "path": "/settings/nope/impact?value=on"},
        {"method": "GET", "path": "/settings/quiet_hours/outcomes"},
        {"method": "GET", "path": "/settings/away_mode/outcomes"},
        {"method": "PUT", "path": "/settings/quiet_hours", "body": {"value": "23:00–07:00"}},
        {"method": "GET", "path": "/settings/quiet_hours/outcomes"},
        {"method": "GET", "path": "/spend"},
        *step_up(),
        {
            "method": "PUT",
            "path": "/settings/budget.voice",
            "body": {"value": "15"},
            "step_up": PROOF,
        },
        *step_up(),
        {
            "method": "PUT",
            "path": "/settings/voice.enabled",
            "body": {"value": "on"},
            "step_up": PROOF,
        },
        {"method": "GET", "path": "/spend"},
        {"method": "PUT", "path": "/settings/voice.enabled", "body": {"value": "off"}},
    ]


def people_steps() -> list[Step]:
    """Contacts, principals and the Approvals edits, with each refusal."""
    new = {
        "name": "Northside Vet",
        "area": "Pets",
        "principal": "owner",
        "channels": [{"kind": "phone", "value": "(555) 010-3300"}],
        "trust": "known",
    }
    contacts = "/contacts"
    return [
        {"method": "POST", "path": contacts, "body": {**new, "name": " "}},
        {
            "method": "POST",
            "path": contacts,
            "body": {**new, "channels": [{"kind": "email", "value": " "}]},
        },
        {"method": "POST", "path": contacts, "body": {**new, "principal": "nobody"}},
        {"method": "POST", "path": contacts, "body": new},
        {"method": "POST", "path": contacts, "body": {**new, "trust": "allowlisted"}},
        *step_up(),
        {
            "method": "POST",
            "path": contacts,
            "body": {**new, "trust": "allowlisted"},
            "step_up": PROOF,
        },
        {
            "method": "PUT",
            "path": "/contacts/C-03",
            "body": {**new, "name": "A-1 Plumbing", "trust": "blocked"},
        },
        {
            "method": "PUT",
            "path": "/contacts/C-03",
            "body": {**new, "name": "A-1 Plumbing", "trust": "allowlisted"},
        },
        {"method": "PUT", "path": "/contacts/nope", "body": new},
        {"method": "POST", "path": "/contacts/C-01/merge", "body": {"into": "C-01"}},
        {"method": "POST", "path": "/contacts/C-01/merge", "body": {"into": "C-05"}},
        {"method": "GET", "path": "/contacts/C-05"},
        {"method": "POST", "path": "/contacts/C-04/remove"},
        {"method": "POST", "path": "/contacts/C-04/remove"},
        {"method": "GET", "path": "/trash"},
        {"method": "GET", "path": contacts},
        {"method": "POST", "path": "/principals", "body": {"name": "Grandma"}},
        {"method": "POST", "path": "/principals", "body": {"name": " "}},
        *step_up(),
        {
            "method": "POST",
            "path": "/principals",
            "body": {"name": "Grandma"},
            "step_up": PROOF,
        },
        {
            "method": "PUT",
            "path": "/principals/mom/accounts",
            "body": {"accounts": ["A-04"], "calendars": ["K-03"]},
        },
        {
            "method": "PUT",
            "path": "/principals/mom/accounts",
            "body": {"accounts": ["A-04", "A-07"], "calendars": []},
        },
        {
            "method": "PUT",
            "path": "/principals/mom/accounts",
            "body": {"accounts": ["K-01"], "calendars": []},
        },
        *step_up(),
        {
            "method": "PUT",
            "path": "/principals/mom/accounts",
            "body": {"accounts": ["A-04", "A-07"], "calendars": []},
            "step_up": PROOF,
        },
        *step_up(),
        {
            "method": "POST",
            "path": "/principals/owner/remove",
            "body": {"keep": "archive"},
            "step_up": PROOF,
        },
        {"method": "POST", "path": "/principals/dad/remove", "body": {"keep": "delete"}},
        *step_up(),
        {
            "method": "POST",
            "path": "/principals/dad/remove",
            "body": {"keep": "delete"},
            "step_up": PROOF,
        },
        {"method": "POST", "path": "/principals/dad/undo-remove"},
        {"method": "POST", "path": "/principals/dad/undo-remove"},
        *step_up(),
        {
            "method": "POST",
            "path": "/principals/mom/remove",
            "body": {"keep": "archive"},
            "step_up": PROOF,
        },
        {
            "method": "PUT",
            "path": "/approvals/AP-0107/draft",
            "body": {"draft": "Hi, Tuesday at 10:30 works."},
        },
        {"method": "PUT", "path": "/approvals/AP-0107/draft", "body": {"draft": " "}},
        {"method": "PUT", "path": "/approvals/AP-0109/draft", "body": {"draft": "x"}},
        {"method": "PUT", "path": "/approvals/AP-0111/batch/B-3", "body": {"included": False}},
        {"method": "PUT", "path": "/approvals/AP-0111/batch/B-2", "body": {"included": False}},
        {"method": "PUT", "path": "/approvals/AP-0111/batch/B-1", "body": {"included": False}},
        {"method": "PUT", "path": "/approvals/AP-0111/batch/B-9", "body": {"included": False}},
        {"method": "POST", "path": "/approvals/AP-0111/decision", "body": {"decision": "approve"}},
        {"method": "PUT", "path": "/approvals/AP-0111/batch/B-2", "body": {"included": True}},
        {"method": "POST", "path": "/approvals/AP-0109/allow-recipient"},
        {"method": "POST", "path": "/approvals/AP-0107/allow-recipient"},
        {"method": "POST", "path": "/approvals/AP-0108/allow-recipient"},
        *step_up(),
        {"method": "POST", "path": "/approvals/AP-0108/allow-recipient", "step_up": PROOF},
        {"method": "POST", "path": "/approvals/AP-0108/allow-recipient"},
        {"method": "GET", "path": "/approvals"},
    ]


def ops_steps() -> list[Step]:
    """The operations controls, with each refusal.

    Pool mode, health check, pressure drill, pins, selection, logs, job times, backups and
    maintenance.
    """
    return [
        {"method": "GET", "path": "/metrics?page=system"},
        {"method": "GET", "path": "/metrics?page=models"},
        {"method": "GET", "path": "/metrics"},
        {"method": "PUT", "path": "/system/pool-mode", "body": {"mode": "L"}},
        {"method": "PUT", "path": "/system/pool-mode", "body": {"mode": "B"}},
        {"method": "POST", "path": "/system/pool-mode/end"},
        {"method": "PUT", "path": "/system/pool-mode", "body": {"mode": "I"}},
        {"method": "GET", "path": "/today"},
        {"method": "POST", "path": "/system/pool-mode/end"},
        {"method": "POST", "path": "/system/health-check"},
        {"method": "PUT", "path": "/settings/resources.desk_mode", "body": {"value": "on"}},
        {"method": "GET", "path": "/system"},
        {"method": "PUT", "path": "/settings/resources.desk_mode", "body": {"value": "off"}},
        {"method": "PUT", "path": "/system/pool-mode", "body": {"mode": "S"}},
        {"method": "POST", "path": "/system/pressure-drill"},
        {"method": "GET", "path": "/platform"},
        {"method": "POST", "path": "/system/pressure-drill"},
        {"method": "GET", "path": "/platform"},
        {"method": "GET", "path": "/schedule"},
        {"method": "POST", "path": "/schedule/snapshots/run"},
        {"method": "POST", "path": "/schedule/daily-brief/run"},
        {"method": "PUT", "path": "/system/pool-mode", "body": {"mode": "I"}},
        {"method": "POST", "path": "/system/pressure-drill"},
        {"method": "GET", "path": "/platform"},
        {"method": "PUT", "path": "/models/families/CODE/pin", "body": {"pinned": True}},
        {"method": "PUT", "path": "/models/families/NOPE/pin", "body": {"pinned": True}},
        {"method": "PUT", "path": "/models/families/CODE/pin", "body": {"pinned": False}},
        {"method": "POST", "path": "/models/selection"},
        {"method": "POST", "path": "/models/selection"},
        {"method": "GET", "path": "/services/model-router/logs"},
        {"method": "GET", "path": "/services/nope/logs"},
        {"method": "PUT", "path": "/schedule/pruning/time", "body": {"time": "4am"}},
        {"method": "PUT", "path": "/schedule/pruning/time", "body": {"time": "23:30"}},
        {"method": "PUT", "path": "/schedule/account-sync/time", "body": {"time": "10:00"}},
        {"method": "PUT", "path": "/schedule/pruning/time", "body": {"time": "03:30"}},
        {"method": "PUT", "path": "/schedule/nope/time", "body": {"time": "03:30"}},
        {"method": "POST", "path": "/backups/drill"},
        {"method": "POST", "path": "/backups/prune-plan/discard"},
        {"method": "POST", "path": "/backups/prune", "body": {"plan_id": "nope"}},
        {"method": "POST", "path": "/backups/prune-plan"},
        {"method": "POST", "path": "/backups/prune", "body": "$plan"},
        *step_up(),
        {"method": "POST", "path": "/backups/prune", "body": "$plan", "step_up": PROOF},
        {"method": "POST", "path": "/backups/prune-plan"},
        {"method": "POST", "path": "/backups/prune-plan/discard"},
        {
            "method": "PUT",
            "path": "/settings/maintenance.receipt-scanner",
            "body": {"value": "fix"},
        },
        *step_up(),
        {
            "method": "PUT",
            "path": "/settings/maintenance.receipt-scanner",
            "body": {"value": "fix"},
            "step_up": PROOF,
        },
        {
            "method": "PUT",
            "path": "/settings/maintenance.lease-reminders",
            "body": {"value": "scan"},
        },
        {"method": "POST", "path": "/maintenance/findings/F-042/wont-fix", "body": {"reason": " "}},
        {
            "method": "POST",
            "path": "/maintenance/findings/F-042/wont-fix",
            "body": {"reason": "Docs move"},
        },
        {
            "method": "POST",
            "path": "/maintenance/findings/F-042/wont-fix",
            "body": {"reason": "Again"},
        },
        {"method": "GET", "path": "/maintenance"},
        {"method": "POST", "path": "/maintenance/findings/F-042/reopen"},
        {"method": "POST", "path": "/maintenance/findings/F-042/reopen"},
        {"method": "POST", "path": "/maintenance/findings/nope/reopen"},
        {"method": "POST", "path": "/platform/stop"},
        {"method": "POST", "path": "/backups/drill"},
        {"method": "POST", "path": "/models/selection"},
        *step_up(),
        {"method": "POST", "path": "/platform/resume", "step_up": PROOF},
    ]


def later_steps() -> list[Step]:
    """Time passing: cards expire, decisions take effect, a snooze ends."""
    return [
        {"advance": 7 * 3600},
        {"method": "GET", "path": "/today"},
        {"method": "GET", "path": "/approvals"},
        {"method": "GET", "path": "/memory"},
        {"method": "POST", "path": "/approvals/AP-0108/decision", "body": {"decision": "deny"}},
        {"advance": 12 * 3600},
        {"method": "GET", "path": "/decisions"},
        {"method": "GET", "path": "/platform"},
        {"method": "GET", "path": "/today"},
        {"advance": 7 * 24 * 3600},
        {"method": "GET", "path": "/contacts"},
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
    challenge = proof = plan = ""
    recorded: list[Step] = []
    for step in steps:
        if "advance" in step:
            clock.now += timedelta(seconds=step["advance"])
            recorded.append(step)
            continue
        body = step.get("body")
        if body == "$assertion":
            body = {"challenge": challenge, "assertion": f"virtual:{challenge}"}
        if body == "$plan":
            body = {"plan_id": plan}
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
        plan = (found.get("prune_plan") or {}).get("id", plan)
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
    steps = [
        *reads(),
        *gate_steps(),
        *work_steps(),
        *shell_steps(),
        *people_steps(),
        *ops_steps(),
        *accounts_steps(),
        *later_steps(),
    ]
    payload = {"exported_at": EXPORT_NOW.isoformat(), "steps": run(steps)}
    text = json.dumps(payload, indent=1, ensure_ascii=False, sort_keys=True) + "\n"
    Path(sys.argv[1]).write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
