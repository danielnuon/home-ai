"""The gate through HTTP: step-up, refusals, undo and the kill switch."""

from fastapi.testclient import TestClient

from tests.control_center.conftest import step_up


def test_loosening_without_a_proof_asks_for_a_step_up(client: TestClient) -> None:
    answer = client.put("/api/settings/budget.voice", json={"value": "10"})

    assert answer.status_code == 403
    assert answer.json()["error"] == "step_up_required"
    assert answer.json()["reason"]


def test_loosening_with_a_proof_applies_and_the_proof_is_single_use(client: TestClient) -> None:
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
    answer = client.put("/api/settings/away_mode", json={"value": "on"})

    assert answer.status_code == 200
    assert client.get("/api/platform").json()["away"] is True


def test_a_cap_past_the_hard_limit_is_refused_even_with_a_proof(client: TestClient) -> None:
    proof = step_up(client)

    answer = client.put(
        "/api/settings/budget.voice", json={"value": "500"}, headers={"X-Step-Up": proof}
    )

    assert answer.status_code == 422
    assert answer.json()["error"] == "refused"


def test_a_wrong_passkey_assertion_gives_no_proof(client: TestClient) -> None:
    challenge = client.post("/api/step-up/challenge").json()["challenge"]

    answer = client.post(
        "/api/step-up/verify", json={"challenge": challenge, "assertion": "forged"}
    )

    assert answer.status_code == 403


def test_approve_then_undo_returns_the_card_to_pending(client: TestClient) -> None:
    pending = [a for a in client.get("/api/approvals").json() if not a["needs_step_up"]]
    approval_id = pending[0]["id"]

    approved = client.post(f"/api/approvals/{approval_id}/decision", json={"decision": "approve"})
    undone = client.post(f"/api/approvals/{approval_id}/undo")

    assert approved.json()["state"] == "approved"
    assert approved.json()["undo_until"] is not None
    assert undone.json()["state"] == "pending"


def test_deciding_twice_is_a_conflict(client: TestClient) -> None:
    approval_id = client.get("/api/approvals").json()[0]["id"]
    client.post(f"/api/approvals/{approval_id}/decision", json={"decision": "deny"})

    again = client.post(f"/api/approvals/{approval_id}/decision", json={"decision": "deny"})

    assert again.status_code == 409


def test_restricted_approval_needs_a_step_up_to_approve(client: TestClient) -> None:
    restricted = next(a for a in client.get("/api/approvals").json() if a["needs_step_up"])

    answer = client.post(
        f"/api/approvals/{restricted['id']}/decision", json={"decision": "approve"}
    )

    assert answer.status_code == 403


def test_stop_is_one_tap_and_resume_needs_a_step_up(client: TestClient) -> None:
    assert client.post("/api/platform/stop").json()["stopped"] is True
    assert client.post("/api/platform/resume").status_code == 403

    resumed = client.post("/api/platform/resume", headers={"X-Step-Up": step_up(client)})

    assert resumed.json()["stopped"] is False


def test_veto_records_the_reason(client: TestClient) -> None:
    open_decision = next(
        d for d in client.get("/api/decisions").json() if d["status"] == "pending_window"
    )

    vetoed = client.post(f"/api/decisions/{open_decision['id']}/veto", json={"reason": "Too soon"})

    assert vetoed.json()["status"] == "vetoed"
    assert vetoed.json()["veto_reason"] == "Too soon"


def test_unknown_ids_are_not_found(client: TestClient) -> None:
    assert client.post("/api/approvals/AP-NOPE/undo").status_code == 404
    assert client.post("/api/services/nope/restart").status_code == 404
