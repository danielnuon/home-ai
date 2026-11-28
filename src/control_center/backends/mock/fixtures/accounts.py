"""Connections, Voice, Security and Spend fixtures, and the impact rules' data (spec 7.2, 7.18).

`accounts_state` is the mutable part, which the mock gate changes; the rest are read-only views.
`connection_status` is the one rule for what a connection's status says, shared by the fixtures
and the gate so a change always reads the same way.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from control_center.backends.mock.fixtures import platform
from control_center.contract.accounts import (
    Connection,
    ConnectionKind,
    Device,
    OutcomeLine,
    Passkey,
    StockVoice,
    VoiceProfile,
    Workspace,
)
from control_center.contract.common import Row, StatusLabel
from control_center.contract.status import ImpactLine, LedgerEntry

GROUPS: dict[ConnectionKind, tuple[str, str]] = {
    "mac_app": ("This Mac's apps", "macOS permissions · spec 20.16"),
    "account": ("Accounts by person", "3 principals"),
    "platform": ("Platform links", "Free"),
    "provider": ("Optional paid providers", "$0 until on"),
}
"""How Connections groups its rows, in page order: kind → (heading, note)."""

PERMISSION_WORDS = {
    "allowed": ("healthy", "Allowed"),
    "waiting": ("attention", "Waiting"),
    "denied": ("problem", "Denied"),
    "off": ("neutral", "Off"),
}


def connection_status(connection: Connection) -> StatusLabel:
    """What a connection's status says, from its state. An error outranks everything else."""
    if connection.last_error:
        return StatusLabel(status="problem", label="Error")
    if connection.permission is not None:
        status, label = PERMISSION_WORDS[connection.permission]
        return StatusLabel.model_validate({"status": status, "label": label})
    if connection.kind == "provider":
        stored = connection.secret == "stored"
        return StatusLabel(
            status="healthy" if stored else "neutral", label="Key stored" if stored else "No key"
        )
    if not connection.connected:
        return StatusLabel(status="neutral", label="Not connected")
    return StatusLabel(status="healthy", label="Connected")


def _connection(**fields: object) -> Connection:
    """A connection with its status worked out from the rest of its fields."""
    made = Connection.model_validate({"status": {"status": "neutral", "label": ""}, **fields})
    made.status = connection_status(made)
    return made


def _mac_app(app_id: str, title: str, meta: str, permission: str) -> Connection:
    return _connection(
        id=app_id,
        kind="mac_app",
        title=title,
        meta=meta,
        connected=permission == "allowed",
        permission=permission,
    )


def connections() -> list[Connection]:
    """Every connection, in page order (spec 7.2, Connections)."""
    apps = [
        _mac_app("calendar", "Calendar", "All calendars · write own events", "allowed"),
        _mac_app("reminders", "Reminders", 'Mirror list "Platform"', "allowed"),
        _mac_app("mail", "Mail", "3 accounts · drafts only · send off", "allowed"),
        _mac_app("contacts", "Contacts", "Read", "waiting"),
        _mac_app("messages", "Messages", "Send off · read off", "off"),
    ]
    accounts = [
        _connection(
            id="acct-owner",
            kind="account",
            title="You",
            meta="iCloud mail, Google calendar",
            connected=True,
            scopes=["mail: read, draft", "calendar: read, write own events"],
            last_sync="2 min ago",
        ),
        _connection(
            id="acct-mom",
            kind="account",
            title="Mom",
            meta="IMAP mailbox · app password",
            connected=True,
            scopes=["mail: read, draft"],
            last_sync="06:00",
            last_error="The mail server refused the app password at 06:00",
            secret="stored",
            secret_note="Stored Oct 24 · never shown again",
        ),
        _connection(
            id="acct-dad",
            kind="account",
            title="Dad",
            meta='Calendar "Dad" on this Mac',
            connected=True,
            scopes=["calendar: read"],
            last_sync="2 min ago",
        ),
    ]
    links = [
        _connection(
            id="tailscale",
            kind="platform",
            title="Tailscale",
            meta="Personal plan · 3 Owner devices",
            connected=True,
            scopes=["Brain on the tailnet only"],
            expires="Key expiry off for this Mac",
        ),
        _connection(
            id="heartbeat",
            kind="platform",
            title="Heartbeat monitor",
            meta="Healthchecks.io",
            connected=True,
            last_sync="1 min ago",
        ),
        _connection(
            id="github",
            kind="platform",
            title="GitHub",
            meta="Private mirrors · one repository per project",
            connected=True,
            scopes=["contents: write", "pull requests: write", "metadata: read"],
            secret="stored",
            secret_note="Fine-grained token · stored Oct 24",
            expires="Jan 22, 2027 · renew before then",
            last_push="receipt-scanner · Oct 25 15:12",
        ),
        _connection(
            id="discord",
            kind="platform",
            title="Discord bots",
            meta="Assistant and Gatekeeper · set up in Setup",
            connected=False,
            href="/setup",
        ),
        _connection(
            id="huggingface",
            kind="platform",
            title="Hugging Face",
            meta="Model downloads only",
            connected=True,
            scopes=["read"],
        ),
    ]
    providers = [
        _connection(
            id=f"provider-{feature_id}",
            kind="provider",
            title=name,
            meta=f"{kind} · turned on in Spend",
            connected=False,
            secret="none",
            href="/spend",
        )
        for feature_id, name, kind, _, _ in platform.PAID_FEATURES
    ]
    return [*apps, *accounts, *links, *providers]


