"""Settings and hard limits for the mock gate: the defaults of spec 22.13."""

from datetime import datetime, timedelta

from control_center.contract.gate import HardLimit, Setting, SettingChange


def settings(now: datetime) -> list[Setting]:
    """Defaults from spec 22.13, grouped as on the Settings page of the design.

    The call voice and quiet hours carry earlier changes, so history and revert have something to
    show (spec 7.9).
    """
    return [
        *_model_settings(),
        *_token_settings(),
        *_privacy_settings(),
        *_call_settings(now),
        *_operation_settings(now),
    ]


def _paid_feature(
    key: str, label: str, note: str, category: str, cap: tuple[str, int]
) -> list[Setting]:
    """A paid feature's on switch and its monthly cap, both off and $0 by default (spec 3.6).

    `cap` is the cap setting's key and its hard ceiling from `policy.yaml`.
    """
    cap_key, ceiling = cap
    return [
        Setting(
            key=key,
            label=label,
            note=note,
            category=category,
            kind="switch",
            value="off",
            default="off",
            owner_page="spend",
            cost_note="Costs money",
        ),
        Setting(
            key=cap_key,
            label=f"{label}: monthly cap",
            note="Spending stops at the cap",
            category=category,
            kind="money",
            value="0",
            default="0",
            ceiling=ceiling,
            owner_page="spend",
            cost_note=f"Hard ceiling ${ceiling} a month",
        ),
    ]


CLOUD_NOTE = "Cloud model · used only where it beats local by 15% and data allows"


def _model_settings() -> list[Setting]:
    category = "Models and performance"
    return [
        Setting(
            key="models.review.independent",
            label="Independent reviewer",
            note="Review code on a different model family; shows its impact first",
            category=category,
            kind="switch",
            value="off",
            default="off",
            on_is_loosening=False,
            owner_page="models",
        ),
        *_paid_feature(
            "cloud.providers.anthropic",
            "Claude (Anthropic)",
            CLOUD_NOTE,
            category,
            ("budget.anthropic", 100),
        ),
        *_paid_feature(
            "cloud.providers.openai",
            "GPT-6 Sol (OpenAI)",
            CLOUD_NOTE,
            category,
            ("budget.openai", 100),
        ),
        *_paid_feature(
            "video.cloud", "Cloud video", "Per second of video", category, ("budget.video", 50)
        ),
        Setting(
            key="image.enabled",
            label="Image generation",
            note="Local, free",
            category=category,
            kind="switch",
            value="on",
            default="on",
            owner_page="models",
        ),
    ]


OUTPUT_CAPS = {
    "CONVERSE": 1536,
    "EXTRACT": 1024,
    "WRITE": 4096,
    "REASON": 4096,
    "CODE": 8192,
    "REVIEW": 3072,
}
"""Default answer caps per task family, in tokens, reasoning excluded (spec 8.8, 22.13)."""

REASONING_CEILINGS = {"CONVERSE": 1024, "REASON": 8192, "CODE": 4096, "REVIEW": 4096}
"""Default reasoning ceilings, in tokens, for the families that think (spec 8.8, 22.13).

EXTRACT and WRITE run with thinking off, so they have no ceiling to set.
"""

TOOL_RESULT_INLINE_MAX = 2000
"""Default size, in tokens, above which a tool result becomes a summary and a handle."""


