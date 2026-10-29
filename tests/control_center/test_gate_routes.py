"""The gate through HTTP: step-up, refusals, undo and the kill switch."""

from fastapi.testclient import TestClient

from tests.control_center.conftest import step_up


def test_loosening_without_a_proof_asks_for_a_step_up(client: TestClient) -> None:
    """Spec 7.4: loosening a safeguard without a passkey proof is refused with a reason."""
    answer = client.put("/api/settings/budget.voice", json={"value": "10"})

    assert answer.status_code == 403
    assert answer.json()["error"] == "step_up_required"
    assert answer.json()["reason"]


def test_loosening_with_a_proof_applies_and_the_proof_is_single_use(client: TestClient) -> None:
    """Spec 7.4: a step-up proof authorizes one change only."""
    proof = step_up(client)

    first = client.put(
        "/api/settings/budget.voice", json={"value": "10"}, headers={"X-Step-Up": proof}
    )
    second = client.put(
        "/api/settings/budget.voice", json={"value": "15"}, headers={"X-Step-Up": proof}
    )

    assert first.status_code == 200
    assert first.json()["value"] == "10"
    assert second.status_code == 403


def test_tightening_needs_no_proof(client: TestClient) -> None:
    """Spec 7.16, rule 3: tightening is always one tap, with no step-up."""
    answer = client.put("/api/settings/away_mode", json={"value": "on"})

    assert answer.status_code == 200
    assert client.get("/api/platform").json()["away"] is True


def test_a_cap_past_the_hard_limit_is_refused_even_with_a_proof(client: TestClient) -> None:
    """Spec 7.9: a cap above the policy.yaml ceiling is refused even with a step-up."""
    proof = step_up(client)

    answer = client.put(
        "/api/settings/budget.voice", json={"value": "500"}, headers={"X-Step-Up": proof}
    )

    assert answer.status_code == 422
    assert answer.json()["error"] == "refused"


def test_a_wrong_passkey_assertion_gives_no_proof(client: TestClient) -> None:
    """Spec 7.4: a step-up needs a valid passkey assertion."""
    challenge = client.post("/api/step-up/challenge").json()["challenge"]

    answer = client.post(
        "/api/step-up/verify", json={"challenge": challenge, "assertion": "forged"}
    )

    assert answer.status_code == 403


def test_approve_then_undo_returns_the_card_to_pending(client: TestClient) -> None:
    """Spec 7.4: a decision can be undone while the gate still holds the action."""
    pending = [a for a in client.get("/api/approvals").json() if not a["needs_step_up"]]
    approval_id = pending[0]["id"]

    approved = client.post(f"/api/approvals/{approval_id}/decision", json={"decision": "approve"})
    undone = client.post(f"/api/approvals/{approval_id}/undo")

    assert approved.json()["state"] == "approved"
    assert approved.json()["undo_until"] is not None
    assert undone.json()["state"] == "pending"


def test_deciding_twice_is_a_conflict(client: TestClient) -> None:
    """Spec 11.6: an approval card can be decided only once."""
    approval_id = client.get("/api/approvals").json()[0]["id"]
    client.post(f"/api/approvals/{approval_id}/decision", json={"decision": "deny"})

    again = client.post(f"/api/approvals/{approval_id}/decision", json={"decision": "deny"})

    assert again.status_code == 409


def test_restricted_approval_needs_a_step_up_to_approve(client: TestClient) -> None:
    """Spec 7.4: approving restricted data or class C needs a step-up."""
    restricted = next(a for a in client.get("/api/approvals").json() if a["needs_step_up"])

    answer = client.post(
        f"/api/approvals/{restricted['id']}/decision", json={"decision": "approve"}
    )

    assert answer.status_code == 403


def test_stop_is_one_tap_and_resume_needs_a_step_up(client: TestClient) -> None:
    """Spec 7.16, rule 3: Stop is one tap; resuming loosens, so it needs a step-up."""
    assert client.post("/api/platform/stop").json()["stopped"] is True
    assert client.post("/api/platform/resume").status_code == 403

    resumed = client.post("/api/platform/resume", headers={"X-Step-Up": step_up(client)})

    assert resumed.json()["stopped"] is False


def test_veto_records_the_reason(client: TestClient) -> None:
    """Spec 11.9: a veto of a critical decision records the Owner's reason."""
    open_decision = next(
        d for d in client.get("/api/decisions").json() if d["status"] == "pending_window"
    )

    vetoed = client.post(f"/api/decisions/{open_decision['id']}/veto", json={"reason": "Too soon"})

    assert vetoed.json()["status"] == "vetoed"
    assert vetoed.json()["veto_reason"] == "Too soon"


def test_unknown_ids_are_not_found(client: TestClient) -> None:
    """Spec 7.6: unknown ids answer 404 rather than failing."""
    assert client.post("/api/approvals/AP-NOPE/undo").status_code == 404
    assert client.post("/api/services/nope/restart").status_code == 404


def test_revert_restores_the_value_before_the_latest_change(client: TestClient) -> None:
    """Spec 7.9: every setting change is revertible in one step."""
    reverted = client.post("/api/settings/quiet_hours/revert")

    assert reverted.status_code == 200
    assert reverted.json()["value"] == "23:00–07:00"
    assert reverted.json()["history"][0]["new"] == "23:00–07:00"


def test_reverting_a_setting_that_never_changed_is_a_conflict(client: TestClient) -> None:
    """Spec 7.9: revert needs an earlier value to go back to."""
    assert client.post("/api/settings/away_mode/revert").status_code == 409
