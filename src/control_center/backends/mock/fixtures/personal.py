"""Agenda, cases, domains, finance and Setup steps for the mock engine."""

from control_center.contract.common import Metric, Principal, StatusLabel
from control_center.contract.personal import (
    AutomaticChange,
    BudgetLine,
    Case,
    Domain,
    FinanceOverview,
    SetupCheck,
    SetupStep,
    StatementImport,
)
from control_center.contract.today import AgendaItem


def agenda() -> list[AgendaItem]:
    """Today's agenda from the design."""
    return [
        AgendaItem(
            id="EV-1",
            time="09:30",
            title="Call with the property insurer",
            meta="Rental · Keystone prepared notes",
        ),
        AgendaItem(
            id="EV-2",
            time="13:00",
            title="Dentist cleaning",
            meta="Health · Pulse · leave by 12:35",
        ),
        AgendaItem(
            id="EV-3",
            time="18:00",
            title="Car registration renewal due",
            meta="Home and auto · case open",
        ),
    ]


def cases() -> list[Case]:
    """Cases due soon across the three principals."""
    due_soon = StatusLabel(status="in_progress", label="Open")
    return [
        Case(
            id="CS-0201",
            title="Car registration renewal",
            domain="Home and auto",
            principal="owner",
            employee_name="Hearth",
            due="today",
            status=StatusLabel(status="attention", label="Due today"),
            state="open",
        ),
        Case(
            id="CS-0198",
            title="Estimated tax payment Q4",
            domain="Taxes",
            principal="owner",
            employee_name="Taxonomy",
            due="Jan 15",
            status=due_soon,
            state="open",
        ),
        Case(
            id="CS-0187",
            title="Unit B lease renewal",
            domain="Rental",
            principal="owner",
            employee_name="Keystone",
            due="Nov 30",
            status=due_soon,
            state="open",
        ),
        Case(
            id="CS-0176",
            title="Medicare plan review",
            domain="Health",
            principal="dad",
            employee_name="Pulse",
            due="Dec 7",
            status=due_soon,
            state="open",
        ),
    ]


def domains() -> list[Domain]:
    """Personal domains (spec 20.1) with their data classes."""
    return [
        Domain(name="Calendar and admin", open_cases="4 open", data_class="internal"),
        Domain(name="Home and auto", open_cases="3 open · 1 due", data_class="internal"),
        Domain(name="Health and benefits", open_cases="2 open", data_class="restricted"),
        Domain(name="Finance", open_cases="1 open", data_class="restricted"),
        Domain(name="Investing", open_cases="Nothing open", data_class="restricted"),
        Domain(name="Taxes", open_cases="2 open", data_class="restricted"),
        Domain(name="Rental", open_cases="3 open", data_class="restricted"),
        Domain(name="Career and business", open_cases="1 open", data_class="internal"),
    ]


def recent_changes() -> list[AutomaticChange]:
    """Automatic changes the Owner can undo."""
    return [
        AutomaticChange(id="AC-1", text="Filed 3 utility bills into Finance", undone=False),
        AutomaticChange(id="AC-2", text='Added "oil change" at 5,000 miles', undone=False),
    ]


def finance(principal: Principal) -> FinanceOverview:
    """Sample figures for one principal. The design shows the Owner's; the parents' are smaller."""
    scale = 1.0 if principal == "owner" else 0.6
    lines = [
        ("Housing", 2100, 2100),
        ("Groceries", 540, 650),
        ("Transport", 310, 280),
        ("Utilities", 190, 240),
        ("Subscriptions", 86, 90),
    ]
    return FinanceOverview(
        principal=principal,
        month="October",
        days_elapsed="25 of 31 days",
        budget=[
            BudgetLine(name=name, spent=round(spent * scale), budget=round(budget * scale))
            for name, spent, budget in lines
        ],
        net_worth=Metric(
            name="Net worth",
            value=f"${round(412_800 * scale):,}",
            spark=[388, 391, 395, 393, 398, 401, 400, 404, 407, 405, 410, 412.8],
        ),
        imports=[
            StatementImport(
                account="Checking ··1042",
                meta="Last statement Oct 1 · next Nov 1",
                status=StatusLabel(status="healthy", label="Current"),
            ),
            StatementImport(
                account="Credit card ··7731",
                meta="Last statement Sep 18 · expected Oct 18",
                status=StatusLabel(status="attention", label="Overdue"),
            ),
            StatementImport(
                account="Brokerage ··5520",
                meta="Last export Oct 3",
                status=StatusLabel(status="healthy", label="Current"),
            ),
        ],
    )


def setup_steps() -> list[SetupStep]:
    """Register items (spec 24.4) in the state the design shows: one done, one deferred."""
    allowed = StatusLabel(status="healthy", label="Allowed")
    waiting = StatusLabel(status="attention", label="Waiting")
    return [
        SetupStep(
            id="OI-10",
            title="Register your passkeys",
            duration="About 5 min",
            required=True,
            why="A passkey proves it is you; only your devices can hold one.",
            until="Nothing that needs a step-up can happen.",
            stub="Virtual authenticator",
            cta="Register",
            state="done",
            proof="Test assertion passed Oct 24 · iPhone and security key",
        ),
        SetupStep(
            id="OI-15",
            title="Allow Mac permissions",
            duration="About 5 min · over Screen Sharing",
            required=True,
            why="macOS shows these prompts only to the person logged in.",
            until="Calendar, reminders, contacts and Mail stay off.",
            stub="Recorded test calendar and mailbox",
            cta="Open Screen Sharing",
            state="ready",
            checks=[
                SetupCheck(name="Calendar", status=allowed),
                SetupCheck(name="Reminders", status=allowed),
                SetupCheck(name="Contacts", status=waiting),
                SetupCheck(name="Mail (Automation)", status=waiting),
                SetupCheck(
                    name="Messages (Automation)",
                    status=StatusLabel(status="neutral", label="Optional"),
                ),
            ],
        ),
        SetupStep(
            id="OI-18",
            title="Profile interview with Atlas",
            duration="About 20 min · chat, can pause",
            required=False,
            why="Your routines and preferences are facts only you know.",
            until="Atlas asks as it goes and uses defaults.",
            stub="Sample profile",
            cta="Start with Atlas",
            state="ready",
        ),
        SetupStep(
            id="OI-22",
            title="Confirm your preferences",
            duration="2 min · defaults shown",
            required=False,
            why="Quiet hours, brief time and Discord detail are your call.",
            until="Defaults apply: 22:00–06:00, brief 06:15, restricted domains summary.",
            stub="Defaults",
            cta="Review defaults",
            state="ready",
        ),
        SetupStep(
            id="OI-13",
            title="Discord server and bots",
            duration="About 15 min · two bot tokens",
            required=False,
            why="Only you can create bots in your Discord account.",
            until="Brain-only operation; Discord commands are off.",
            stub="Local Discord mock",
            cta="Start guide",
            state="deferred",
        ),
        SetupStep(
            id="OI-16",
            title="Connect your accounts",
            duration="About 10 min per account",
            required=True,
            why="Sign-ins and app passwords belong to you.",
            until="The test mailbox and calendar stand in.",
            stub="Test mail and calendar server",
            cta="Connect",
            state="waiting",
            waiting_on="After Mac permissions",
        ),
        SetupStep(
            id="OI-17",
            title="Name principals and map accounts",
            duration="About 5 min",
            required=True,
            why="Only you know whose account is whose.",
            until="Everything is filed under you.",
            stub="Synthetic principals",
            cta="Map accounts",
            state="waiting",
            waiting_on="After accounts",
        ),
    ]