CALL_LINES = [
    "Approval requested: class C.",
    "Code on your screen.",
    "Enter the code, then press pound.",
    "That code didn't match. Try once more.",
]
"""The four fixed lines every voice renders (spec 11.5, 11.5.1). Nothing else is ever spoken."""

RISK_NOTICE = (
    "A clone of a public figure's voice can break publicity and likeness laws where you live. "
    "It plays only on approval calls to you, stays on the Mac except as protected Twilio clips, "
    "and the legal risk is yours (decision 84)."
)
"""The notice a private celebrity clone needs acknowledged (11.5.1, guardrail 3)."""

STOCK_VOICES = [
    StockVoice(id="heart", name="Heart", note="Warm · American English"),
    StockVoice(id="michael", name="Michael", note="Calm · American English"),
    StockVoice(id="bella", name="Bella", note="Bright · American English"),
    StockVoice(id="emma", name="Emma", note="Clear · British English"),
    StockVoice(id="george", name="George", note="Low · British English"),
]
"""Kokoro-82M's voices that can be added in one tap (11.5.1, "stock")."""

KOKORO = "Kokoro-82M"
CHATTERBOX = "Chatterbox"


def voices(now: datetime) -> list[VoiceProfile]:
    """The profiles from the design. Selection and locks are worked out when the page is read."""

    def profile(  # noqa: PLR0913 -- one keyword per field the page shows
        profile_id: str,
        name: str,
        kind: str,
        *,
        engine: str,
        record: str | None = None,
        sample: str | None = None,
        rendered_days: int | None = None,
    ) -> VoiceProfile:
        rendered = None if rendered_days is None else now - timedelta(days=rendered_days)
        return VoiceProfile.model_validate(
            {
                "id": profile_id,
                "name": name,
                "kind": kind,
                "meta": voice_meta(kind, engine),
                "engine": engine,
                "record": record,
                "sample": sample,
                "clips": 0 if rendered is None else len(CALL_LINES),
                "rendered_at": rendered,
                "selected": False,
                "locked": False,
            }
        )

    return [
        profile("twilio_default", "Twilio default", "default", engine="Twilio <Say>"),
        profile("heart", "Heart", "stock", engine=KOKORO, rendered_days=3),
        profile("michael", "Michael", "stock", engine=KOKORO, rendered_days=5),
        profile(
            "my_voice",
            "My voice",
            "consented_clone",
            engine=CHATTERBOX,
            record="Your own voice · recorded in Brain Oct 24",
            sample="Recorded in Brain · 20 s",
            rendered_days=1,
        ),
        profile(
            "mom",
            "Mom",
            "consented_clone",
            engine=CHATTERBOX,
            record="Consent recorded Oct 24 · she agreed on a call",
            sample="Uploaded voice memo · 32 s",
            rendered_days=1,
        ),
        profile(
            "public_figure",
            "[Public figure]",
            "celebrity_clone",
            engine=CHATTERBOX,
            record="Risk notice acknowledged Oct 24",
            sample="Public interview recording · 45 s",
            rendered_days=1,
        ),
    ]


