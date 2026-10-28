"""Shared vocabulary: status, departments, employee states and data classes."""

from typing import Literal

from pydantic import Field

from control_center.contract.base import ContractModel

Status = Literal["healthy", "in_progress", "attention", "problem", "neutral"]
"""The five status levels. The front end always renders one as color, shape and a word (spec 7.12):
healthy ●, in progress ◐, needs attention ▲, problem ■; neutral is plain muted text."""

Department = Literal["personal", "engineering", "quality", "ideation", "governance"]
"""Departments decide an avatar's antenna and fill color (spec 7.12, "Avatars")."""

EmployeeState = Literal["idle", "thinking", "generating", "tool", "waiting", "blocked"]
"""The six avatar states of spec 7.13 ("What alive looks like")."""

DataClass = Literal["public", "internal", "restricted"]
"""Workspace data classes (spec 9.1). Restricted data never leaves the Mac."""

Trust = Literal["allowlisted", "known", "unknown", "blocked"]
"""Contact trust levels, with the same meaning everywhere (spec 7.16, rule 10)."""

Principal = Literal["owner", "mom", "dad"]
"""Household principals. The real list is configured in Setup; these are the mockup's three."""


class StatusLabel(ContractModel):
    """A status and the short, kind words beside it, such as "All clear" (spec 7.12)."""

    status: Status
    label: str


class Metric(ContractModel):
    """A named figure with an optional sparkline, as on stat tiles and metric rows.

    `spark` holds the recent values oldest first; the front end scales them, so units do not matter.
    """

    name: str
    value: str
    status: StatusLabel | None = None
    spark: list[float] = Field(default_factory=list)


class Row(ContractModel):
    """A generic list row: a title, a muted line under it, and a status on the right."""

    id: str
    title: str
    meta: str = ""
    status: StatusLabel | None = None
    href: str | None = None


class RowGroup(ContractModel):
    """A titled group of rows, such as "Core, before login" on the Services page."""

    name: str
    note: str = ""
    rows: list[Row]
