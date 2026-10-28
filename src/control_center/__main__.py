"""Entry point: `python -m control_center` starts Brain on 127.0.0.1:8406."""

import sys

import uvicorn

from control_center.app import create_app
from control_center.config import ConfigError, load_config


def main() -> int:
    """Load the configuration, then serve until interrupted. Returns the process exit code."""
    try:
        config = load_config()
    except ConfigError as error:
        print(f"Brain did not start: {error}", file=sys.stderr)  # noqa: T201 -- entry point
        return 2
    uvicorn.run(create_app(config), host=config.host, port=config.port, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
