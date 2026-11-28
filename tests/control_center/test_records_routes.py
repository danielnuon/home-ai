"""Personal records, Finance sources and uploads, and Setup's secret form and interview (area C)."""

from fastapi.testclient import TestClient

from tests.control_center.conftest import step_up

API = "/api/v1"


def test_personal_shows_every_part_spec_7_2_lists(client: TestClient) -> None:
    """Spec 7.2, Personal: obligations, rules, brief archive, sync status, checklist."""
    page = client.get(f"{API}/personal").json()

    for part in ("obligations", "rules", "briefs", "sync", "checklist", "assignees"):
        assert page[part], part
    dated = [o for o in page["obligations"] if o["days"] is not None]
    assert [o["days"] for o in dated] == sorted(o["days"] for o in dated)
    assert page["obligations"][-1]["kind"] == "usage"


def test_a_new_case_is_open_and_can_be_reassigned_and_noted(client: TestClient) -> None:
    """Spec 7.2, Personal: add a case; reassign and note on a case."""
    case = client.post(
        f"{API}/cases",
        json={
            "title": "Renew passport",
            "domain": "Calendar and admin",
            "principal": "owner",
            "due": "2030-03-12",
            "employee_name": "Hearth",
        },
    ).json()
    assert case["due"] == "Mar 12"
    assert case["state"] == "open"

    moved = client.post(f"{API}/cases/{case['id']}/reassign", json={"employee_name": "You"})
    assert moved.json()["employee_name"] == "You"
    noted = client.post(f"{API}/cases/{case['id']}/notes", json={"text": "Photos done."}).json()
    assert noted["notes"][0]["text"] == "Photos done."
    assert client.get(f"{API}/personal").json()["cases"][0]["id"] == case["id"]


def test_case_forms_refuse_what_they_cannot_file(client: TestClient) -> None:
    """Spec 7.16, rule 9: every refusal says what to do next."""
    bad = client.post(
        f"{API}/cases",
        json={
            "title": "x",
            "domain": "Space",
            "principal": "owner",
            "due": "2030-01-01",
            "employee_name": "Hearth",
        },
    )
    assert bad.status_code == 409
    assert bad.json()["reason"] == "Pick one of the domains."
    nobody = client.post(f"{API}/cases/CS-0201/reassign", json={"employee_name": "Bob"})
    assert nobody.status_code == 409


def test_an_obligation_lands_on_the_calendar(client: TestClient) -> None:
    """Spec 20.3: a recurring rule by date, with a lead time."""
    made = client.post(
        f"{API}/obligations",
        json={
            "title": "Gutter cleaning",
            "domain": "Home and auto",
            "principal": "owner",
            "due": "2031-04-01",
            "repeat": "yearly",
        },
    ).json()

    assert made["rule"] == "Every year"
    assert made["lead_days"] == 14
    ids = [o["id"] for o in client.get(f"{API}/personal").json()["obligations"]]
    assert made["id"] in ids


def test_a_domain_record_can_be_added_edited_deleted_and_restored(client: TestClient) -> None:
    """Spec 7.2, Personal; 7.16, rule 11: deleted records wait in the 30-day trash."""
    record = client.post(
        f"{API}/domains/home-auto/records", json={"principal": "owner", "title": "Lawn mower"}
    ).json()
    edited = client.put(
        f"{API}/records/{record['id']}", json={"title": "Lawn mower", "meta": "Bought 2024"}
    ).json()
    assert edited["meta"] == "Bought 2024"

    trashed = client.delete(f"{API}/records/{record['id']}").json()
    assert trashed["kind"] == "record"
    page = client.get(f"{API}/domains/home-auto").json()
    assert record["id"] not in [r["id"] for r in page["records"]]

    client.post(f"{API}/trash/{trashed['id']}/restore")
    page = client.get(f"{API}/domains/home-auto").json()
    assert record["id"] in [r["id"] for r in page["records"]]


def test_an_uploaded_document_is_filed_with_its_size(client: TestClient) -> None:
    """Spec 7.2, Personal: upload a document into a domain."""
    doc = client.post(
        f"{API}/domains/taxes/documents",
        json={"principal": "mom", "filename": "1099-R.pdf", "size_bytes": 1_200_000},
    ).json()
    assert doc["kind"] == "document"
    assert doc["meta"] == "Filed just now · 1.2 MB"

    huge = client.post(
        f"{API}/domains/taxes/documents",
        json={"principal": "mom", "filename": "scan.tiff", "size_bytes": 30_000_000},
    )
    assert huge.status_code == 409


def test_a_rule_can_be_edited_and_deleted_to_the_trash(client: TestClient) -> None:
    """Spec 7.2, Personal: view, edit or delete a routing or category rule."""
    edited = client.put(f"{API}/rules/RU-2", json={"when": 'Payee is "BART"', "then": "Transport"})
    assert edited.json()["source"] == "Edited by you · just now"

    trashed = client.delete(f"{API}/rules/RU-2").json()
    assert trashed["kind"] == "rule"
    rules = client.get(f"{API}/personal").json()["rules"]
    assert "RU-2" not in [r["id"] for r in rules]


