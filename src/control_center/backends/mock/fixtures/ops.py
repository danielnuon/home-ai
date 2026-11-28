"""Schedule, Security, Backups and Maintenance fixtures."""

import re

from control_center.contract.common import Metric, Row, StatusLabel
from control_center.contract.status import Finding, Job, MaintenanceFix


def _ok(label: str) -> StatusLabel:
    return StatusLabel(status="healthy", label=label)


def _attention(label: str) -> StatusLabel:
    return StatusLabel(status="attention", label=label)


def _neutral(label: str) -> StatusLabel:
    return StatusLabel(status="neutral", label=label)


def jobs() -> list[Job]:
    """Heavy and light jobs from spec 12.5, with the outcomes in the design."""

    def job(
        job_id: str, name: str, when: tuple[str, str], last: StatusLabel, *, heavy: bool
    ) -> Job:
        """`when` is the schedule and the next run, as the Schedule page shows them."""
        schedule, next_run = when
        found = re.search(r"\b\d{2}:\d{2}\b", schedule)
        return Job(
            id=job_id,
            name=name,
            when=schedule,
            next_run=next_run,
            last_run=last,
            heavy=heavy,
            paused=False,
            time=None if schedule.startswith("Every") or found is None else found.group(),
        )

    return [
        job("snapshots", "Snapshots", ("Daily 23:30", "23:30"), _ok("ok · 2 min"), heavy=True),
        job(
            "backup-check",
            "Backup and audit check",
            ("Daily 00:00", "00:00"),
            _ok("ok · 14 min"),
            heavy=True,
        ),
        job(
            "maintenance-scan",
            "Maintenance scan",
            ("Mon–Fri 01:00, 60 min", "01:00"),
            _attention("skipped: away mode"),
            heavy=True,
        ),
        job(
            "model-selector",
            "Model selector",
            ("Mon–Fri 02:15–05:30", "02:15"),
            _ok("ok · 2 pairs"),
            heavy=True,
        ),
        job(
            "full-maintenance",
            "Full maintenance",
            ("Sat 01:00–05:00", "Sat"),
            _ok("ok · 3 fixes"),
            heavy=True,
        ),
        job("pruning", "Pruning", ("Sun 04:00", "Sun"), _ok("ok"), heavy=True),
        job(
            "restore-drill",
            "Restore drill",
            ("First Sun 06:30", "Nov 1"),
            _ok("passed Oct 4"),
            heavy=True,
        ),
        job("account-sync", "Account sync", ("Every 5 min", "22:50"), _ok("ok"), heavy=False),
        job("daily-brief", "Daily brief", ("Daily 06:15", "06:15"), _ok("sent"), heavy=False),
        job("weekly-review", "Weekly review", ("Sun 18:00", "Sun"), _ok("sent"), heavy=False),
        job("monthly-close", "Monthly close", ("1st 08:00", "Nov 1"), _ok("ok"), heavy=False),
    ]


def security_tiles(allowlisted: int = 3) -> list[Metric]:
    """Counters on the Security page; the allowlist count follows Contacts."""
    return [
        Metric(name="Denied tool calls, 7 d", value="4", status=_neutral("All by policy")),
        Metric(name="Flagged requests, 7 d", value="1", status=_attention("Review")),
        Metric(name="Data to cloud", value="0 B", status=_ok("All local")),
        Metric(name="Allowlist", value=str(allowlisted), status=_neutral("Contacts")),
    ]


def security_flags() -> list[Row]:
    """Untrusted requests flagged by reader contexts. Never the raw text (spec 7.1, 9.4)."""
    return [
        Row(
            id="FL-0019",
            title="An invoice email asked to update the bank details on file",
            meta="From an email · Sieve's reader · no agent acted on it",
            status=_attention("Flagged"),
        )
    ]


AUDIT_LINES = [
    "07:42:10 approve  T2 mail.draft  Owner (button)",
    "07:40:55 deny     fs.write ../policy  Bolt",
    "07:31:02 setting  discord.detail.rental → summary",
]
"""Masked audit lines as the audit logger's query socket returns them."""


def backup_targets() -> list[Row]:
    """Where the data is, in starter mode (spec 13.1)."""
    return [
        Row(
            id="drive-to-ssd",
            title="Working drive → internal SSD",
            meta="restic · every 4 h · databases, documents, inbox, config",
            status=_ok("20:00 today"),
        ),
        Row(
            id="ssd-to-drive",
            title="Internal SSD → working drive",
            meta="restic · nightly · platform state",
            status=_ok("00:00"),
        ),
        Row(
            id="time-machine",
            title="Time Machine",
            meta="Turns on when a backup drive is connected",
            status=_neutral("No drive"),
        ),
        Row(
            id="rotation",
            title="Rotation drives (offsite)",
            meta="Free · swap monthly",
            status=_neutral("No drives"),
        ),
        Row(
            id="paid-offsite",
            title="Paid offsite storage",
            meta="Optional",
            href="/spend",
            status=_neutral("Off"),
        ),
    ]


