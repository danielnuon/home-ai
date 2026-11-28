"""People: the household's principals, outside contacts and their trust (spec 7.2, Contacts).

Contacts and principals have one home page, Contacts (spec 7.16, rule 1). Loosening, such as
allowlisting a contact, adding a principal or mapping accounts to one, needs a passkey step-up;
tightening takes one tap (rule 3). A removed contact goes to the 30-day trash (rule 11), and a
removed principal has seven days of undo before their data is archived or deleted for good.
"""

from datetime import datetime
from typing import Literal

from pydantic import Field

from control_center.contract.base import ContractModel
from control_center.contract.common import Trust

ChannelKind = Literal["email", "phone", "text", "post"]


class ContactChannel(ContractModel):
    """One way to reach a contact."""

    kind: ChannelKind
    value: str


class Contact(ContractModel):
    """An outside contact and its trust level (spec 7.2, Contacts).

    `meta` is the line under the name: the area and how the contact is reached.
    """

    id: str
    name: str
    meta: str
    trust: Trust
    area: str = ""
    principal: str | None = None
    """The household member the contact deals with, by id; None for the whole household."""
    channels: list[ContactChannel] = Field(default_factory=list)
    linked_accounts: list[str] = Field(default_factory=list)
    """The household's accounts this contact writes to or from, by label."""


class ContactEvent(ContractModel):
    """A message or approval in a contact's history."""

    at: datetime
    kind: Literal["message", "approval"]
    title: str
    detail: str


class ContactMention(ContractModel):
    """A draft or rule that names a contact; listed before the contact is removed (7.16, rule 5)."""

    kind: Literal["draft", "rule"]
    id: str
    title: str
    href: str


class ContactDetail(ContractModel):
    """One contact as its sheet shows it: channels, accounts, history and what mentions it."""

    contact: Contact
    history: list[ContactEvent]
    mentions: list[ContactMention]


class ContactDraft(ContractModel):
    """A new contact, or a contact's edited fields. Allowlisting through it needs a step-up."""

    name: str
    area: str = ""
    principal: str | None = None
    channels: list[ContactChannel] = Field(default_factory=list)
    trust: Trust = "known"


class ContactMerge(ContractModel):
    """Merge this contact into another one, which keeps its own trust."""

    into: str


class ContactRemoved(ContractModel):
    """A contact sent to the trash, with the trash item that restores it."""

    trash_id: str
    message: str


class TrustChange(ContractModel):
    """A new trust level. Allowlisting loosens and needs a step-up; removing tightens."""

    trust: Trust


class PrincipalRemoval(ContractModel):
    """A principal being removed: what happens to their data, and when that becomes permanent."""

    keep: Literal["archive", "delete"]
    undo_until: datetime


class HouseholdMember(ContractModel):
    """A household principal, shown at the top of Contacts, with the accounts mapped to them."""

    id: str
    name: str
    meta: str
    role: Literal["owner", "principal"] = "principal"
    accounts: list[str] = Field(default_factory=list)
    """Connected accounts mapped to this principal, by `LinkableAccount.id`."""
    calendars: list[str] = Field(default_factory=list)
    """Calendars mapped to this principal, by `LinkableAccount.id`."""
    removal: PrincipalRemoval | None = None


class LinkableAccount(ContractModel):
    """A connected account or calendar that can be mapped to a principal."""

    id: str
    label: str
    kind: Literal["account", "calendar"]


class ContactsOverview(ContractModel):
    """The Contacts page."""

    household: list[HouseholdMember]
    contacts: list[Contact]
    accounts: list[LinkableAccount]


class PrincipalDraft(ContractModel):
    """A new principal. Adding one needs a step-up."""

    name: str


class PrincipalMapping(ContractModel):
    """The accounts and calendars mapped to a principal. Changing them needs a step-up."""

    accounts: list[str]
    calendars: list[str]


class PrincipalRemove(ContractModel):
    """Remove a principal, archiving or deleting their data after seven days."""

    keep: Literal["archive", "delete"]