def test_the_checklist_ticks_and_unticks(client: TestClient) -> None:
    """Spec 7.2, Personal: work through the onboarding checklist."""
    assert client.put(f"{API}/checklist/CK-2", json={"done": True}).json()["done"] is True
    assert client.put(f"{API}/checklist/CK-2", json={"done": False}).json()["done"] is False


def test_every_finance_figure_adds_up_from_its_source_rows(client: TestClient) -> None:
    """Spec 7.2, Finance: every figure links to its source rows."""
    page = client.get(f"{API}/finance/owner").json()
    figures = [(line["id"], line["spent"]) for line in page["budget"]]
    figures += [(m["id"], m["money_in"] - m["money_out"]) for m in page["cash_flow"]]

    for figure_id, value in figures:
        sources = client.get(f"{API}/finance/owner/sources/{figure_id}").json()
        assert sources["total"] == value, figure_id
    worth = client.get(f"{API}/finance/owner/sources/net-worth").json()
    assert page["net_worth"]["value"] == f"${worth['total']:,}"


def test_fixing_a_category_moves_the_money_and_adds_a_rule(client: TestClient) -> None:
    """Spec 7.2, Finance; 20.12: a category fix becomes a rule."""
    groceries = client.get(f"{API}/finance/owner/sources/budget-groceries").json()
    amazon = next(r for r in groceries["rows"] if r["text"] == "Amazon")

    fixed = client.post(
        f"{API}/finance/owner/transactions/{amazon['id']}/category", json={"category": "Household"}
    ).json()

    budget = {b["name"]: b["spent"] for b in client.get(f"{API}/finance/owner").json()["budget"]}
    assert budget["Groceries"] == groceries["total"] - amazon["amount"]
    assert budget["Household"] == amazon["amount"]
    rules = client.get(f"{API}/personal").json()["rules"]
    assert fixed["rule"]["id"] in [r["id"] for r in rules]
    again = client.post(
        f"{API}/finance/owner/transactions/{amazon['id']}/category", json={"category": "Household"}
    )
    assert again.status_code == 409


def test_an_overdue_statement_is_uploaded_in_place(client: TestClient) -> None:
    """Spec 7.16, rule 4: the overdue import has its upload button on Finance itself."""
    wrong = client.post(
        f"{API}/finance/owner/imports/IM-card/upload",
        json={"filename": "statement.pdf", "size_bytes": 2000},
    )
    assert wrong.status_code == 409

    done = client.post(
        f"{API}/finance/owner/imports/IM-card/upload",
        json={"filename": "card-oct.qfx", "size_bytes": 2000},
    ).json()
    assert done["status"]["label"] == "Current"


def test_a_found_account_is_mapped_to_a_principal(client: TestClient) -> None:
    """Spec 7.2, Finance; 20.4: map a new account; the mapping is recorded as a rule."""
    item = client.post(f"{API}/finance/accounts/UA-2/map", json={"principal": "dad"}).json()

    dad = client.get(f"{API}/finance/dad").json()
    assert item["id"] in [i["id"] for i in dad["imports"]]
    assert "UA-2" not in [a["id"] for a in dad["unmapped"]]
    again = client.post(f"{API}/finance/accounts/UA-2/map", json={"principal": "mom"})
    assert again.status_code == 404


def test_a_monthly_close_request_becomes_a_work_item(client: TestClient) -> None:
    """Spec 7.2, Finance: request an import check or monthly close."""
    made = client.post(f"{API}/finance/mom/requests", json={"kind": "monthly_close"}).json()

    items = client.get(f"{API}/work").json()["items"]
    assert any(i["id"] == made["work_item_id"] for i in items)


def test_a_secret_needs_a_passkey_and_never_comes_back(client: TestClient) -> None:
    """Spec 24.5: secrets go only into Brain's secret form; 7.16, rule 3: it loosens."""
    path = f"{API}/setup/OI-13/secrets/assistant-token"
    token = "MTA5-secret-token-value"

    assert client.post(path, json={"value": token}).status_code == 403
    short = client.post(path, json={"value": "abc"}, headers={"X-Step-Up": step_up(client)})
    assert short.status_code == 409
    saved = client.post(path, json={"value": token}, headers={"X-Step-Up": step_up(client)})

    assert token not in saved.text
    assert saved.json()["secrets"][0]["saved"] is True
    client.post(
        f"{API}/setup/OI-13/secrets/ops-token",
        json={"value": token},
        headers={"X-Step-Up": step_up(client)},
    )
    step = next(s for s in client.get(f"{API}/setup").json() if s["id"] == "OI-13")
    assert step["state"] == "done"
    assert token not in str(step)


def test_the_profile_interview_runs_inside_its_step(client: TestClient) -> None:
    """Spec 24.5: the profile interview is an Atlas conversation inside the step card."""
    path = f"{API}/setup/OI-18/interview"
    assert client.post(f"{path}/confirm").status_code == 409
    for answer in ("7 and 10", "Ask me", "Both", "Never pay"):
        step = client.post(f"{path}/answer", json={"text": answer}).json()

    assert step["interview"]["facts"][0] == "Your day: 7 and 10"
    done = client.post(f"{path}/confirm").json()
    assert done["state"] == "done"
    fresh = client.post(f"{path}/restart").json()
    assert fresh["state"] == "ready"
    assert fresh["interview"]["asked"] == 0
