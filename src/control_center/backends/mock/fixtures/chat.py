"""The five leads and a starting conversation with Atlas, from the design's Chat page."""

from datetime import datetime, timedelta

from control_center.contract.today import ChatLead, ChatMessage

LEADS = [
    ChatLead(id="atlas", name="Atlas", title="Chief of Staff", department="personal"),
    ChatLead(id="spark", name="Spark", title="Ideation Lead", department="ideation"),
    ChatLead(id="foreman", name="Foreman", title="Development Lead", department="governance"),
    ChatLead(id="custodian", name="Custodian", title="Maintenance Lead", department="engineering"),
    ChatLead(id="wayfinder", name="Wayfinder", title="Platform Guide", department="governance"),
]
"""The leads with web identities (spec 7.8). Brain may chat with these and no one else."""


def atlas_history(now: datetime) -> list[ChatMessage]:
    """This morning's exchange with Atlas, ending in an inline approval card."""
    morning = now - timedelta(hours=1)
    return [
        ChatMessage(
            id="M-1",
            lead_id="atlas",
            author="owner",
            text=(
                "Remind me to renew my passport, and check what Dad's insurance needs for the "
                "new pharmacy."
            ),
            at=morning,
        ),
        ChatMessage(
            id="M-2",
            lead_id="atlas",
            author="lead",
            text=(
                "Two things, done and drafted:\n"
                "1. Passport renewal is now a case, due March 1, with reminders 60 and 14 days "
                "before. I mirrored it to your Reminders.\n"
                "2. Health is a restricted domain, so Pulse checked it locally. The plan needs "
                "the pharmacy to be in network. I drafted an email to the insurer asking them to "
                "confirm."
            ),
            at=morning + timedelta(minutes=1),
            note="Local model · nothing sent to the cloud",
            approval_id="AP-0110",
        ),
    ]


MOCK_REPLY = (
    "I'm the mock relay, standing in for {name} until OpenClaw runs on the Mac. "
    "In the real platform this answer comes from {name}'s web identity through the chat relay."
)
"""What every lead says in the mock. Plain about being a stand-in, so nobody mistakes it."""
