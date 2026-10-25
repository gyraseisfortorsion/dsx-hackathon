"""Export the installed app's OpenAPI contract without starting network services."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bu_api.config import API_ROOT  # noqa: E402
from bu_api.main import app  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail when openapi.json is outdated")
    args = parser.parse_args()
    path = API_ROOT / "openapi.json"
    schema = app.openapi()
    if args.check:
        if not path.exists() or json.loads(path.read_text()) != schema:
            raise SystemExit("openapi.json is outdated; run python scripts/export_openapi.py")
        print("openapi.json matches the current app")
    else:
        path.write_text(json.dumps(schema, indent=2) + "\n")
        print(f"Exported {len(schema['paths'])} paths to {path}")


if __name__ == "__main__":
    main()
