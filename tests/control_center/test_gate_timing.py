"""The gate's clock rules: approvals expire, and decisions take effect when their window ends."""

from datetime import UTC, datetime, timedelta

import pytest

from control_center.backends.errors import ConflictError
from control_center.backends.mock.gate import MockApprovalGate
from control_center.backends.mock.world import build_world
from control_center.contract.gate import ApprovalDecision
from control_center.events import EventBus

START = datetime(2026, 10, 29, 9, 0, tzinfo=UTC)


class FakeClock:
    """A clock the test moves by hand."""

    def __init__(self) -> None:
        """Start at `START`."""
        self.now = START

    def __call__(self) -> datetime:
        """The current fake time."""
        return self.now


@pytest.fixture
def clock() -> FakeClock:
    """A fresh fake clock."""
    return FakeClock()


@pytest.fixture
def gate(clock: FakeClock) -> MockApprovalGate:
    """A mock gate over a fresh world on the fake clock."""
    return MockApprovalGate(build_world(EventBus(), clock))


def test_an_expired_card_cannot_be_approved_even_if_never_listed(
    gate: MockApprovalGate, clock: FakeClock
) -> None:
    """Spec 11: nothing is approved after its card lapses; the lapse needs no list call first."""
    clock.now = START + timedelta(hours=7)  # AP-0107 expires 6 h after the world is built

    with pytest.raises(ConflictError, match="expired"):
        gate.decide("AP-0107", ApprovalDecision(decision="approve"), step_up=None)

    assert next(a for a in gate.list_approvals() if a.id == "AP-0107").state == "expired"


def test_a_decision_takes_effect_when_its_window_ends(
    gate: MockApprovalGate, clock: FakeClock
) -> None:
    """Spec 11.9: an after_window decision is in effect once the window passes."""
    clock.now = START + timedelta(hours=19)  # CDR-0012's window is 18 h 4 min

    record = next(d for d in gate.list_decisions() if d.id == "CDR-0012")

    assert record.status == "in_effect"
    assert record.open, "still highlighted until the Owner acknowledges it"


def test_a_veto_after_the_window_reverts_rather_than_cancels(
    gate: MockApprovalGate, clock: FakeClock
) -> None:
    """Spec 7.2 Decisions: a veto cancels a waiting decision but reverts one in effect."""
    clock.now = START + timedelta(hours=19)

    record = gate.veto("CDR-0012", reason=None)

    assert record.status == "reversed"


def test_acknowledging_an_immediate_decision_in_effect_is_allowed(gate: MockApprovalGate) -> None:
    """Spec 11.9: an unacknowledged decision in effect is open, so Acknowledge works on it."""
    record = next(d for d in gate.list_decisions() if d.id == "CDR-0011")
    record.acknowledged = False

    acknowledged = gate.acknowledge("CDR-0011")

    assert acknowledged.acknowledged
    assert not acknowledged.open
    assert acknowledged.vetoable


def test_a_card_cannot_be_approved_at_the_instant_it_expires(
    gate: MockApprovalGate, clock: FakeClock
) -> None:
    """Spec 11: a card lapses at its expiry, the same boundary as a decision's veto window."""
    clock.now = START + timedelta(hours=6)  # exactly AP-0107's expiry

    with pytest.raises(ConflictError, match="expired"):
        gate.decide("AP-0107", ApprovalDecision(decision="approve"), step_up=None)


def test_a_card_that_expires_under_a_tap_tells_open_pages(clock: FakeClock) -> None:
    """Spec 7.13: state is pushed, so a refused approve refreshes Today and the badge."""
    bus = EventBus()
    gate = MockApprovalGate(build_world(bus, clock))
    clock.now = START + timedelta(hours=7)

    with pytest.raises(ConflictError):
        gate.decide("AP-0107", ApprovalDecision(decision="approve"), step_up=None)

    assert "approvals" in _changed_resources(bus)


def test_a_decision_taking_effect_tells_open_pages(clock: FakeClock) -> None:
    """Spec 7.13: a decision whose window ends is pushed to open pages when it is noticed."""
    bus = EventBus()
    gate = MockApprovalGate(build_world(bus, clock))
    clock.now = START + timedelta(hours=19)

    gate.list_decisions()

    assert "decisions" in _changed_resources(bus)


def test_a_superseded_decision_cannot_be_reopened(gate: MockApprovalGate) -> None:
    """Spec 11.9: reopening undoes an acknowledgement or a veto, nothing else."""
    record = next(d for d in gate.list_decisions() if d.id == "CDR-0012")
    record.status = "superseded"

    with pytest.raises(ConflictError, match="reopened"):
        gate.reopen("CDR-0012")


def _changed_resources(bus: EventBus) -> set[str]:
    """Every resource named by a `changed` event since the bus began."""
    return {
        str(resource)
        for event in bus.replay_after(0)
        if event.kind == "changed" and isinstance(event.payload["resources"], list)
        for resource in event.payload["resources"]
    }
