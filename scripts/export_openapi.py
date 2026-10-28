"""Write Brain's OpenAPI schema to a file, for generating the front end's TypeScript types.

Usage: uv run python scripts/export_openapi.py build/openapi.json
"""

import json
import sys
from pathlib import Path

from control_center.app import create_app
from control_center.config import load_config


def main() -> None:
    """Build the app with the development identity and dump its schema to the path given."""
    config = load_config({"BRAIN_DEV_IDENTITY": "1"})
    schema = create_app(config).openapi()
    Path(sys.argv[1]).write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
