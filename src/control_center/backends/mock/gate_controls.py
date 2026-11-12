"""The mock gate's controls over people and machinery.

Contacts, employees, proposals, services and restores. Each loosening one asks for a step-up.
"""

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock import setting_rules
from control_center.backends.mock.fixtures import gate as gate_fixtures
from control_center.backends.mock.fixtures import platform as platform_fixtures
from control_center.backends.mock.gate_step_up import StepUpDesk
from control_center.contract.personal import Contact, ContactsOverview, TrustChange
from control_center.contract.work import ProposalDecision


class GateControls(StepUpDesk):
    """The contacts, employees, proposals, services and restore part of `ApprovalGate`."""

    def contacts(self) -> ContactsOverview:
        """Household principals and contacts."""
        return ContactsOverview(
            household=gate_fixtures.household(), contacts=list(self._world.contacts.values())
        )

    def set_trust(self, contact_id: str, change: TrustChange, step_up: str | None) -> Contact:
        """Change a contact's trust; more trust needs a step-up.

        Args:
            contact_id: The contact.
            change: The new trust level.
            step_up: A proof from `verify_step_up`, needed only when the change loosens something.

        Returns:
            The contact with its new trust.

        Raises:
            NotFoundError: No such contact.
        """
        contact = self._world.contacts.get(contact_id)
        if contact is None:
            raise NotFoundError("That contact no longer exists.")
        if setting_rules.is_trust_loosening(contact.trust, change.trust):
            self._require_step_up(step_up, f"Trusting {contact.name} more needs your passkey.")
        contact.trust = change.trust
        self._world.bus.changed("contacts", "security")
        return contact

    def set_employee_enabled(self, employee_id: str, enabled: bool, step_up: str | None) -> None:
        """Enable or disable an employee.

        Args:
            employee_id: The employee.
            enabled: Whether the employee may work.
            step_up: A proof from `verify_step_up`, needed only when the change loosens something.

        Raises:
            NotFoundError: No such employee.
        """
        employee = self._world.employees.get(employee_id)
        if employee is None:
            raise NotFoundError("That employee doesn't exist.")
        if enabled and not employee.enabled:
            self._require_step_up(step_up, f"Enabling {employee.name} needs your passkey.")
        employee.enabled = enabled
        self._world.bus.changed("directory")

    def decide_proposal(self, proposal_id: str, decision: ProposalDecision) -> None:
        """Record the Owner's answer to a lifecycle proposal.

        Args:
            proposal_id: The lifecycle proposal.
            decision: The Owner's answer.

        Raises:
            NotFoundError: No such proposal.
            ConflictError: Already decided.
        """
        proposal = self._world.proposals.get(proposal_id)
        if proposal is None:
            raise NotFoundError("That proposal no longer exists.")
        if proposal.state != "open":
            raise ConflictError("This proposal was already decided.")
        proposal.state = "approved" if decision.decision == "approve" else "declined"
        self._world.bus.changed("directory")

    def restart_service(self, service_id: str, step_up: str | None) -> None:
        """Gate a restart behind a step-up. The mock's services are always healthy afterwards.

        Args:
            service_id: The service to restart.
            step_up: A proof from `verify_step_up`, needed only when the change loosens something.

        Raises:
            NotFoundError: No such service.
        """
        known = {s.id for group in platform_fixtures.service_groups() for s in group.services}
        if service_id not in known:
            raise NotFoundError("That service doesn't exist.")
        self._require_step_up(step_up, "Restarting a service needs your passkey.")
        self._world.bus.changed("services")

    def request_restore(self, what: str, point: str, step_up: str | None) -> str:
        """Gate a restore behind a step-up and say where the copy will appear."""
        self._require_step_up(step_up, "Restoring needs your passkey.")
        return f"Restoring {what} from {point} into Restores on the working drive."