def voice_meta(kind: str, engine: str) -> str:
    """The line under a profile's name: what reads it and what it costs."""
    return {
        "default": "Twilio's own voice · used whenever a clip is missing",
        "stock": f"{engine} · free · runs on the Mac",
        "consented_clone": f"{engine} · consent recorded · watermarked",
        "celebrity_clone": f"{engine} · private · calls to you only · watermarked",
    }[kind]


def workspaces() -> list[Workspace]:
    """Workspaces the kill switch can stop one at a time (spec 7.4, 11.10)."""
    return [
        Workspace(id="ws-brain", name="Brain", meta="Development · 2 sessions", stopped=False),
        Workspace(
            id="ws-receipt-scanner",
            name="receipt-scanner",
            meta="Idea in build · 1 session",
            stopped=False,
        ),
        Workspace(
            id="ws-rental", name="Rental property", meta="Restricted · 1 session", stopped=False
        ),
        Workspace(
            id="ws-parents", name="Parents' affairs", meta="Restricted · idle", stopped=False
        ),
        Workspace(id="ws-finance", name="Finances", meta="Restricted · idle", stopped=False),
    ]


def devices() -> list[Device]:
    """Signed-in Brain sessions on the Owner's tailnet devices."""
    return [
        Device(id="dev-mac", name="Mac", meta="Safari · this device", current=True),
        Device(id="dev-iphone", name="iPhone", meta="Brain app · active 2 min ago", current=False),
        Device(id="dev-ipad", name="iPad", meta="Safari · active yesterday", current=False),
    ]


def passkeys() -> list[Passkey]:
    """Registered passkeys."""
    return [
        Passkey(id="pk-iphone", name="iPhone", meta="Added Oct 24 · last used today"),
        Passkey(id="pk-key", name="Security key", meta="Added Oct 24 · kept at the desk"),
    ]


TOTP_NOTE = "Enrolled Oct 24 · last used today"
RECOVERY_NOTE = "8 codes printed Oct 24 · 8 unused"


@dataclass
class AccountsState:
    """What the Owner changes on Connections, Voice and Security."""

    connections: dict[str, Connection]
    voices: dict[str, VoiceProfile]
    workspaces: dict[str, Workspace]
    devices: dict[str, Device]
    passkeys: dict[str, Passkey]
    totp: str
    recovery: str


def accounts_state(now: datetime) -> AccountsState:
    """A fresh copy of the mutable accounts state."""
    return AccountsState(
        connections={c.id: c for c in connections()},
        voices={v.id: v for v in voices(now)},
        workspaces={w.id: w for w in workspaces()},
        devices={d.id: d for d in devices()},
        passkeys={p.id: p for p in passkeys()},
        totp=TOTP_NOTE,
        recovery=RECOVERY_NOTE,
    )


def denied_calls() -> list[Row]:
    """Tool calls the tool server denied this week (spec 7.2, Security). Masked, never content."""
    denied = StatusLabel(status="neutral", label="Denied")
    return [
        Row(
            id="DN-0031",
            title="fs.write ../policy by Bolt",
            meta="Outside its workspace · today 07:40",
            status=denied,
        ),
        Row(
            id="DN-0030",
            title="web.research by Scout",
            meta="A URL the agent composed itself · yesterday",
            status=denied,
        ),
        Row(
            id="DN-0029",
            title="mail.send by Pulse",
            meta="Sending is off · Oct 23",
            status=denied,
        ),
        Row(
            id="DN-0028",
            title="git.push by Forge",
            meta="Not the registered mirror · Oct 22",
            status=denied,
        ),
    ]


