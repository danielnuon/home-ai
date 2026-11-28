"""Contacts and the household's principals (spec 7.2, Contacts), all forwarded to the gate."""

from fastapi import APIRouter

from control_center.contract.people import (
    Contact,
    ContactDetail,
    ContactDraft,
    ContactMerge,
    ContactRemoved,
    ContactsOverview,
    HouseholdMember,
    PrincipalDraft,
    PrincipalMapping,
    PrincipalRemove,
    TrustChange,
)
from control_center.routes import BackendsDep, StepUp

router = APIRouter()


@router.get("/contacts")
def contacts(backends: BackendsDep) -> ContactsOverview:
    """Household principals, contacts, and the accounts that can be mapped."""
    return backends.gate.contacts()


@router.post("/contacts")
def add_contact(body: ContactDraft, backends: BackendsDep, step_up: StepUp = None) -> Contact:
    """Add a contact."""
    return backends.gate.add_contact(body, step_up)


@router.get("/contacts/{contact_id}")
def contact_detail(contact_id: str, backends: BackendsDep) -> ContactDetail:
    """One contact with its history and what mentions it."""
    return backends.gate.contact_detail(contact_id)


@router.put("/contacts/{contact_id}")
def edit_contact(
    contact_id: str, body: ContactDraft, backends: BackendsDep, step_up: StepUp = None
) -> Contact:
    """Change a contact's details."""
    return backends.gate.edit_contact(contact_id, body, step_up)


@router.put("/contacts/{contact_id}/trust")
def set_trust(
    contact_id: str, body: TrustChange, backends: BackendsDep, step_up: StepUp = None
) -> Contact:
    """Change a contact's trust level."""
    return backends.gate.set_trust(contact_id, body, step_up)


@router.post("/contacts/{contact_id}/merge")
def merge_contact(contact_id: str, body: ContactMerge, backends: BackendsDep) -> Contact:
    """Fold a contact into another."""
    return backends.gate.merge_contact(contact_id, body)


@router.post("/contacts/{contact_id}/remove")
def remove_contact(contact_id: str, backends: BackendsDep) -> ContactRemoved:
    """Send a contact to the 30-day trash."""
    return backends.gate.remove_contact(contact_id)


@router.post("/principals")
def add_principal(
    body: PrincipalDraft, backends: BackendsDep, step_up: StepUp = None
) -> HouseholdMember:
    """Add a household principal."""
    return backends.gate.add_principal(body, step_up)


@router.put("/principals/{principal_id}/accounts")
def map_principal(
    principal_id: str, body: PrincipalMapping, backends: BackendsDep, step_up: StepUp = None
) -> HouseholdMember:
    """Map accounts and calendars to a principal."""
    return backends.gate.map_principal(principal_id, body, step_up)


@router.post("/principals/{principal_id}/remove")
def remove_principal(
    principal_id: str, body: PrincipalRemove, backends: BackendsDep, step_up: StepUp = None
) -> HouseholdMember:
    """Start removing a principal, with seven days of undo."""
    return backends.gate.remove_principal(principal_id, body, step_up)


@router.post("/principals/{principal_id}/undo-remove")
def undo_remove_principal(principal_id: str, backends: BackendsDep) -> HouseholdMember:
    """Keep a principal whose removal hasn't become permanent."""
    return backends.gate.undo_remove_principal(principal_id)
