"""Every page's data answers, matches its contract, and the front end is served safely."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from control_center.app import create_app
from tests.control_center.conftest import make_config

PAGES = [
    "/api/platform",
    "/api/today",
    "/api/approvals",
    "/api/decisions",
    "/api/settings",
    "/api/contacts",
    "/api/live",
    "/api/live/T-5521",
    "/api/work",
    "/api/directory",
    "/api/personal",
    "/api/finance/owner",
    "/api/finance/mom",
    "/api/setup",
    "/api/search?q=patel",
    "/api/chat/atlas",
    "/api/system",
    "/api/services",
    "/api/models",
    "/api/spend",
    "/api/schedule",
    "/api/security",
    "/api/backups",
    "/api/maintenance",
    "/api/connections",
    "/api/voice",
    "/api/docs",
]


@pytest.mark.parametrize("path", PAGES)
def test_every_page_answers(client: TestClient, path: str) -> None:
    assert client.get(path).status_code == 200


def test_chat_stores_the_owner_message(client: TestClient) -> None:
    thread = client.post("/api/chat/atlas", json={"text": "What's on today?"}).json()

    assert thread["messages"][-1]["author"] in ("owner", "lead")
    assert any(m["text"] == "What's on today?" for m in thread["messages"])


def test_front_end_routes_fall_back_to_the_app_and_never_escape_dist(tmp_path: Path) -> None:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>Brain</title>")
    (tmp_path / "icon.svg").write_text("<svg/>")
    config = make_config()
    app = create_app(config.__class__(**{**config.__dict__, "web_dist": tmp_path}))
    client = TestClient(app)

    assert "Brain" in client.get("/decisions").text
    assert client.get("/icon.svg").text == "<svg/>"
    assert "Brain" in client.get("/..%2Fpyproject.toml").text
