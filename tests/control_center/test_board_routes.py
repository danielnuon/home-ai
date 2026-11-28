"""The Work boards and the Directory: ideas, work items, products, moves and suggested roles."""

from typing import Any

from fastapi.testclient import TestClient

API = "/api/v1"


def thread(client: TestClient, thread_id: str) -> dict[str, Any]:
    """One thread as the Threads view shows it, from any of its lists."""
    threads = client.get(f"{API}/work").json()["threads"]
    every = [*threads["open"], *threads["recently_resolved"], *threads["archived"]]
    return next(found for found in every if found["id"] == thread_id)


def test_a_submitted_idea_opens_a_thread_with_the_ideation_lead(client: TestClient) -> None:
    """Spec 16.1: the Owner submits an idea; Spark takes it in its own thread."""
    idea = client.post(f"{API}/ideas", json={"title": " Pantry tracker ", "summary": "x"}).json()

    assert idea["title"] == "Pantry tracker"
    assert idea["state"] == "Captured"
    assert thread(client, idea["thread_id"])["lead_name"] == "Spark"
    assert client.get(f"{API}/work").json()["ideas"][0]["id"] == idea["id"]


def test_an_idea_needs_a_title(client: TestClient) -> None:
    """Spec 7.16, rule 9: the refusal says what to do next."""
    answer = client.post(f"{API}/ideas", json={"title": "  "})

    assert answer.status_code == 409
    assert answer.json()["reason"] == "Give the idea a title first."


def test_withdrawing_an_idea_resolves_its_thread_and_reopening_undoes_it(
    client: TestClient,
) -> None:
    """Spec 15.8.3: a withdrawn idea's thread is resolved; reopening is its Undo."""
    withdrawn = client.post(f"{API}/ideas/ID-0013/withdraw").json()

    assert withdrawn["withdrawn"] is True
    assert thread(client, "TH-0120")["state"] == "resolved"
    assert client.put(f"{API}/ideas/ID-0013", json={"title": "x"}).status_code == 409

    client.post(f"{API}/ideas/ID-0013/reopen")
    assert thread(client, "TH-0120")["state"] != "resolved"


def test_pausing_a_work_item_pauses_its_thread_and_says_so(client: TestClient) -> None:
    """Spec 7.10: an Owner pause holds the item's sessions, and its status reads Paused."""
    item = client.put(f"{API}/work-items/WI-0031/paused", json={"paused": True}).json()

    assert item["status"]["label"] == "Build · Paused"
    assert thread(client, "TH-0131")["state"] == "paused"

    client.put(f"{API}/work-items/WI-0031/paused", json={"paused": False})
    assert thread(client, "TH-0131")["state"] == "working"


def test_priority_orders_the_board(client: TestClient) -> None:
    """The highest priority comes first on the boards."""
    client.put(f"{API}/work-items/WI-0031/priority", json={"priority": "high"})
    client.put(f"{API}/work-items/WI-0029/priority", json={"priority": "low"})

    items = client.get(f"{API}/work").json()["items"]
    assert [item["id"] for item in items][:2] == ["WI-0031", "WI-0029"]


def test_the_item_page_has_history_gates_diff_and_transcripts(client: TestClient) -> None:
    """Spec 7.2, Work: an item's detail page with stage history, gates, diffs and transcripts."""
    detail = client.get(f"{API}/work-items/WI-0031").json()

    assert detail["history"][0]["code"] == "D0"
    assert [g["state"] for g in detail["gates"]][:5] == ["passed"] * 4 + ["todo"]
    assert detail["diff"][0]["path"] == "src/reminders/schedule.py"
    assert detail["transcripts"][0]["task_id"] == "T-5521"
    assert detail["product"]["pull_requests"][0]["number"] == 12


def test_work_in_progress_counts_items_in_build_and_test(client: TestClient) -> None:
    """Spec 17.10: at most 2 items per product and 3 overall in D4 to D7."""
    board = client.get(f"{API}/work").json()

    assert board["wip"] == {"in_progress": 1, "limit": 3}
    lease = next(p for p in board["products"] if p["id"] == "PR-lease")
    assert (lease["wip"], lease["wip_limit"]) == (1, 2)


def test_retiring_a_product_opens_its_work_item_and_approval(client: TestClient) -> None:
    """Spec 17.21: asking opens the retirement work item and its class P approval card."""
    item = client.post(f"{API}/products/PR-ledger/retire").json()

    assert item["kind"] == "retirement"
    approval_ids = [a["id"] for a in client.get(f"{API}/approvals").json()]
    assert f"AP-{item['id'].removeprefix('WI-')}" in approval_ids
    assert thread(client, item["thread_id"])["state"] == "needs_owner"
    again = client.post(f"{API}/products/PR-ledger/retire")
    assert again.status_code == 409


def test_moving_a_thread_changes_its_lead_and_moving_back_undoes_it(client: TestClient) -> None:
    """Spec 15.8.5: Move is an Owner command, one tap, undone by moving it back."""
    moved = client.post(f"{API}/threads/TH-0207/move", json={"lead_id": "foreman"}).json()

    assert (moved["lead_name"], moved["pipeline"]) == ("Foreman", "Development")
    same = client.post(f"{API}/threads/TH-0207/move", json={"lead_id": "foreman"})
    assert same.status_code == 409
    assert client.post(f"{API}/threads/TH-0207/move", json={"lead_id": "atlas"}).status_code == 200
    resolved = client.post(f"{API}/threads/TH-0201/move", json={"lead_id": "spark"})
    assert resolved.json()["reason"] == "This thread is resolved. Reopen it first."


def test_archived_threads_are_listed_apart(client: TestClient) -> None:
    """Spec 15.8.9: archived threads appear only under the Archived filter."""
    threads = client.get(f"{API}/work").json()["threads"]

    archived = {t["id"] for t in threads["archived"]}
    assert archived == {"TH-0096", "TH-0088"}
    assert not archived & {t["id"] for t in threads["recently_resolved"]}


def test_a_suggested_role_becomes_a_proposal(client: TestClient) -> None:
    """Spec 7.2, Directory: suggest a new role; it becomes a proposal."""
    proposal = client.post(
        f"{API}/directory/role-suggestions", json={"title": "Gardener", "reason": "Yard."}
    ).json()

    assert proposal["text"] == "New role: Gardener. Yard."
    ids = [p["id"] for p in client.get(f"{API}/directory").json()["proposals"]]
    assert proposal["id"] in ids


def test_every_employee_has_a_pipeline_and_a_lead(client: TestClient) -> None:
    """Spec 7.11: the team view needs each pipeline, and the org view each lead."""
    employees = client.get(f"{API}/directory").json()["employees"]
    leads = {e["id"] for e in employees if e["reports_to"] is None}

    assert leads == {"PO-1", "GOV-1", "IDEA-1", "MNT-1"}
    assert all(e["pipeline"] for e in employees)
    assert all(e["reports_to"] in leads for e in employees if e["reports_to"])
