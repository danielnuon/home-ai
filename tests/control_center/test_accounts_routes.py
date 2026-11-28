"""Accounts, security and money: Connections, Voice, Security, export and impact previews."""

from typing import Any

from fastapi.testclient import TestClient

from tests.control_center.conftest import step_up

API = "/api/v1"


def connection(client: TestClient, connection_id: str) -> dict[str, Any]:
    """One connection as the Connections page shows it."""
    groups = client.get(f"{API}/connections").json()["groups"]
    found: dict[str, Any] = next(
        c for g in groups for c in g["connections"] if c["id"] == connection_id
    )
    return found


def proof(client: TestClient) -> dict[str, str]:
    """The step-up header with a fresh proof."""
    return {"X-Step-Up": step_up(client)}


def test_connections_are_grouped_by_kind_with_github_details(client: TestClient) -> None:
    """Spec 7.2, Connections: scopes, last error and GitHub's token expiry and last push."""
    groups = client.get(f"{API}/connections").json()["groups"]

    assert [g["name"] for g in groups] == [
        "This Mac's apps",
        "Accounts by person",
        "Platform links",
        "Optional paid providers",
    ]
    github = connection(client, "github")
    assert github["expires"] and github["last_push"] and github["scopes"]
    assert connection(client, "acct-mom")["status"]["label"] == "Error"


def test_connecting_needs_a_passkey_and_disconnecting_does_not(client: TestClient) -> None:
    """Spec 7.16, rule 3: connecting loosens, disconnecting tightens."""
    assert client.post(f"{API}/connections/huggingface/disconnect").status_code == 200
    asked = client.post(f"{API}/connections/huggingface/connect")
    assert asked.status_code == 403

    done = client.post(f"{API}/connections/huggingface/connect", headers=proof(client)).json()
    assert done["connection"]["connected"] is True


def test_a_secret_is_stored_without_being_sent_back(client: TestClient) -> None:
    """Spec 7.2: a provider secret is stored by the broker and never shown again."""
    assert (
        client.put(f"{API}/connections/provider-openai/secret", json={"value": "sk-1"}).status_code
        == 403
    )
    answer = client.put(
        f"{API}/connections/provider-openai/secret", json={"value": "sk-1"}, headers=proof(client)
    )

    assert "sk-1" not in answer.text
    assert answer.json()["connection"]["status"]["label"] == "Key stored"
    removed = client.post(f"{API}/connections/provider-openai/secret/remove").json()
    assert removed["connection"]["secret"] == "none"


def test_a_failing_connection_says_so_when_tested(client: TestClient) -> None:
    """Spec 7.16, rule 9: a failed test says what to do next."""
    answer = client.post(f"{API}/connections/acct-mom/test").json()

    assert answer["ok"] is False
    assert "Replace its key" in answer["message"]


def test_a_macos_prompt_can_be_shown_again(client: TestClient) -> None:
    """Spec 7.2: re-run a macOS permission prompt; an allowed app has none to show."""
    assert client.post(f"{API}/connections/calendar/permission").status_code == 409
    answer = client.post(f"{API}/connections/messages/permission").json()

    assert answer["connection"]["permission"] == "waiting"


def test_a_stock_voice_takes_one_tap_and_a_clone_a_passkey(client: TestClient) -> None:
    """Spec 11.5.1: stock in one tap; a clone needs consent and a step-up."""
    stock = client.post(f"{API}/voice/profiles", json={"kind": "stock", "stock_id": "bella"})
    assert stock.status_code == 200
    clone = {"kind": "consented_clone", "name": "Grandma", "sample": "memo.m4a"}
    assert client.post(f"{API}/voice/profiles", json=clone).json()["reason"].startswith("Say how")

    clone["consent"] = "She agreed in person"
    assert client.post(f"{API}/voice/profiles", json=clone).status_code == 403
    made = client.post(f"{API}/voice/profiles", json=clone, headers=proof(client)).json()

    assert made["id"] == "grandma"
    choices = next(
        s for s in client.get(f"{API}/settings").json()["settings"] if s["key"] == "voice.profile"
    )["choices"]
    assert "grandma" in choices and "bella" in choices


def test_a_celebrity_clone_needs_the_setting_and_the_notice(client: TestClient) -> None:
    """Spec 11.5.1, guardrail 3."""
    body = {"kind": "celebrity_clone", "name": "Anchor", "sample": "clip.wav"}
    assert "Turn on" in client.post(f"{API}/voice/profiles", json=body).json()["reason"]


