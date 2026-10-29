"""Brain's start-up configuration, read once from the environment.

Fails closed: anything missing or contradictory stops the server at start-up with a plain reason,
rather than starting with a weaker default (spec 17.16, "Fail closed").
"""

import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8406
"""Brain's port from spec 7.6. `tailscale serve` publishes it to the tailnet; nothing else does."""

OWNER_TIME_ZONE = ZoneInfo("America/Los_Angeles")
"""The Owner's time zone for greetings and quiet hours. It mirrors `timezone` in schedule.yaml
(spec 22.6) until Brain reads that file, which arrives with the real scheduler."""

WEB_DIST = Path(__file__).parent / "web" / "dist"
"""Where `npm run build` puts the front end. Served as static files when present."""


class ConfigError(Exception):
    """The environment asks for something Brain cannot safely do."""


@dataclass(frozen=True)
class Config:
    """Validated start-up settings.

    Attributes:
        backends: Only "mock" exists until the real services are built (spec 24.1).
        dev_identity: When true, requests need no Tailscale identity header. Allowed only with
            mock backends on the loopback address, for local development and tests.
        owner_login: The Owner's Tailscale login. Requests must carry it in the
            `Tailscale-User-Login` header that `tailscale serve` sets (spec 6.2).
        host: Address to bind.
        port: Port to bind.
        web_dist: Directory of built front-end files.
    """

    backends: str
    dev_identity: bool
    owner_login: str | None
    host: str
    port: int
    web_dist: Path


def load_config(env: dict[str, str] | None = None) -> Config:
    """Read and check `BRAIN_*` variables.

    Args:
        env: The environment to read; defaults to `os.environ`.

    Returns:
        The checked configuration.

    Raises:
        ConfigError: Real backends were asked for (not built yet), the dev identity was asked for
            outside the mock on loopback, or no Owner login was given without it.
    """
    env = dict(os.environ) if env is None else env
    config = Config(
        backends=env.get("BRAIN_BACKENDS", "mock"),
        dev_identity=env.get("BRAIN_DEV_IDENTITY", "0") == "1",
        owner_login=env.get("BRAIN_OWNER_LOGIN") or None,
        host=env.get("BRAIN_HOST", DEFAULT_HOST),
        port=int(env.get("BRAIN_PORT", str(DEFAULT_PORT))),
        web_dist=Path(env.get("BRAIN_WEB_DIST", str(WEB_DIST))),
    )
    if config.backends != "mock":
        raise ConfigError(
            "Only mock backends exist so far. Real ones arrive with their build phases (24.1)."
        )
    if config.dev_identity and config.host != DEFAULT_HOST:
        raise ConfigError("BRAIN_DEV_IDENTITY=1 is allowed only on 127.0.0.1.")
    if not config.dev_identity and not config.owner_login:
        raise ConfigError("Set BRAIN_OWNER_LOGIN to the Owner's Tailscale login.")
    return config