def _token_level(key: str, label: str, note: str, default: int) -> Setting:
    """A token limit as a level: half, the default, or double. Lower is tighter (spec 8.8.7)."""
    return Setting(
        key=key,
        label=label,
        note=note,
        category="Tokens",
        kind="level",
        value=str(default),
        default=str(default),
        choices=[str(default // 2), str(default), str(default * 2)],
        owner_page="models",
    )


def _token_settings() -> list[Setting]:
    """The `models.tokens.*` caps the Owner can change (spec 8.8.7, 22.13).

    Reasoning level, speculative mode and batch stream count are not here: the selector plan
    sets them, and they arrive as critical decisions (spec 7.9).
    """
    caps = [
        _token_level(
            f"models.tokens.output_cap.{family}",
            f"Answer cap: {family}",
            "Longest answer in tokens, thinking not counted",
            cap,
        )
        for family, cap in OUTPUT_CAPS.items()
    ]
    ceilings = [
        _token_level(
            f"models.tokens.reasoning.ceiling.{family}",
            f"Thinking ceiling: {family}",
            "Most tokens spent thinking before an answer",
            ceiling,
        )
        for family, ceiling in REASONING_CEILINGS.items()
    ]
    inline = _token_level(
        "models.tokens.tool_result_inline_max",
        "Tool result kept in context",
        "A larger result becomes a summary and a handle",
        TOOL_RESULT_INLINE_MAX,
    )
    return [*caps, *ceilings, inline]


def _privacy_settings() -> list[Setting]:
    detail = ["counts", "summary", "full"]
    return [
        Setting(
            key="discord.detail.restricted",
            label="Discord detail: restricted domains",
            note="Health, finance, investing, taxes, rental",
            category="Privacy",
            kind="level",
            value="summary",
            default="summary",
            choices=detail,
            owner_page="settings",
        ),
        Setting(
            key="discord.detail.other",
            label="Discord detail: other domains",
            note="Admin, household, career, business",
            category="Privacy",
            kind="level",
            value="full",
            default="full",
            choices=detail,
            owner_page="settings",
        ),
        Setting(
            key="stepup.restricted_views",
            label="Step-up to view restricted",
            note="Passkey before opening those pages",
            category="Privacy",
            kind="switch",
            value="off",
            default="off",
            on_is_loosening=False,
            owner_page="settings",
        ),
    ]


def _call_settings(now: datetime) -> list[Setting]:
    return [
        *_paid_feature(
            "voice.enabled",
            "Approval calls",
            "Twilio · class C approvals by phone",
            "Calls",
            ("budget.voice", 20),
        ),
        Setting(
            key="voice.profile",
            label="Call voice",
            note="Who reads the approval call · free",
            category="Calls",
            kind="choice",
            value="heart",
            default="twilio_default",
            choices=["twilio_default", "heart", "michael", "my_voice", "mom"],
            owner_page="voice",
            history=[
                SettingChange(
                    at=now - timedelta(days=3), old="twilio_default", new="heart", via="discord"
                )
            ],
        ),
        Setting(
            key="voice.profiles.celebrity_clones",
            label="Private celebrity clones",
            note="Legal risk you accept; calls to you only",
            category="Calls",
            kind="switch",
            value="off",
            default="off",
            owner_page="voice",
        ),
    ]


def _operation_settings(now: datetime) -> list[Setting]:
    return [
        Setting(
            key="away_mode",
            label="Away mode",
            note="Pauses pipelines A–D; reminders and backups keep running",
            category="Operations",
            kind="switch",
            value="off",
            default="off",
            on_is_loosening=False,
            owner_page="today",
        ),
        Setting(
            key="quiet_hours",
            label="Quiet hours",
            note="Alerts held; approvals' expiry starts at delivery",
            category="Operations",
            kind="choice",
            value="22:00–06:00",
            default="22:00–06:00",
            choices=["21:00–06:00", "22:00–06:00", "23:00–07:00"],
            owner_page="schedule",
            history=[
                SettingChange(
                    at=now - timedelta(days=9), old="23:00–07:00", new="22:00–06:00", via="brain"
                ),
                SettingChange(
                    at=now - timedelta(days=40), old="22:00–06:00", new="23:00–07:00", via="desk"
                ),
            ],
        ),
        Setting(
            key="heartbeat.enabled",
            label="Heartbeat monitor",
            note="Free Healthchecks.io check",
            category="Operations",
            kind="switch",
            value="on",
            default="on",
            on_is_loosening=False,
            owner_page="system",
        ),
        *_paid_feature(
            "offsite.paid_storage",
            "Paid offsite backup",
            "restic to S3-compatible storage",
            "Operations",
            ("budget.offsite", 20),
        ),
        Setting(
            key="outbound.mail_send",
            label="Sending email",
            note="Off until Phase 16; sending still follows action tiers",
            category="Operations",
            kind="switch",
            value="off",
            default="off",
            owner_page="settings",
        ),
    ]


def hard_limits() -> list[HardLimit]:
    """Read-only ceilings from `policy.yaml` (spec 22.2)."""
    return [
        HardLimit(name="Cloud model spend", value="$100 a month"),
        HardLimit(name="Voice calls spend", value="$20 a month"),
        HardLimit(name="Cloud video spend", value="$50 a month"),
        HardLimit(name="Offsite storage spend", value="$20 a month"),
        HardLimit(name="Never allowed", value="Payments, transfers, trades, signing"),
        HardLimit(name="Host execution", value="Denied"),
        HardLimit(name="Highest Discord detail", value="Full"),
    ]
