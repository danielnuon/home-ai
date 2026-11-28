"""The operations controls: System, Models, Services, Schedule, Backups and Maintenance."""

from fastapi.testclient import TestClient

from tests.control_center.conftest import step_up

API = "/api/v1"


def test_pool_mode_changes_and_today_follows(client: TestClient) -> None:
    """Spec 7.2, System: change pool mode; end image mode returns it to L (8.3)."""
    system = client.put(f"{API}/system/pool-mode", json={"mode": "I"}).json()
    tile = next(t for t in client.get(f"{API}/today").json()["tiles"] if t["name"] == "Model pool")
    ended = client.post(f"{API}/system/pool-mode/end").json()

    assert system["pool"]["mode"] == "I"
    assert system["pool"]["can_end"] is True
    assert tile["status"]["label"] == "Mode I"
    assert ended["pool"]["mode"] == "L"


def test_benchmark_mode_is_not_the_owners_to_choose(client: TestClient) -> None:
    """Spec 8.3: mode B is a selector run's; the refusal says where to start one."""
    answer = client.put(f"{API}/system/pool-mode", json={"mode": "B"})

    assert answer.status_code == 409
    assert "selection run" in answer.json()["reason"]


def test_every_mode_offered_carries_its_impact(client: TestClient) -> None:
    """Spec 7.18: what a change will do is shown before it is made."""
    options = client.get(f"{API}/system").json()["pool"]["options"]

    assert [o["mode"] for o in options] == ["L", "S", "I", "F"]
    assert all(o["impact"] for o in options)


def test_desk_mode_moves_memory_to_the_owner_and_takes_no_passkey(client: TestClient) -> None:
    """Spec 8.11.2: Desk mode frees up to 4 GB of the pool; an operating choice either way."""
    on = client.put(f"{API}/settings/resources.desk_mode", json={"value": "on"})
    zones = {z["name"]: z["budget_gb"] for z in client.get(f"{API}/system").json()["zones"]}
    off = client.put(f"{API}/settings/resources.desk_mode", json={"value": "off"})

    assert on.status_code == off.status_code == 200
    assert zones["macOS and your session"] == 12
    assert zones["Model pool"] == 38


def test_the_pressure_drill_degrades_brain_and_comes_back(client: TestClient) -> None:
    """Spec 7.17: warning and critical each raise a banner; critical holds heavy jobs."""
    client.post(f"{API}/system/pressure-drill")
    warning = client.get(f"{API}/platform").json()
    client.post(f"{API}/system/pressure-drill")
    held = client.post(f"{API}/schedule/snapshots/run")
    light = client.post(f"{API}/schedule/daily-brief/run")
    client.post(f"{API}/system/pressure-drill")
    normal = client.get(f"{API}/platform").json()

    assert warning["pressure"] == "warning"
    assert len(warning["degraded"]) == 1
    assert held.status_code == 409
    assert light.status_code == 200
    assert normal["pressure"] == "normal"
    assert normal["degraded"] == []


def test_a_health_check_reports_what_it_checked(client: TestClient) -> None:
    """Spec 7.2, System: run a health check."""
    check = client.post(f"{API}/system/health-check").json()["health_check"]

    assert check["summary"]["label"] == "1 thing needs you"
    assert {r["id"] for r in check["rows"]} >= {"services", "audit", "drives"}


def test_pins_and_selection(client: TestClient) -> None:
    """Spec 7.2, Models: pin a family; run selection now, once."""
    pinned = client.put(f"{API}/models/families/CODE/pin", json={"pinned": True}).json()
    first = client.post(f"{API}/models/selection")
    again = client.post(f"{API}/models/selection")

    code = next(a for a in pinned["assignments"] if a["family"] == "CODE")
    assert code["pinned"] is True
    assert first.json()["selection"]["queued"] is True
    assert again.status_code == 409


def test_the_pending_plan_is_a_vetoable_decision(client: TestClient) -> None:
    """Spec 7.2, Models: veto a pending plan; it is a critical decision record (11.9)."""
    ids = client.get(f"{API}/models").json()["plan_decisions"]
    decisions = {d["id"]: d for d in client.get(f"{API}/decisions").json()}

    assert ids
    assert all(decisions[i]["vetoable"] for i in ids)


