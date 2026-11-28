"""Contacts, principals and the Approvals edits of spec 7.2 (area A of the front-end gaps)."""

from fastapi.testclient import TestClient

from tests.control_center.conftest import step_up

API = "/api/v1"
NEW = {
    "name": "Northside Vet",
    "area": "Pets",
    "principal": "owner",
    "channels": [{"kind": "phone", "value": "(555) 010-3300"}],
    "trust": "known",
}


def test_a_contact_shows_channels_history_and_what_mentions_it(client: TestClient) -> None:
    """Spec 7.2: channels, linked accounts and history; 7.16 rule 5: mentions before removal."""
    sheet = client.get(f"{API}/contacts/C-02").json()

    assert [c["kind"] for c in sheet["contact"]["channels"]] == ["email", "text"]
    assert sheet["contact"]["meta"] == "Rental · email, text"
    assert sheet["history"][0]["title"] == "Kitchen faucet drips"
    assert {(m["kind"], m["id"]) for m in sheet["mentions"]} == {
        ("draft", "AP-0108"),
        ("rule", "RL-07"),
    }


def test_adding_a_known_contact_takes_no_passkey_but_allowlisting_does(client: TestClient) -> None:
    """Spec 7.16, rule 3: friction follows the direction of risk."""
    known = client.post(f"{API}/contacts", json=NEW)
    trusted = client.post(f"{API}/contacts", json={**NEW, "trust": "allowlisted"})
    proved = client.post(
        f"{API}/contacts",
        json={**NEW, "trust": "allowlisted"},
        headers={"X-Step-Up": step_up(client)},
    )

    assert known.json()["meta"] == "Pets · phone"
    assert trusted.json()["error"] == "step_up_required"
    assert proved.json()["trust"] == "allowlisted"


def test_a_contact_needs_a_name(client: TestClient) -> None:
    """Spec 7.16, rule 9: the refusal says what to do."""
    answer = client.post(f"{API}/contacts", json={**NEW, "name": " "})

    assert answer.status_code == 409
    assert answer.json()["reason"] == "Give the contact a name first."


def test_editing_a_contact_changes_its_line(client: TestClient) -> None:
    """Edit in place; the line under the name follows the new details."""
    edited = client.put(
        f"{API}/contacts/C-03",
        json={**NEW, "name": "A-1 Plumbing", "area": "Home", "trust": "allowlisted"},
    ).json()

    assert edited["meta"] == "Home · phone"


def test_removing_a_contact_sends_it_to_the_trash_and_restore_brings_it_back(
    client: TestClient,
) -> None:
    """Spec 7.16, rule 11: deleted contacts go to the 30-day trash."""
    removed = client.post(f"{API}/contacts/C-04/remove").json()
    gone = [c["id"] for c in client.get(f"{API}/contacts").json()["contacts"]]
    client.post(f"{API}/trash/{removed['trash_id']}/restore")
    back = client.get(f"{API}/contacts/C-04").json()

    assert "C-04" not in gone
    assert removed["message"] == "Tax preparer moved to Recently deleted."
    assert back["history"][0]["title"] == "Engagement letter for 2026"


def test_merging_keeps_the_kept_contacts_trust(client: TestClient) -> None:
    """Merging never loosens: channels and history move, trust stays the kept one's."""
    kept = client.post(f"{API}/contacts/C-01/merge", json={"into": "C-05"}).json()
    sheet = client.get(f"{API}/contacts/C-05").json()
    trash = client.get(f"{API}/trash").json()["items"]

    assert kept["trust"] == "known"
    assert len(kept["channels"]) == 4
    assert len(sheet["history"]) == 3
    assert trash[0]["title"] == "Dr. Patel's office"


def test_adding_a_principal_needs_a_passkey(client: TestClient) -> None:
    """Spec 7.2: add a principal (step-up)."""
    without = client.post(f"{API}/principals", json={"name": "Grandma"})
    added = client.post(
        f"{API}/principals", json={"name": "Grandma"}, headers={"X-Step-Up": step_up(client)}
    ).json()

    assert without.json()["error"] == "step_up_required"
    assert added["meta"] == "Principal · 0 accounts · 0 calendars"