def test_deleting_the_call_voice_falls_back_to_twilio(client: TestClient) -> None:
    """Spec 11.5.1: deleting removes the profile; calls fall back to Twilio's voice."""
    assert client.post(f"{API}/voice/profiles/heart/delete").status_code == 204
    voice = client.get(f"{API}/voice").json()

    assert next(p for p in voice["profiles"] if p["selected"])["id"] == "twilio_default"
    assert client.post(f"{API}/voice/profiles/twilio_default/delete").status_code == 409


def test_a_workspace_stops_at_once_and_resumes_with_a_passkey(client: TestClient) -> None:
    """Spec 7.2, Security: stop one workspace; resume needs a step-up."""
    assert client.post(f"{API}/security/workspaces/ws-rental/stop").json()["stopped"] is True
    assert client.post(f"{API}/security/workspaces/ws-rental/resume").status_code == 403
    resumed = client.post(f"{API}/security/workspaces/ws-rental/resume", headers=proof(client))

    assert resumed.json()["stopped"] is False


def test_the_last_passkey_can_only_be_removed_at_the_desk(client: TestClient) -> None:
    """Spec 7.2, Security: passkeys need a step-up, and the last one only goes at the desk."""
    removed = client.post(f"{API}/security/passkeys/pk-key/remove", headers=proof(client))
    assert removed.status_code == 200

    last = client.post(f"{API}/security/passkeys/pk-iphone/remove", headers=proof(client))
    assert last.status_code == 409
    assert "at the desk" in last.json()["reason"]


def test_signing_out_another_device_takes_one_tap(client: TestClient) -> None:
    """Spec 7.2, Security: sign out a device; the one in use stays."""
    assert client.post(f"{API}/security/devices/dev-ipad/sign-out").status_code == 200
    assert client.post(f"{API}/security/devices/dev-mac/sign-out").status_code == 409


def test_recovery_codes_and_the_authenticator_need_a_passkey(client: TestClient) -> None:
    """Spec 7.2, Security: shown once, behind a step-up."""
    assert client.post(f"{API}/security/recovery-codes").status_code == 403
    codes = client.post(f"{API}/security/recovery-codes", headers=proof(client)).json()["codes"]
    assert len(codes) == 8
    assert client.post(f"{API}/security/totp/reset", headers=proof(client)).status_code == 200


def test_the_audit_export_keeps_only_matching_lines(client: TestClient) -> None:
    """Spec 7.2, Security: export a filtered audit range."""
    answer = client.post(f"{API}/security/audit/export", json={"filter": "deny"}).json()

    assert answer["lines"] == [line for line in answer["lines"] if "deny" in line]
    assert answer["message"] == "Exported 1 line"


def test_security_summarises_the_allowlist_from_contacts(client: TestClient) -> None:
    """Spec 7.16: the allowlist's home is Contacts; Security links there."""
    security = client.get(f"{API}/security").json()

    assert {row["href"] for row in security["allowlist"]} == {"/contacts"}
    assert len(security["allowlist"]) == 3


def test_a_data_export_needs_a_passkey(client: TestClient) -> None:
    """Spec 7.2, Settings: export all data or one principal's (step-up)."""
    assert client.post(f"{API}/exports", json={"scope": "mom"}).status_code == 403
    answer = client.post(f"{API}/exports", json={"scope": "mom"}, headers=proof(client)).json()

    assert "Mom's data" in answer["message"]


def test_spend_has_a_ledger_and_forecast(client: TestClient) -> None:
    """Spec 7.2, Spend: ledger by service, pipeline, idea, work item and month; forecast."""
    spend = client.get(f"{API}/spend").json()

    assert {entry["month"] for entry in spend["ledger"]} == {"October", "September"}
    assert spend["forecast"]["value"] == "$0.00"


def test_impact_shows_before_loosening_and_not_before_tightening(client: TestClient) -> None:
    """Spec 7.18: a card before a change that adds cost or load; tightening is one tap."""
    raised = client.get(f"{API}/settings/budget.voice/impact", params={"value": "10"}).json()
    assert raised["lines"][0]["change"] == "$0 → $10"
    reviewer = client.get(
        f"{API}/settings/models.review.independent/impact", params={"value": "on"}
    ).json()
    assert reviewer["lines"]
    off = client.get(f"{API}/settings/image.enabled/impact", params={"value": "off"}).json()
    assert off["lines"] == []
    bad = client.get(f"{API}/settings/budget.voice/impact", params={"value": "999"})
    assert bad.status_code == 422


def test_predicted_versus_actual_after_seven_days(client: TestClient) -> None:
    """Spec 7.18: after 7 days the history card shows predicted versus actual."""
    outcomes = client.get(f"{API}/settings/quiet_hours/outcomes").json()["outcomes"]

    assert outcomes[0]["ready"] is True
    assert all(line["actual"] for line in outcomes[0]["lines"])
    assert client.get(f"{API}/settings/away_mode/outcomes").json()["outcomes"] == []
