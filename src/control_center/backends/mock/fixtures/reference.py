"""Documentation groups, the search index and Wayfinder's answers for the mock engine."""

from control_center.contract.common import Row, RowGroup, StatusLabel
from control_center.contract.today import SearchResult, SearchSection


def doc_groups() -> list[RowGroup]:
    """Documentation by area with review state."""
    approved = StatusLabel(status="healthy", label="Approved")
    review = StatusLabel(status="attention", label="In review")
    return [
        RowGroup(
            name="The platform",
            rows=[
                Row(
                    id="infra",
                    title="INFRASTRUCTURE.md",
                    meta="Checks, recovery, remote login · reviewed Oct 26",
                    status=approved,
                ),
                Row(
                    id="run-0004",
                    title="Runbook: drive not mounted",
                    meta="RUN-0004 · last tested Oct 4",
                    status=approved,
                ),
                Row(
                    id="adr-0007",
                    title="ADR-0007 Use MLX for local inference",
                    meta="Oct 24",
                    status=StatusLabel(status="healthy", label="Accepted"),
                ),
            ],
        ),
        RowGroup(
            name="Lease Reminders",
            rows=[
                Row(
                    id="prd-0003",
                    title="PRD: Lease Reminders",
                    meta="PRD-0003 · v1.2",
                    status=approved,
                ),
                Row(
                    id="des-0009",
                    title="Design: reminder scheduling",
                    meta="DES-0009 · conformance record attached",
                    status=approved,
                ),
                Row(
                    id="rel-12",
                    title="Release packet 1.2",
                    meta="Waiting on your G7 approval",
                    href="/approvals",
                    status=review,
                ),
            ],
        ),
        RowGroup(
            name="Needs attention",
            rows=[
                Row(
                    id="rs-readme",
                    title="Receipt Scanner README",
                    meta="Drift found by Saturday audit",
                    status=StatusLabel(status="problem", label="Stale"),
                ),
                Row(
                    id="run-restore",
                    title="Runbook: restore a record",
                    meta="Review due Nov 2",
                    status=review,
                ),
            ],
        ),
    ]


def search_index() -> list[SearchSection]:
    """Everything search can find in the mock, by section."""

    def hit(hit_id: str, title: str, meta: str, href: str) -> SearchResult:
        return SearchResult(id=hit_id, title=title, meta=meta, href=href)

    return [
        SearchSection(
            name="Cases",
            results=[
                hit("CS-0176", "Medicare plan review", "Health · Dad · due Dec 7", "/personal"),
                hit("EV-1", "Call with the property insurer", "Rental · today 09:30", "/personal"),
                hit("CS-0187", "Unit B lease renewal", "Rental · due Nov 30", "/personal"),
                hit(
                    "CS-0201", "Car registration renewal", "Home and auto · due today", "/personal"
                ),
            ],
        ),
        SearchSection(
            name="Documents",
            results=[
                hit(
                    "DOC-1",
                    "Home insurance policy 2026",
                    "Household · PDF · renews Dec 14",
                    "/docs",
                ),
                hit("DOC-2", "Landlord policy declarations", "Rental · restricted", "/docs"),
            ],
        ),
        SearchSection(
            name="Contacts",
            results=[
                hit("C-05", "Insurer member services", "Health · Dad · known", "/contacts"),
                hit("C-01", "Dr. Patel's office", "Health · allowlisted", "/contacts"),
            ],
        ),
        SearchSection(
            name="Employees",
            results=[
                hit(
                    "PO-9",
                    "Keystone, Property Manager",
                    "Prepared the insurer call notes",
                    "/directory",
                ),
                hit("PO-10", "Pulse, Health and Benefits", "Medicare plan review", "/directory"),
            ],
        ),
        SearchSection(
            name="Audit events",
            results=[
                hit("AU-1", "mail.draft by Pulse", "Oct 25 19:02 · masked", "/security"),
            ],
        ),
    ]


WAYFINDER_ANSWERS = {
    "insur": (
        "Your home policy renews Dec 14. Dad's Medicare plan review is a case due Dec 7. "
        "The insurer call is today at 09:30."
    ),
}
"""Canned Wayfinder answers, keyed by a word the query must contain. The real Wayfinder answers
from the local index (spec 14.8); the mock only shows where its answer appears."""