def test_mapping_a_new_account_needs_a_passkey_and_unmapping_does_not(client: TestClient) -> None:
    """An account belongs to one principal; mapping it moves it, and only adding loosens."""
    unmapped = client.put(
        f"{API}/principals/mom/accounts", json={"accounts": ["A-04"], "calendars": ["K-03"]}
    )
    no_proof = client.put(
        f"{API}/principals/mom/accounts", json={"accounts": ["A-04", "A-07"], "calendars": []}
    )
    moved = client.put(
        f"{API}/principals/mom/accounts",
        json={"accounts": ["A-04", "A-07"], "calendars": []},
        headers={"X-Step-Up": step_up(client)},
    )
    household = {m["id"]: m for m in client.get(f"{API}/contacts").json()["household"]}

    assert unmapped.json()["meta"] == "Principal · 1 account · 1 calendar"
    assert no_proof.json()["error"] == "step_up_required"
    assert moved.json()["accounts"] == ["A-04", "A-07"]
    assert household["dad"]["accounts"] == ["A-06"]


def test_removing_a_principal_has_seven_days_of_undo(client: TestClient) -> None:
    """Spec 7.2: remove a principal, archive or delete their data, 7-day undo then permanent."""
    owner = client.post(
        f"{API}/principals/owner/remove",
        json={"keep": "archive"},
        headers={"X-Step-Up": step_up(client)},
    )
    removing = client.post(
        f"{API}/principals/dad/remove",
        json={"keep": "delete"},
        headers={"X-Step-Up": step_up(client)},
    ).json()
    kept = client.post(f"{API}/principals/dad/undo-remove").json()

    assert owner.json()["reason"] == "The Owner can't be removed from the household."
    assert removing["removal"]["keep"] == "delete"
    assert kept["removal"] is None


def test_the_owner_can_edit_a_draft_before_approving(client: TestClient) -> None:
    """Spec 7.2, Approvals: edit the draft."""
    card = client.put(
        f"{API}/approvals/AP-0107/draft", json={"draft": "Hi, Tuesday at 10:30 works. Thanks!"}
    ).json()
    release = client.put(f"{API}/approvals/AP-0109/draft", json={"draft": "x"})

    assert card["draft"] == "Hi, Tuesday at 10:30 works. Thanks!"
    assert release.json()["reason"] == "This card has no draft to edit."


def test_an_unticked_message_is_left_out_of_a_batch(client: TestClient) -> None:
    """Spec 7.2, Approvals: untick messages in a batch."""
    client.put(f"{API}/approvals/AP-0111/batch/B-3", json={"included": False})
    client.put(f"{API}/approvals/AP-0111/batch/B-2", json={"included": False})
    last = client.put(f"{API}/approvals/AP-0111/batch/B-1", json={"included": False})
    approved = client.post(f"{API}/approvals/AP-0111/decision", json={"decision": "approve"}).json()

    assert last.json()["reason"] == "Keep at least one message, or deny the card."
    assert approved["decided_note"] == "Approved · Keystone is sending 1 of 3"


def test_always_allow_this_contact_allowlists_from_the_card(client: TestClient) -> None:
    """Spec 7.16, rule 4: ask at the moment it matters, with a step-up."""
    without = client.post(f"{API}/approvals/AP-0108/allow-recipient")
    card = client.post(
        f"{API}/approvals/AP-0108/allow-recipient", headers={"X-Step-Up": step_up(client)}
    ).json()
    contact = client.get(f"{API}/contacts/C-02").json()["contact"]

    assert without.json()["error"] == "step_up_required"
    assert (card["recipient_trust"], card["tier"]) == ("allowlisted", "T2")
    assert contact["trust"] == "allowlisted"
