"""The shell's surfaces: the Guide panel, Docs, alerts, the trash, the offline pack and library."""

from fastapi.testclient import TestClient

from control_center.backends.mock.engine_shell import RESTORERS, send_to_trash
from tests.control_center.conftest import step_up

API = "/api/v1"


def turn_on(client: TestClient, key: str) -> None:
    """Turn on a switch setting; turning one on loosens it, so it takes a passkey."""
    answer = client.put(
        f"{API}/settings/{key}", json={"value": "on"}, headers={"X-Step-Up": step_up(client)}
    )
    assert answer.status_code == 200


def test_guide_answers_about_the_page_on_screen(client: TestClient) -> None:
    """Spec 14.8: the Guide panel asks Wayfinder about whatever is on screen."""
    answer = client.post(
        f"{API}/guide/ask",
        json={"question": "What is this?", "page": "/docs/infra", "context": "INFRASTRUCTURE.md"},
    ).json()

    assert answer["answer"].startswith("About INFRASTRUCTURE.md:")
    assert answer["sources"][0]["href"] == "/docs/infra"


def test_guide_refuses_an_empty_question(client: TestClient) -> None:
    """Spec 7.16, rule 9: the refusal says what to do next."""
    answer = client.post(f"{API}/guide/ask", json={"question": "  ", "page": "/"})

    assert answer.status_code == 409
    assert answer.json()["reason"] == "Type a question first."


def test_every_document_on_docs_opens_in_the_reader(client: TestClient) -> None:
    """Spec 7.2, Docs: the rendered documentation, not only a list."""
    groups = client.get(f"{API}/docs").json()["groups"]
    readable = [r for g in groups for r in g["rows"] if r["href"].startswith("/docs/")]

    assert len(readable) == 7
    for row in readable:
        page = client.get(f"{API}{row['href']}").json()
        assert page["title"] == row["title"]
        assert page["blocks"]


def test_a_change_request_becomes_a_work_item(client: TestClient) -> None:
    """Spec 7.2, Docs: requesting a change creates a work item."""
    made = client.post(
        f"{API}/docs/rs-readme/change-requests", json={"text": "Name the new inbox folder."}
    ).json()

    items = client.get(f"{API}/work").json()["items"]
    assert any(item["id"] == made["work_item_id"] for item in items)


def test_an_alert_can_be_acknowledged_and_undone(client: TestClient) -> None:
    """Spec 7.2, Today: dismiss an alert, with Undo (7.15, principle 6)."""
    before = [a["id"] for a in client.get(f"{API}/today").json()["alerts"]]
    client.post(f"{API}/alerts/{before[0]}/action", json={"action": "acknowledge"})
    hidden = [a["id"] for a in client.get(f"{API}/today").json()["alerts"]]
    client.post(f"{API}/alerts/{before[0]}/action", json={"action": "reopen"})

    assert before[0] not in hidden
    assert [a["id"] for a in client.get(f"{API}/today").json()["alerts"]] == before


def test_the_trash_keeps_thirty_days(client: TestClient) -> None:
    """Spec 7.16, rule 11: deleted things go to a 30-day trash; older ones are gone."""
    trash = client.get(f"{API}/trash").json()

    assert trash["retention_days"] == 30
    assert [i["id"] for i in trash["items"]] == ["TR-0007", "TR-0006", "TR-0005"]


def test_restoring_and_purging_leave_the_trash(client: TestClient) -> None:
    """Restore puts an item back; purge deletes it for good."""
    restored = client.post(f"{API}/trash/TR-0007/restore").json()
    purged = client.post(f"{API}/trash/TR-0006/purge")
    again = client.post(f"{API}/trash/TR-0006/restore")

    assert restored["home"] == "/finance"
    assert purged.status_code == 204
    assert again.status_code == 404
    assert [i["id"] for i in client.get(f"{API}/trash").json()["items"]] == ["TR-0005"]


def test_an_area_restores_what_it_sent_to_the_trash(client: TestClient) -> None:
    """The pattern areas A to E use: send what was deleted, register how it goes back."""
    world = client.app.state.backends.engine._world  # type: ignore[attr-defined]
    put_back: list[object] = []
    RESTORERS["rule"] = lambda _world, payload: put_back.append(payload)
    try:
        item = send_to_trash(
            world, kind="rule", title="A rule", meta="Finance", home="/finance", payload={"id": 1}
        )
        client.post(f"{API}/trash/{item.id}/restore")
    finally:
        RESTORERS.pop("rule")

    assert put_back == [{"id": 1}]


def test_the_offline_pack_needs_the_feature_and_a_passkey(client: TestClient) -> None:
    """Spec 7.7: off by default, and created only after a passkey step-up."""
    off = client.get(f"{API}/offline-pack")
    no_proof = client.put(f"{API}/settings/offline_pack", json={"value": "on"})
    turn_on(client, "offline_pack")
    pack = client.get(f"{API}/offline-pack").json()

    assert off.status_code == 409
    assert no_proof.json()["error"] == "step_up_required"
    assert [g["name"] for g in pack["groups"]] == [
        "Emergency sheets",
        "Next 30 days",
        "Key contacts",
        "Bills due",
    ]
    assert client.get(f"{API}/platform").json()["features_on"] == ["offline_pack"]


def test_the_library_follows_arks_rules(client: TestClient) -> None:
    """Spec 12.8: red flags open a quick card, no passage means no answer."""
    assert client.get(f"{API}/library").status_code == 409
    turn_on(client, "offline_library")

    def ask(question: str) -> dict[str, object]:
        answer: dict[str, object] = client.post(
            f"{API}/library/ask", json={"question": question}
        ).json()
        return answer

    assert ask("He is bleeding a lot")["quick_card"] == ask("bleeding")["quick_card"]
    assert ask("how do I make water safe")["citations"]
    assert ask("how do I tan leather")["answer"] is None
    hits = client.get(f"{API}/library/search?q=boil").json()["results"]
    assert [h["id"] for h in hits] == ["QC-water"]


def test_an_ark_drive_always_needs_a_passkey(client: TestClient) -> None:
    """Spec 12.8: writing an Ark drive needs a step-up."""
    turn_on(client, "offline_library")
    without = client.post(f"{API}/library/ark-drive", json={"volume": "ARK-1"})
    with_proof = client.post(
        f"{API}/library/ark-drive",
        json={"volume": "ARK-1"},
        headers={"X-Step-Up": step_up(client)},
    )

    assert without.json()["error"] == "step_up_required"
    assert with_proof.json()["message"].startswith("Writing Survive to ARK-1.")
