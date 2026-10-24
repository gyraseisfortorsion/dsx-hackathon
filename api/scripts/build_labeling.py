"""Offline step: build human-labeling files from the event artifact.

    uv run python scripts/build_labeling.py

Seeds labeling rows from the 247 events (id, title, description, auto tags as a
hint only) and writes two per-labeler files plus one shared independent subset for
inter-annotator agreement. Each row distinguishes three states via label_status:
  - unlabeled                   : not yet reviewed (default)
  - human_reviewed + tags       : reviewed, tags apply
  - human_reviewed + empty tags : reviewed, NO suitable tag applies (a real negative)

Output: `api/labeling/` -- deliberately OUTSIDE the deployed `data/` bundle, so
human-labeling files are never shipped to the serverless function.
"""

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "data" / "event_artifacts.json"
OUT_DIR = ROOT / "labeling"
IAA_FRACTION = 0.15
SEED = 20261024


def _row(event: dict) -> dict:
    return {
        "record_id": event["id"],
        "title": event.get("title", ""),
        "description": event.get("description", ""),
        "auto_tags_hint": sorted(event.get("tags", {})),  # hint only -- NOT the answer
        "source_category_hint": event.get("source_category"),  # hint only
        "label_status": "unlabeled",      # set to "human_reviewed" when done
        "tag_ids": [],                    # empty + human_reviewed = "no tag applies"
        "labeler": None,                  # "A" | "B"
        "notes": "",
    }


def _dump(path: Path, rows: list[dict], labeler: str | None) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(dict(row, labeler=labeler), ensure_ascii=False) + "\n")


def main(second_labeler: bool = True) -> None:
    bundle = json.loads(ARTIFACT.read_text())
    events = sorted(bundle["events"], key=lambda e: e["id"])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    order = list(events)
    rng.shuffle(order)

    if not second_labeler:
        _dump(OUT_DIR / "labeler_A.jsonl", [_row(e) for e in order], "A")
        (OUT_DIR / "README.md").write_text(_SINGLE_README, encoding="utf-8")
        print(f"Wrote 1 labeler file ({len(order)} rows); no IAA (single labeler).")
        return

    n_iaa = max(1, round(len(order) * IAA_FRACTION))
    iaa, rest = order[:n_iaa], order[n_iaa:]
    a_only, b_only = rest[0::2], rest[1::2]
    _dump(OUT_DIR / "iaa_shared.jsonl", [_row(e) for e in iaa], None)
    _dump(OUT_DIR / "labeler_A.jsonl", [_row(e) for e in (iaa + a_only)], "A")
    _dump(OUT_DIR / "labeler_B.jsonl", [_row(e) for e in (iaa + b_only)], "B")
    (OUT_DIR / "README.md").write_text(_TWO_README.format(n_iaa=n_iaa), encoding="utf-8")
    print(f"Wrote labeler_A ({len(iaa)+len(a_only)}), labeler_B ({len(iaa)+len(b_only)}), "
          f"iaa_shared ({n_iaa}).")


_SINGLE_README = """# Labeling (single labeler)

Only labeler A is available. No independent double-labeled subset was produced, so
NO inter-annotator agreement (IAA) is reported. This is a stated limitation, not an
omission. Do not invent an IAA number.
"""

_TWO_README = """# Event tag labeling

Taxonomy: `api/bu_api/event_tags/taxonomy/taxonomy.v1.json` (14 tags, facets
topic / format / other). Read every tag's definition before labeling.

## Files
- `labeler_A.jsonl` / `labeler_B.jsonl`: each labeler's assigned events.
- `iaa_shared.jsonl`: {n_iaa} events BOTH labelers label INDEPENDENTLY, for
  inter-annotator agreement. After both finish, measure per-tag Cohen's kappa (or
  F1 agreement) on this subset, then adjudicate disagreements into the final
  `labeled.jsonl`.

## How to label each row
1. Read `title` + `description`.
2. Set `tag_ids` to every taxonomy tag that applies (multiple facets expected: a
   `tech` topic + a `workshop` format + `free-food`, for example).
3. Set `label_status` to `human_reviewed` when done.
4. Leaving `tag_ids` empty on a reviewed row means "reviewed, no suitable tag
   applies" -- a REAL negative, distinct from `unlabeled`.

## Rules
- `auto_tags_hint` and `source_category_hint` are HINTS only. Do not copy them as
  the answer; judge from the text.
- Multiple topic tags only when the event genuinely spans topics.
- Do not invent tags outside the taxonomy.

The learned model is trained only AFTER enough human-reviewed labels exist; the
readiness check uses independent-group count and per-tag support, not a raw record
count. Do not report quality metrics before real labels and a held-out test split.
"""


if __name__ == "__main__":
    main(second_labeler="--single-labeler" not in sys.argv)
