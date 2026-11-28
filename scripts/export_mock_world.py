"""Write the mock world as JSON for the in-browser preview's mock backend.

Usage: uv run python scripts/export_mock_world.py src/control_center/web/src/preview/mock-world.json

The preview runs the same app on the same mock data as the server. The data comes only from the
Python fixtures: this script dumps the world `build_world` starts from (built against the fixed
instant `EXPORT_NOW`, which the browser shifts to its own clock at start-up) and every fixture
view the mock backend reads, including each variant a setting can select. `make ci` regenerates
the file and fails if it changed, so a fixture edit cannot leave the preview behind.
"""

import json
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from control_center.backends.mock import activity, chat, gate, gate_step_up, status
from control_center.backends.mock.engine_work import INSTRUMENT_COUNT
from control_center.backends.mock.fixtures import chat as chat_fixtures
from control_center.backends.mock.fixtures import gate as gate_fixtures
from control_center.backends.mock.fixtures import (
    ops,
    people,
    personal,
    platform,
    reference,
    shell,
    work,
)
from control_center.backends.mock.fixtures import settings as settings_fixtures
from control_center.backends.mock.fixtures import threads as thread_fixtures
from control_center.backends.mock.threads import BLOCKED_WORDS, STATE_ORDER, WAITING_WORDS
from control_center.backends.mock.world import build_world
from control_center.events import EventBus
from control_center.today import NEEDS_YOU_SHOWN, TEAM_SHOWN

EXPORT_NOW = datetime(2026, 10, 25, 16, 0, tzinfo=UTC)
"""The instant the exported world is built against. Any fixed value works: the browser moves
every time in the world by the same amount, so relative times ("in 2 hours") stay as built."""


def dump(value: Any) -> Any:
    """JSON-ready form of fixture values: models, dataclasses, lists, dicts and plain values."""
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, list | tuple | set | frozenset):
        return [dump(item) for item in value]
    if isinstance(value, dict):
        return {str(key): dump(item) for key, item in value.items()}
    if hasattr(value, "__dataclass_fields__"):
        return dump(asdict(value))
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def world_state() -> dict[str, Any]:
    """The mutable state the mock backends start from."""
    world = build_world(EventBus(), clock=lambda: EXPORT_NOW)
    fields = [
        "approvals",
        "decisions",
        "settings",
        "contacts",
        "tasks",
        "transcripts",
        "threads",
        "work_items",
        "employees",
        "proposals",
        "cases",
        "changes",
        "setup",
        "jobs",
        "fixes",
        "chats",
        "chat_heads",
        "alerts",
        "trash",
    ]
    state = {name: dump(getattr(world, name)) for name in fields}
    state["stopped"] = world.stopped
    state["maintenance_running"] = world.maintenance_running
    return state