def retention() -> list[Row]:
    """How long things are kept (spec 13.7)."""
    return [
        Row(id="snapshots", title="Starter snapshots", meta="7 days + 30 daily"),
        Row(id="audit", title="Audit log", meta="2 years here"),
        Row(id="transcripts", title="Transcripts and sessions", meta="1 year"),
        Row(id="logs", title="Service logs", meta="30 days"),
        Row(id="tax", title="Tax documents", meta="7 years minimum"),
        Row(id="ledger", title="Approvals and ledger", meta="7 years"),
    ]


def maintenance_stats() -> list[Metric]:
    """Pipeline C figures."""
    return [
        Metric(name="Fixes merged, 30 d", value="11", status=_ok("0 regressions")),
        Metric(name="Mutation score", value="0.66", status=_ok("Up from 0.63")),
        Metric(name="Flaky tests", value="2", status=_neutral("None quarantined")),
    ]


def maintenance_batch() -> list[MaintenanceFix]:
    """Last Saturday's batch."""
    return [
        MaintenanceFix(
            id="F-031",
            title="Off-by-one in lease end reminder",
            meta="lease-reminders · +18 −3 · regression test added",
            reverted=False,
            diff=[
                "--- a/lease_reminders/dates.py",
                "+++ b/lease_reminders/dates.py",
                "@@ -14,7 +14,7 @@ def reminder_dates(lease_end: date) -> list[date]:",
                "-    return [lease_end - timedelta(days=d - 1) for d in OFFSETS]",
                "+    return [lease_end - timedelta(days=d) for d in OFFSETS]",
                "--- a/tests/test_dates.py",
                "+++ b/tests/test_dates.py",
                "+def test_reminder_lands_on_the_offset_day() -> None:",
                "+    assert reminder_dates(date(2026, 12, 31))[0] == date(2026, 12, 1)",
            ],
        ),
        MaintenanceFix(
            id="F-034",
            title="Patch update: httpx 0.28.1",
            meta="lease-reminders · lockfile only · advisories none",
            reverted=False,
            diff=[
                "--- a/uv.lock",
                "+++ b/uv.lock",
                '-version = "0.28.0"',
                '+version = "0.28.1"',
            ],
        ),
        MaintenanceFix(
            id="F-029",
            title="Remove unused CSV exporter",
            meta="receipt-scanner · −142 · provably unreferenced",
            reverted=False,
            diff=[
                "--- a/receipt_scanner/export_csv.py",
                "+++ /dev/null",
                "@@ -1,142 +0,0 @@",
                '-"""Write receipts as CSV. Unused since the ledger export (F-012)."""',
                "-…139 more removed lines",
            ],
        ),
    ]


def findings() -> list[Finding]:
    """Open findings in the register."""
    return [
        Finding(
            id="F-040",
            severity="high",
            title="Token compared with == in webhook check",
            meta="receipt-scanner · security · fix branch tonight",
            product="receipt-scanner",
            detail=(
                "The webhook handler compares the shared token with ==, which leaks timing. "
                "Custodian proposes hmac.compare_digest and a test that the check rejects a wrong "
                "token."
            ),
            evidence=[
                "semgrep: python.lang.security.audit.timing-attack",
                "receipt_scanner/webhooks.py:41",
            ],
        ),
        Finding(
            id="F-041",
            severity="medium",
            title="N+1 query on the tenants list",
            meta="lease-reminders · performance · benchmark first",
            product="lease-reminders",
            detail=(
                "Listing tenants runs one query per lease. The benchmark against the release "
                "baseline shows 38 ms at 20 tenants; it grows with every tenant."
            ),
            evidence=[
                "benchmark: tenants_list p95 38 ms (baseline 12 ms)",
                "lease_reminders/tenants.py:77",
            ],
        ),
        Finding(
            id="F-042",
            severity="medium",
            title="README setup steps out of date",
            meta="receipt-scanner · docs drift",
            product="receipt-scanner",
            detail=(
                "The README still says to run make setup, which was renamed make install in 0.4."
            ),
            evidence=["docs check: README.md:18 names a target that no longer exists"],
        ),
        Finding(
            id="F-043",
            severity="low",
            title="Duplicated date parsing in 3 files",
            meta="lease-reminders · refactor · proposal",
            product="lease-reminders",
            detail=(
                "Three modules parse dates the same way. A shared helper would remove 31 lines; "
                "behaviour stays the same."
            ),
            evidence=["jscpd: 3 clones, 31 lines", "lease_reminders/{dates,import_csv,notices}.py"],
        ),
    ]