def test_a_services_full_log_is_masked_and_kept_30_days(client: TestClient) -> None:
    """Spec 7.2, Services: open a service's logs (13.7: 30 days)."""
    log = client.get(f"{API}/services/model-router/logs").json()

    assert log["retained"].startswith("Kept for 30 days")
    assert any(line["level"] == "warn" for line in log["lines"])


def test_job_times_change_in_place_unless_two_heavy_jobs_collide(client: TestClient) -> None:
    """Spec 7.2, Schedule: change job times in place; heavy jobs share the lock one at a time."""
    clash = client.put(f"{API}/schedule/pruning/time", json={"time": "23:30"})
    moved = client.put(f"{API}/schedule/pruning/time", json={"time": "03:30"}).json()

    job = next(j for j in moved["jobs"] if j["id"] == "pruning")
    assert clash.status_code == 409
    assert job["when"] == "Sun 03:30"
    assert job["time"] == "03:30"


def test_a_restore_drill_is_recorded(client: TestClient) -> None:
    """Spec 13.5: run a restore drill, and the result is shown on Backups."""
    backups = client.post(f"{API}/backups/drill").json()

    assert backups["drill"]["detail"].startswith("Today")
    assert backups["drills"][0]["title"] == "Today"


def test_a_prune_runs_only_the_plan_seen_and_needs_a_passkey(client: TestClient) -> None:
    """Spec 13.7, 7.16 rule 5: the plan comes first, and the prune is gated."""
    plan = client.post(f"{API}/backups/prune-plan").json()["prune_plan"]
    stale = client.post(f"{API}/backups/prune", json={"plan_id": "PP-old"})
    bare = client.post(f"{API}/backups/prune", json={"plan_id": plan["id"]})
    done = client.post(
        f"{API}/backups/prune",
        json={"plan_id": plan["id"]},
        headers={"X-Step-Up": step_up(client)},
    )

    assert stale.status_code == 409
    assert bare.status_code == 403
    assert done.status_code == 200
    assert client.get(f"{API}/backups").json()["prune_plan"] is None


def test_raising_maintenance_to_fix_needs_a_passkey_and_lowering_does_not(
    client: TestClient,
) -> None:
    """Spec 7.2, Maintenance: raise to fix (step-up), lower to scan (one tap)."""
    raise_bare = client.put(f"{API}/settings/maintenance.receipt-scanner", json={"value": "fix"})
    lower = client.put(f"{API}/settings/maintenance.lease-reminders", json={"value": "scan"})

    levels = {p["repo"]: p["level"] for p in client.get(f"{API}/maintenance").json()["products"]}
    assert raise_bare.status_code == 403
    assert lower.status_code == 200
    assert levels == {"lease-reminders": "scan", "receipt-scanner": "scan"}


def test_wont_fix_keeps_the_reason_and_can_be_reopened(client: TestClient) -> None:
    """Spec 7.2, Maintenance: mark a finding won't-fix with a reason."""
    empty = client.post(f"{API}/maintenance/findings/F-042/wont-fix", json={"reason": " "})
    closed = client.post(f"{API}/maintenance/findings/F-042/wont-fix", json={"reason": "Moving"})
    reopened = client.post(f"{API}/maintenance/findings/F-042/reopen").json()

    assert empty.status_code == 409
    assert closed.json()["reason"] == "Moving"
    assert reopened["state"] == "open"


def test_trends_follow_the_page(client: TestClient) -> None:
    """Spec 7.18: the metric catalog with 7- and 30-day trends on System, Models and Settings."""
    system = client.get(f"{API}/metrics?page=system").json()["groups"]
    everything = client.get(f"{API}/metrics").json()["groups"]

    assert {g["area"] for g in system} == {
        "Memory",
        "Stability",
        "Hardware",
        "Energy",
        "Responsiveness",
    }
    assert len(everything) > len(system)
    assert all(len(t["week"]) == 7 for g in everything for t in g["trends"])
