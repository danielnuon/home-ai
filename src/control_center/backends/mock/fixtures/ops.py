"""Schedule, Security, Backups, Maintenance, Connections and Voice fixtures."""

from control_center.contract.common import Metric, Row, RowGroup, StatusLabel
from control_center.contract.status import Finding, Job, MaintenanceFix, VoiceProfile


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
        return Job(
            id=job_id,
            name=name,
            when=schedule,
            next_run=next_run,
            last_run=last,
            heavy=heavy,
            paused=False,
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


def security_tiles() -> list[Metric]:
    """Counters on the Security page."""
    return [
        Metric(name="Denied tool calls, 7 d", value="4", status=_neutral("All by policy")),
        Metric(name="Flagged requests, 7 d", value="1", status=_attention("Review")),
        Metric(name="Data to cloud", value="0 B", status=_ok("All local")),
        Metric(name="Allowlist", value="3", status=_neutral("Contacts")),
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


def sign_in_rows() -> list[Row]:
    """Step-up methods and sessions."""
    return [
        Row(id="passkeys", title="Passkeys", meta="iPhone · security key"),
        Row(id="totp", title="Discord authenticator", meta="Enrolled · last used today"),
        Row(id="sessions", title="Active sessions", meta="iPhone, iPad, Mac"),
        Row(id="recovery", title="Recovery codes", meta="Printed Oct 24"),
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
        ),
        MaintenanceFix(
            id="F-034",
            title="Patch update: httpx 0.28.1",
            meta="lease-reminders · lockfile only · advisories none",
            reverted=False,
        ),
        MaintenanceFix(
            id="F-029",
            title="Remove unused CSV exporter",
            meta="receipt-scanner · −142 · provably unreferenced",
            reverted=False,
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
        ),
        Finding(
            id="F-041",
            severity="medium",
            title="N+1 query on the tenants list",
            meta="lease-reminders · performance · benchmark first",
        ),
        Finding(
            id="F-042",
            severity="medium",
            title="README setup steps out of date",
            meta="receipt-scanner · docs drift",
        ),
        Finding(
            id="F-043",
            severity="low",
            title="Duplicated date parsing in 3 files",
            meta="lease-reminders · refactor · proposal",
        ),
    ]


def connection_groups() -> list[RowGroup]:
    """Connections by kind, from the design."""
    return [
        RowGroup(
            name="This Mac's apps",
            note="Spec 20.16",
            rows=[
                Row(
                    id="calendar",
                    title="Calendar",
                    meta="All calendars · write own events",
                    status=_ok("Allowed"),
                ),
                Row(
                    id="reminders",
                    title="Reminders",
                    meta='Mirror list "Platform"',
                    status=_ok("Allowed"),
                ),
                Row(
                    id="mail",
                    title="Mail",
                    meta="3 accounts · drafts only · send off",
                    status=_ok("Allowed"),
                ),
                Row(id="contacts", title="Contacts", meta="Read", status=_attention("Waiting")),
                Row(
                    id="messages",
                    title="Messages",
                    meta="Send off · read off",
                    status=_neutral("Off"),
                ),
            ],
        ),
        RowGroup(
            name="Accounts by person",
            note="3 principals",
            rows=[
                Row(
                    id="acct-owner",
                    title="You",
                    meta="iCloud mail, Google calendar",
                    status=_ok("2 accounts"),
                ),
                Row(
                    id="acct-mom",
                    title="Mom",
                    meta="IMAP mailbox · app password",
                    status=_ok("1 account"),
                ),
                Row(
                    id="acct-dad",
                    title="Dad",
                    meta='Calendar "Dad" on this Mac',
                    status=_ok("1 mapping"),
                ),
            ],
        ),
        RowGroup(
            name="Platform links",
            note="Free",
            rows=[
                Row(
                    id="tailscale",
                    title="Tailscale",
                    meta="Personal plan · 3 Owner devices",
                    status=_ok("Connected"),
                ),
                Row(
                    id="heartbeat",
                    title="Heartbeat monitor",
                    meta="Healthchecks.io",
                    status=_ok("Reporting"),
                ),
                Row(
                    id="discord",
                    title="Discord bots",
                    meta="Assistant and Gatekeeper",
                    href="/setup",
                    status=_neutral("Deferred"),
                ),
                Row(
                    id="huggingface",
                    title="Hugging Face",
                    meta="Model downloads only",
                    status=_ok("Ready"),
                ),
            ],
        ),
    ]


def voice_profiles(selected: str, celebrity_clones: bool) -> list[VoiceProfile]:
    """Voice profiles (spec 11.5.1). The celebrity profile is locked while its setting is off."""
    rows = [
        (
            "twilio_default",
            "Twilio default",
            "default",
            "Twilio's own voice · used whenever a clip is missing",
        ),
        ("heart", "Heart", "stock", "Kokoro-82M · free · 4 clips"),
        ("michael", "Michael", "stock", "Kokoro-82M · free · 4 clips"),
        ("my_voice", "My voice", "consented_clone", "Chatterbox · your voice · watermarked"),
        ("mom", "Mom", "consented_clone", "Chatterbox · consent recorded Oct 27 · watermarked"),
        (
            "public_figure",
            "[Public figure]",
            "celebrity_clone",
            "Private celebrity clone · calls to you only",
        ),
    ]
    return [
        VoiceProfile.model_validate(
            {
                "id": profile_id,
                "name": name,
                "kind": kind,
                "meta": meta,
                "selected": profile_id == selected,
                "locked": kind == "celebrity_clone" and not celebrity_clones,
            }
        )
        for profile_id, name, kind, meta in rows
    ]
