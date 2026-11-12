"""The mock engine's work items follow the spec's naming rules."""

from control_center.backends.mock.fixtures import work
from control_center.wiring import build_mock_backends


def test_every_stage_has_a_life_cycle_phase() -> None:
    """Spec 17.20: each development stage D0 to D10 belongs to one SDLC phase."""
    assert set(work.PHASE_OF_STAGE) == set(work.STAGE_CODES)


def test_every_work_item_names_its_phase_with_its_stage() -> None:
    """Spec 17.20: each work-item card names the life-cycle phase as well as the stage."""
    for item in work.work_items():
        current = next(stage.code for stage in item.stages if stage.state == "current")

        assert item.status.label.startswith(f"{work.PHASE_OF_STAGE[current]} · "), item.id


def test_todays_tiles_agree_with_the_pages_they_link_to() -> None:
    """Spec 7.3: a tile shows the same figure as its page, without building the page."""
    status = build_mock_backends()[0].status
    tiles = {tile.name: tile for tile in status.subsystem_tiles(status.spend())}

    assert status.services().summary.startswith(tiles["Services"].value)
    assert tiles["Model pool"].status.label == status.models().pool_mode
    assert tiles["Backups"].status == status.backups().mode
