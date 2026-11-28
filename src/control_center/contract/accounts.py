"""Accounts, security and money: Connections, Voice, Security, data export and impact previews.

These are the pages of spec 7.2 where the Owner manages what the platform is connected to, who
reads approval calls, how sign-in is protected, and what a setting change will do (7.18).
Connections and secrets follow 7.16 rule 3: connecting and entering a secret loosen, so they need
a passkey; disconnecting and removing a secret tighten, so they take one tap.
"""

from datetime import datetime
from typing import Literal

from pydantic import Field

from control_center.contract.base import ContractModel
from control_center.contract.common import Metric, Principal, Row, StatusLabel
from control_center.contract.status import ImpactLine, Source

# Connections -------------------------------------------------------------------------------

ConnectionKind = Literal["mac_app", "account", "platform", "provider"]
"""A macOS app permission (20.16), a principal's account, a free platform link, or a paid
provider whose key the secrets broker holds."""

Permission = Literal["allowed", "waiting", "denied", "off"]
"""Where a macOS permission stands. "waiting" means the prompt is open on the Mac."""


class Connection(ContractModel):
    """One connected account, app or provider (spec 7.2, Connections).

    `secret` is None for a connection that takes no secret; otherwise it says whether one is
    stored. A stored secret is never sent back: only when it was stored. `href` is the page that
    owns what the connection serves, such as Spend for a paid provider.
    """

    id: str
    kind: ConnectionKind
    title: str
    meta: str
    status: StatusLabel
    connected: bool
    scopes: list[str] = Field(default_factory=list)
    last_sync: str | None = None
    last_error: str | None = None
    secret: Literal["none", "stored"] | None = None
    secret_note: str | None = None
    permission: Permission | None = None
    expires: str | None = None
    last_push: str | None = None
    href: str | None = None


class ConnectionGroup(ContractModel):
    """Connections of one kind, as the page groups them."""

    name: str
    note: str = ""
    connections: list[Connection]


class ConnectionsOverview(ContractModel):
    """The Connections page."""

    groups: list[ConnectionGroup]


class SecretEntry(ContractModel):
    """A secret typed into Brain. It goes to the secrets broker and is never shown again."""

    value: str = Field(min_length=1, max_length=4096)


class ConnectionResult(ContractModel):
    """A connection after an action, and what the toast says."""

    connection: Connection
    message: str
    ok: bool = True


# Voice -------------------------------------------------------------------------------------

VoiceKind = Literal["default", "stock", "consented_clone", "celebrity_clone"]


class VoiceProfile(ContractModel):
    """A voice for approval calls (spec 11.5.1).

    `record` is the consent record for a consented clone, or the risk acknowledgement for a
    private celebrity clone. `clips` counts the rendered script lines; `rendered_at` is when they
    were last rendered (None for Twilio's own voice, which has no local clips).
    """

    id: str
    name: str
    kind: VoiceKind
    meta: str
    engine: str
    record: str | None
    sample: str | None
    clips: int
    rendered_at: datetime | None
    selected: bool
    locked: bool


class StockVoice(ContractModel):
    """A built-in voice of the local engine that can be added as a profile in one tap."""

    id: str
    name: str
    note: str


class VoiceOverview(ContractModel):
    """The Voice page."""

    calls_enabled: bool
    celebrity_clones: bool
    profiles: list[VoiceProfile]
    stock_voices: list[StockVoice]
    script: str
    script_lines: list[str]
    risk_notice: str


class NewVoiceProfile(ContractModel):
    """A profile to add. A stock voice names `stock_id`; a clone names itself and its sample.

    A consented clone needs `consent`, how its owner agreed. A private celebrity clone needs the
    setting on and `risk_acknowledged` (11.5.1, guardrail 3).
    """

    kind: Literal["stock", "consented_clone", "celebrity_clone"]
    stock_id: str | None = None
    name: str | None = Field(default=None, max_length=60)
    sample: str | None = Field(default=None, max_length=200)
    consent: str | None = Field(default=None, max_length=300)
    risk_acknowledged: bool = False


class VoicePreview(ContractModel):
    """What a preview plays: the script lines in the profile's voice, in Brain only."""

    profile_id: str
    lines: list[str]
    message: str


# Security ----------------------------------------------------------------------------------


class Workspace(ContractModel):
    """A workspace the kill switch can stop on its own (spec 7.4, 11.10)."""

    id: str
    name: str
    meta: str
    stopped: bool


class Device(ContractModel):
    """A signed-in device: a Brain session on one of the Owner's tailnet devices."""

    id: str
    name: str
    meta: str
    current: bool


class Passkey(ContractModel):
    """A registered passkey."""

    id: str
    name: str
    meta: str


class SecurityOverview(ContractModel):
    """The Security page. The audit lines are already masked by the audit logger's query socket.

    `allowlist` summarises the allowlisted contacts; each opens Contacts, their home (7.16).
    """

    stopped: bool
    tiles: list[Metric]
    workspaces: list[Workspace]
    flags: list[Row]
    denied: list[Row]
    allowlist: list[Row]
    devices: list[Device]
    passkeys: list[Passkey]
    totp: str
    recovery: str
    audit: list[str]
    chain: str


class NewPasskey(ContractModel):
    """A passkey to register, by the name the Owner gives the device."""

    name: str = Field(min_length=1, max_length=60)


class SecurityResult(ContractModel):
    """What the toast says after a security action."""

    message: str


class TotpReset(ContractModel):
    """A new Discord authenticator secret, shown once (spec 7.2, Security)."""

    setup_key: str
    message: str


class RecoveryCodes(ContractModel):
    """New recovery codes, shown once. The old ones stop working at once."""

    codes: list[str]
    message: str


AuditRange = Literal["today", "7d", "30d"]


class AuditExportRequest(ContractModel):
    """A filtered audit range to export."""

    range: AuditRange = "today"
    filter: str = Field(default="", max_length=100)


class AuditExport(ContractModel):
    """The exported range: masked lines, as the file the browser saves."""

    filename: str
    lines: list[str]
    message: str


# Data export -------------------------------------------------------------------------------

ExportScope = Literal["all"] | Principal


class ExportRequest(ContractModel):
    """Export all data, or one principal's (spec 7.2, Settings). Always behind a step-up."""

    scope: ExportScope


class ExportStarted(ContractModel):
    """What the toast says once an export has started."""

    message: str


# Impact previews ---------------------------------------------------------------------------


class SettingImpact(ContractModel):
    """The impact card for one proposed setting change (spec 7.18). Empty when nothing moves."""

    key: str
    value: str
    lines: list[ImpactLine]


class OutcomeLine(ContractModel):
    """One predicted metric beside what was measured once the change had run for 7 days."""

    name: str
    predicted: str
    actual: str | None
    source: Source
    status: StatusLabel | None = None


class PredictionOutcome(ContractModel):
    """Predicted versus actual for one change in a setting's history (spec 7.18).

    `ready` turns true 7 days after the change; until then `actual` is None on every line and
    `note` says when it will be checked.
    """

    at: datetime
    change: str
    ready: bool
    note: str
    lines: list[OutcomeLine]


class SettingOutcomes(ContractModel):
    """Every change of a setting that has a recorded prediction, newest first."""

    key: str
    outcomes: list[PredictionOutcome]
