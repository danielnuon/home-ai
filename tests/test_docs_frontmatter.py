"""Engineering documents start with the frontmatter in spec 22.9 (19.5)."""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DOCUMENTS = [ROOT / "ARCHITECTURE.md", *sorted((ROOT / "docs").rglob("*.md"))]
REQUIRED = {
    "id",
    "title",
    "type",
    "status",
    "owner_role",
    "approver",
    "created",
    "last_reviewed",
    "review_cadence_days",
    "risk_class",
    "work_item",
    "supersedes",
    "covers",
    "data_class",
}
TYPES = {
    "adr",
    "prd",
    "design",
    "runbook",
    "test-plan",
    "report",
    "policy",
    "postmortem",
    "release-packet",
}
STATUSES = {"draft", "in-review", "approved", "accepted", "superseded", "deprecated"}


def frontmatter(path: Path) -> dict[str, str]:
    """Read the `key: value` lines between the opening and closing `---`, comments removed."""
    lines = path.read_text().splitlines()
    assert lines[0] == "---", f"{path.name} does not start with frontmatter"
    end = lines.index("---", 1)
    fields = (line.split("#", 1)[0].partition(":") for line in lines[1:end])
    return {key.strip(): value.strip() for key, _, value in fields if key.strip()}


@pytest.mark.parametrize("path", DOCUMENTS, ids=lambda path: path.name)
def test_every_engineering_document_has_the_frontmatter(path: Path) -> None:
    """Spec 19.5: every engineering document starts with the 22.9 fields, using its vocabularies."""
    fields = frontmatter(path)

    assert fields.keys() >= REQUIRED, f"missing {sorted(REQUIRED - fields.keys())}"
    assert fields["type"] in TYPES
    assert fields["status"] in STATUSES