def fixtures() -> dict[str, Any]:
    """Every read-only fixture view, with each variant a setting can select."""
    voice_choices = next(
        s for s in settings_fixtures.settings(EXPORT_NOW) if s.key == "voice.profile"
    )
    ceilings = {
        (s.ceiling or 0) for s in settings_fixtures.settings(EXPORT_NOW) if s.kind == "money"
    }
    return {
        "hard_limits": dump(settings_fixtures.hard_limits()),
        "household": dump(gate_fixtures.household()),
        "service_groups": dump(platform.service_groups()),
        "memory_zones": dump(platform.MEMORY_ZONES),
        "health_metrics": dump(platform.health_metrics()),
        "health_readings": {
            name: list(map(list, r)) for name, r in platform.HEALTH_READINGS.items()
        },
        "system_tiles": dump(platform.system_tiles()),
        "system_rows": dump(platform.system_rows()),
        "family_assignments": {
            "independent": dump(platform.family_assignments(independent_reviewer=True)),
            "shared": dump(platform.family_assignments(independent_reviewer=False)),
        },
        "reviewer_impact": dump(platform.reviewer_impact()),
        "model_stats": dump(platform.model_stats()),
        "tokens_panel": dump(platform.tokens_panel()),
        "paid_features": dump(platform.PAID_FEATURES),
        "cloud_impact": {str(c): dump(platform.cloud_impact(c)) for c in sorted(ceilings)},
        "security_tiles": dump(ops.security_tiles()),
        "security_flags": dump(ops.security_flags()),
        "sign_in_rows": dump(ops.sign_in_rows()),
        "audit_lines": dump(ops.AUDIT_LINES),
        "backup_targets": dump(ops.backup_targets()),
        "retention": dump(ops.retention()),
        "connection_groups": dump(ops.connection_groups()),
        "voice_profiles": {
            f"{choice}|{str(celebrity).lower()}": dump(
                ops.voice_profiles(choice, celebrity_clones=celebrity)
            )
            for choice in voice_choices.choices
            for celebrity in (True, False)
        },
        "maintenance_stats": dump(ops.maintenance_stats()),
        "findings": dump(ops.findings()),
        "agenda": dump(personal.agenda()),
        "domains": dump(personal.domains()),
        "finance": {p: dump(personal.finance(p)) for p in ("owner", "mom", "dad")},
        "doc_groups": dump(reference.doc_groups()),
        "search_index": dump(reference.search_index()),
        "wayfinder_answers": dump(reference.WAYFINDER_ANSWERS),
        "ideas": dump(work.ideas()),
        "reviews": dump(work.reviews()),
        "task_stages": dump(work.TASK_STAGES),
        "stage_rails": {str(s): dump(work.stage_rail(s)) for s in set(work.TASK_STAGES.values())},
        "not_yet_hired": sorted(people.NOT_YET_HIRED),
        "chat_leads": dump(chat_fixtures.LEADS),
        "mock_reply": chat_fixtures.MOCK_REPLY,
        "mock_retry": chat_fixtures.MOCK_RETRY,
        "thread_leads": thread_fixtures.LEADS,
        "doc_bodies": dump(shell.DOC_BODIES),
        "intake_stage": {
            "stages": dump(work.stage_rail(0)),
            "label": work.phase_label(0, "D0 intake"),
        },
        "guide_pages": {page: dump(list(said)) for page, said in shell.GUIDE_PAGES.items()},
        "guide_fallback": shell.GUIDE_FALLBACK,
        "offline_pack": dump(shell.offline_pack()),
        "library_categories": shell.LIBRARY_CATEGORIES,
        "quick_cards": dump(shell.quick_cards()),
        "library_tiers": dump(shell.library_tiers()),
        "red_flags": shell.RED_FLAGS,
        "library_answers": {w: dump(list(a)) for w, a in shell.LIBRARY_ANSWERS.items()},
        "library_caveat": shell.LIBRARY_CAVEAT,
        "no_passage": shell.NO_PASSAGE,
    }


def constants() -> dict[str, Any]:
    """The rules' numbers and words, so the browser mock reads them instead of repeating them."""
    return {
        "undo_window_seconds": gate.UNDO_WINDOW.total_seconds(),
        "step_up_lifetime_seconds": gate_step_up.STEP_UP_LIFETIME.total_seconds(),
        "mock_assertion_prefix": gate_step_up.MOCK_ASSERTION_PREFIX,
        "word_delay_seconds": chat.WORD_DELAY_SECONDS,
        "title_words": chat.TITLE_WORDS,
        "instrument_count": INSTRUMENT_COUNT,
        "needs_you_shown": NEEDS_YOU_SHOWN,
        "team_shown": TEAM_SHOWN,
        "state_order": STATE_ORDER,
        "blocked_words": BLOCKED_WORDS,
        "waiting_words": WAITING_WORDS,
        "call_script": status.CALL_SCRIPT,
        "pool_mode": status.POOL_MODE,
        "backup_mode": dump(status.BACKUP_MODE),
        "tick_seconds": activity.TICK_SECONDS,
        "transcript_every_ticks": activity.TRANSCRIPT_EVERY_TICKS,
        "sample_every_ticks": activity.SAMPLE_EVERY_TICKS,
        "rate_bounds": list(activity.RATE_BOUNDS),
        "streamed_code": activity.STREAMED_CODE,
        "trash_days": shell.TRASH_DAYS,
        "snooze_seconds": shell.SNOOZE.total_seconds(),
        "app_features": list(gate.APP_FEATURES),
        "ark_volumes": shell.ARK_VOLUMES,
    }


def main() -> None:
    """Dump the world, the fixtures and the constants to the path given."""
    payload = {
        "exported_at": EXPORT_NOW.isoformat(),
        "world": world_state(),
        "fixtures": fixtures(),
        "constants": constants(),
    }
    # Keys keep fixture order: the backends list objects in that order.
    text = json.dumps(payload, indent=1, ensure_ascii=False) + "\n"
    Path(sys.argv[1]).write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