def ledger() -> list[LedgerEntry]:
    """The spend ledger: local work at $0 with its quantity, so the free work is visible too."""

    def entry(  # noqa: PLR0913 -- one keyword per field the page groups by
        entry_id: str,
        *,
        month: str,
        day: str,
        service: str,
        pipeline: str,
        what: str,
        quantity: str,
        idea: str | None = None,
        work_item: str | None = None,
    ) -> LedgerEntry:
        return LedgerEntry(
            id=entry_id,
            month=month,
            day=day,
            service=service,
            pipeline=pipeline,
            idea=idea,
            work_item=work_item,
            what=what,
            quantity=quantity,
            amount_usd=0.0,
        )

    local = "Local models"
    return [
        entry(
            "LG-0009",
            month="October",
            day="Oct 25",
            service=local,
            pipeline="B · Development",
            what="Build and review",
            quantity="1.4 M tokens",
            idea="receipt-scanner",
            work_item="WI-0412",
        ),
        entry(
            "LG-0008",
            month="October",
            day="Oct 25",
            service=local,
            pipeline="E · Personal",
            what="Chief of Staff and personal leads",
            quantity="0.6 M tokens",
        ),
        entry(
            "LG-0007",
            month="October",
            day="Oct 24",
            service=local,
            pipeline="A · Ideation",
            what="Idea research",
            quantity="0.3 M tokens",
            idea="receipt-scanner",
        ),
        entry(
            "LG-0006",
            month="October",
            day="Oct 24",
            service="Healthchecks.io",
            pipeline="Platform",
            what="Heartbeat",
            quantity="1,440 pings",
        ),
        entry(
            "LG-0005",
            month="October",
            day="Oct 24",
            service="Tailscale",
            pipeline="Platform",
            what="Remote access",
            quantity="3 devices",
        ),
        entry(
            "LG-0004",
            month="September",
            day="Sep 30",
            service=local,
            pipeline="C · Maintenance",
            what="Nightly scans",
            quantity="0.9 M tokens",
        ),
    ]


MAINTENANCE_FIX = "maintenance.*=fix"
"""The key in `EXTRA_IMPACTS` for raising any `maintenance.<repo>` level to fix."""

EXTRA_IMPACTS: dict[str, list[ImpactLine]] = {
    "image.enabled": [
        ImpactLine(name="Model pool while an image renders", change="+6 GB", source="estimate"),
        ImpactLine(
            name="Chat on fallback model",
            change="+2 min/day",
            source="estimate",
            status=StatusLabel(status="attention", label="Worse"),
        ),
    ],
    "offline_library": [
        ImpactLine(
            name="Working drive", change="+38 GB for the installed tiers", source="measured"
        ),
        ImpactLine(name="Nightly index rebuild", change="0 → 4 min", source="simulated"),
    ],
    "resources.desk_mode": [
        ImpactLine(name="Memory free for your apps", change="+4 GB", source="measured"),
        ImpactLine(
            name="Agent work per hour",
            change="−25%",
            source="estimate",
            status=StatusLabel(status="attention", label="Slower"),
        ),
    ],
    MAINTENANCE_FIX: [
        ImpactLine(
            name="Custodian's fixes",
            change="reported → merged once tests pass",
            source="simulated",
        ),
        ImpactLine(name="Merged fixes a week", change="0 → about 2", source="estimate"),
    ],
}
"""Impact cards for switches that are neither paid features nor the independent reviewer, for
Desk mode, and (under `MAINTENANCE_FIX`) for raising any product's maintenance level to fix."""

OUTCOMES: dict[str, list[OutcomeLine]] = {
    "quiet_hours": [
        OutcomeLine(
            name="Heavy jobs started inside quiet hours",
            predicted="0 → 0",
            actual="0",
            source="measured",
            status=StatusLabel(status="healthy", label="As predicted"),
        ),
        OutcomeLine(
            name="Alerts that woke you",
            predicted="3 → 1 a week",
            actual="1 a week",
            source="measured",
            status=StatusLabel(status="healthy", label="As predicted"),
        ),
        OutcomeLine(
            name="Maintenance scan finished by 06:00",
            predicted="100% → 100%",
            actual="86%",
            source="measured",
            status=StatusLabel(status="attention", label="Missed by 14%"),
        ),
    ]
}
"""What the simulator predicted for the latest change of a setting, and what was measured."""

OUTCOME_AFTER = timedelta(days=7)
"""How long a change runs before predicted versus actual is checked (spec 7.18)."""
