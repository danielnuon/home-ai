"""The mock gate's people: contacts, their trust, and the household's principals (spec 7.2).

Loosening asks for a passkey and tightening takes one tap (spec 7.16, rule 3): allowlisting a
contact, adding a principal or mapping a new account to one needs a step-up; blocking a contact
or unmapping an account does not. A removed contact goes to the shared 30-day trash (rule 11); a
removed principal can be restored for seven days, after which their data is archived or deleted.
"""

import secrets
from datetime import timedelta
from typing import Any

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock import setting_rules
from control_center.backends.mock.engine_shell import RESTORERS, send_to_trash
from control_center.backends.mock.fixtures import contacts as people_fixtures
from control_center.backends.mock.gate_step_up import StepUpDesk
from control_center.backends.mock.world import MockWorld
from control_center.contract.people import (
    Contact,
    ContactDetail,
    ContactDraft,
    ContactMention,
    ContactMerge,
    ContactRemoved,
    ContactsOverview,
    HouseholdMember,
    PrincipalDraft,
    PrincipalMapping,
    PrincipalRemoval,
    PrincipalRemove,
    TrustChange,
)

TRUST_WORDS = {
    "allowlisted": "Allowlisted",
    "known": "Known",
    "unknown": "Unknown",
    "blocked": "Blocked",
}


def _put_contact_back(world: MockWorld, payload: Any) -> None:
    contact, history = payload
    world.contacts[contact.id] = contact
    world.contact_history[contact.id] = history
    world.bus.changed("contacts", "security")


RESTORERS["contact"] = _put_contact_back


class PeopleDesk(StepUpDesk):
    """The contacts and household part of `ApprovalGate`."""

    # Reading -------------------------------------------------------------------------------

    def contacts(self) -> ContactsOverview:
        """Household principals, contacts, and the accounts that can be mapped to principals."""
        self._purge_removed_principals()
        return ContactsOverview(
            household=list(self._world.household.values()),
            contacts=list(self._world.contacts.values()),
            accounts=people_fixtures.ACCOUNTS,
        )

    def contact_detail(self, contact_id: str) -> ContactDetail:
        """One contact with its history and the drafts and rules that mention it.

        Args:
            contact_id: The contact.

        Returns:
            The contact's sheet.
        """
        contact = self._contact(contact_id)
        drafts = [
            ContactMention(kind="draft", id=a.id, title=a.title, href="/approvals")
            for a in self._world.approvals.values()
            if a.contact_id == contact_id and a.state == "pending"
        ]
        rules = [
            ContactMention(kind="rule", id=rule_id, title=title, href="/personal")
            for rule_id, title, mentions in people_fixtures.RULES
            if contact_id in mentions
        ]
        return ContactDetail(
            contact=contact,
            history=self._world.contact_history.get(contact_id, []),
            mentions=drafts + rules,
        )

    # Contacts ------------------------------------------------------------------------------

    def add_contact(self, draft: ContactDraft, step_up: str | None) -> Contact:
        """Add a contact. Adding one already allowlisted needs a step-up.

        Args:
            draft: The new contact.
            step_up: A proof from `verify_step_up`, needed only to allowlist it.

        Returns:
            The new contact.
        """
        self._check_draft(draft)
        if setting_rules.is_trust_loosening("known", draft.trust):
            self._require_step_up(step_up, f"Allowlisting {draft.name.strip()} needs your passkey.")
        contact = Contact(id=f"C-{secrets.token_hex(2)}", name="", meta="", trust=draft.trust)
        self._fill(contact, draft)
        self._world.contacts[contact.id] = contact
        self._world.contact_history[contact.id] = []
        self._world.bus.changed("contacts", "security")
        return contact

    def edit_contact(self, contact_id: str, draft: ContactDraft, step_up: str | None) -> Contact:
        """Change a contact's details. Giving it more trust needs a step-up.

        Args:
            contact_id: The contact.
            draft: Its new details.
            step_up: A proof from `verify_step_up`, needed only when trust goes up.

        Returns:
            The contact as it is now.
        """
        contact = self._contact(contact_id)
        self._check_draft(draft)
        if setting_rules.is_trust_loosening(contact.trust, draft.trust):
            self._require_step_up(step_up, f"Trusting {contact.name} more needs your passkey.")
        self._fill(contact, draft)
        self._world.bus.changed("contacts", "security")
        return contact

    def set_trust(self, contact_id: str, change: TrustChange, step_up: str | None) -> Contact:
        """Change a contact's trust; more trust needs a step-up.

        Args:
            contact_id: The contact.
            change: The new trust level.
            step_up: A proof from `verify_step_up`, needed only when the change loosens something.

        Returns:
            The contact with its new trust.
        """
        contact = self._contact(contact_id)
        if setting_rules.is_trust_loosening(contact.trust, change.trust):
            self._require_step_up(step_up, f"Trusting {contact.name} more needs your passkey.")
        contact.trust = change.trust
        self._world.bus.changed("contacts", "security")
        return contact

    def merge_contact(self, contact_id: str, merge: ContactMerge) -> Contact:
        """Fold one contact into another. The one kept keeps its own trust, so nothing loosens.

        Its channels, linked accounts and history move to the one kept; the merged contact goes
        to the trash, so the merge can be undone by restoring it.

        Args:
            contact_id: The contact that goes away.
            merge: The contact it folds into.

        Returns:
            The contact that was kept.

        Raises:
            ConflictError: A contact can't be merged into itself.
        """
        source = self._contact(contact_id)
        target = self._contact(merge.into)
        if source.id == target.id:
            raise ConflictError("Choose a different contact to merge into.")
        seen = {(c.kind, c.value) for c in target.channels}
        target.channels += [c for c in source.channels if (c.kind, c.value) not in seen]
        target.linked_accounts = list(
            dict.fromkeys(target.linked_accounts + source.linked_accounts)
        )
        target.principal = target.principal or source.principal
        target.meta = self._meta(target)
        history = self._world.contact_history
        moved = history.get(source.id, [])
        history[target.id] = sorted(
            history.get(target.id, []) + moved, key=lambda e: e.at, reverse=True
        )
        self._trash(source, moved)
        self._world.bus.changed("contacts", "security")
        return target

    def remove_contact(self, contact_id: str) -> ContactRemoved:
        """Send a contact to the 30-day trash, from where it can be restored.

        Args:
            contact_id: The contact.

        Returns:
            The trash item that restores it.
        """
        contact = self._contact(contact_id)
        item = self._trash(contact, self._world.contact_history.get(contact_id, []))
        self._world.bus.changed("contacts", "security")
        return ContactRemoved(trash_id=item, message=f"{contact.name} moved to Recently deleted.")

    # Principals ----------------------------------------------------------------------------

    def add_principal(self, draft: PrincipalDraft, step_up: str | None) -> HouseholdMember:
        """Add a household principal. Always needs a step-up.

        Args:
            draft: Their name.
            step_up: A proof from `verify_step_up`.

        Returns:
            The new principal, with nothing mapped yet.

        Raises:
            ConflictError: No name was given.
        """
        name = draft.name.strip()
        if not name:
            raise ConflictError("Give the person a name first.")
        self._require_step_up(step_up, f"Adding {name} to the household needs your passkey.")
        member = HouseholdMember(id=f"P-{secrets.token_hex(2)}", name=name, meta="")
        member.meta = people_fixtures.household_meta(member)
        self._world.household[member.id] = member
        self._world.bus.changed("contacts")
        return member

    def map_principal(
        self, principal_id: str, mapping: PrincipalMapping, step_up: str | None
    ) -> HouseholdMember:
        """Set the accounts and calendars mapped to a principal.

        Mapping a new account or calendar loosens what the principal's employees can read and
        needs a step-up; only unmapping takes one tap. An account belongs to one principal, so
        mapping it here unmaps it from anyone else.

        Args:
            principal_id: The principal.
            mapping: Every account and calendar they should have.
            step_up: A proof from `verify_step_up`, needed when anything new is mapped.

        Returns:
            The principal as they are now.

        Raises:
            ConflictError: An id is not an account or calendar of that kind.
        """
        member = self._principal(principal_id)
        kinds = {a.id: a.kind for a in people_fixtures.ACCOUNTS}
        if any(kinds.get(i) != "account" for i in mapping.accounts) or any(
            kinds.get(i) != "calendar" for i in mapping.calendars
        ):
            raise ConflictError("That account or calendar isn't connected. Add it on Connections.")
        added = set(mapping.accounts + mapping.calendars) - set(member.accounts + member.calendars)
        if added:
            self._require_step_up(step_up, f"Mapping accounts to {member.name} needs your passkey.")
        for other in self._world.household.values():
            if other.id != member.id:
                other.accounts = [i for i in other.accounts if i not in added]
                other.calendars = [i for i in other.calendars if i not in added]
                other.meta = people_fixtures.household_meta(other)
        member.accounts = list(dict.fromkeys(mapping.accounts))
        member.calendars = list(dict.fromkeys(mapping.calendars))
        member.meta = people_fixtures.household_meta(member)
        self._world.bus.changed("contacts")
        return member

    def remove_principal(
        self, principal_id: str, remove: PrincipalRemove, step_up: str | None
    ) -> HouseholdMember:
        """Start removing a principal. Their data is archived or deleted after seven days.

        Args:
            principal_id: The principal.
            remove: Whether to archive or delete their data.
            step_up: A proof from `verify_step_up`.

        Returns:
            The principal, with the removal and its undo deadline.

        Raises:
            ConflictError: The Owner can't be removed, or the removal already started.
        """
        member = self._principal(principal_id)
        if member.role == "owner":
            raise ConflictError("The Owner can't be removed from the household.")
        if member.removal is not None:
            raise ConflictError(f"{member.name} is already being removed.")
        self._require_step_up(step_up, f"Removing {member.name} needs your passkey.")
        days = timedelta(days=people_fixtures.PRINCIPAL_UNDO_DAYS)
        member.removal = PrincipalRemoval(keep=remove.keep, undo_until=self._world.clock() + days)
        self._world.bus.changed("contacts")
        return member

    def undo_remove_principal(self, principal_id: str) -> HouseholdMember:
        """Keep a principal whose removal hasn't become permanent. Takes one tap.

        Args:
            principal_id: The principal.

        Returns:
            The principal, no longer being removed.

        Raises:
            ConflictError: They are not being removed.
        """
        member = self._principal(principal_id)
        if member.removal is None:
            raise ConflictError(f"{member.name} isn't being removed.")
        member.removal = None
        self._world.bus.changed("contacts")
        return member

    # Helpers -------------------------------------------------------------------------------

    def _contact(self, contact_id: str) -> Contact:
        contact = self._world.contacts.get(contact_id)
        if contact is None:
            raise NotFoundError("That contact no longer exists.")
        return contact

    def _principal(self, principal_id: str) -> HouseholdMember:
        self._purge_removed_principals()
        member = self._world.household.get(principal_id)
        if member is None:
            raise NotFoundError("That person isn't in the household.")
        return member

    def _purge_removed_principals(self) -> None:
        """Remove for good the principals whose seven days of undo have passed."""
        now = self._world.clock()
        gone = [
            m.id
            for m in self._world.household.values()
            if m.removal is not None and m.removal.undo_until <= now
        ]
        for member_id in gone:
            del self._world.household[member_id]
            for contact in self._world.contacts.values():
                if contact.principal == member_id:
                    contact.principal = None
                    contact.meta = self._meta(contact)
        if gone:
            self._world.bus.changed("contacts")

    def _check_draft(self, draft: ContactDraft) -> None:
        if not draft.name.strip():
            raise ConflictError("Give the contact a name first.")
        if any(not c.value.strip() for c in draft.channels):
            raise ConflictError("Fill in each channel, or remove the empty one.")
        if draft.principal is not None and draft.principal not in self._world.household:
            raise ConflictError("That person isn't in the household.")

    def _fill(self, contact: Contact, draft: ContactDraft) -> None:
        contact.name = draft.name.strip()
        contact.area = draft.area.strip()
        contact.principal = draft.principal
        contact.channels = [c.model_copy(update={"value": c.value.strip()}) for c in draft.channels]
        contact.trust = draft.trust
        contact.meta = self._meta(contact)

    def _meta(self, contact: Contact) -> str:
        names = {m.id: m.name for m in self._world.household.values()}
        return people_fixtures.contact_meta(contact, names)

    def _trash(self, contact: Contact, history: list[Any]) -> str:
        del self._world.contacts[contact.id]
        self._world.contact_history.pop(contact.id, None)
        item = send_to_trash(
            self._world,
            kind="contact",
            title=contact.name,
            meta=" · ".join(p for p in (TRUST_WORDS[contact.trust], contact.area) if p),
            home="/contacts",
            payload=(contact, history),
        )
        return item.id
