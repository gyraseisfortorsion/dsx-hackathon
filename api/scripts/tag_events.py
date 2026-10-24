"""Offline step: add fixed-taxonomy tags to each event in event_artifacts.json.

    uv run python scripts/tag_events.py

Keeps ALL events and their IDs; empty tag sets are allowed (an event where no tag
passes the baseline threshold keeps tags == {}). Writes, per event:
  - tags:             {tag_id: score}  (auto-assigned, baseline)
  - tag_source:       "baseline"
  - taxonomy_version: the loaded taxonomy version

No ML fitting at runtime; the LR model replaces the baseline here once trained.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bu_api.event_tags import KeywordBaseline, Tagger, load_taxonomy  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "data" / "event_artifacts.json"
TAXONOMY = ROOT / "bu_api" / "event_tags" / "taxonomy" / "taxonomy.v1.json"
BASELINE_THRESHOLD = 0.1
MAX_TAGS = 5


def main() -> None:
    bundle = json.loads(ARTIFACT.read_text())
    taxonomy = load_taxonomy(TAXONOMY)
    baseline = KeywordBaseline(taxonomy)
    tagger = Tagger(
        taxonomy,
        thresholds={},
        default_threshold=BASELINE_THRESHOLD,
        max_tags=MAX_TAGS,
        source="baseline",
    )
    tagged = 0
    for event in bundle["events"]:
        scores = baseline.score(event.get("title", ""), event.get("description", ""))
        result = tagger.build(
            event["id"], baseline.version, event.get("title", ""),
            event.get("description", ""), scores,
        )
        event["tags"] = {s.tag_id: s.score for s in result.suggestions}
        event["tag_source"] = "baseline"
        event["taxonomy_version"] = taxonomy.version
        if event["tags"]:
            tagged += 1
    bundle["taxonomy_version"] = taxonomy.version
    bundle["tag_model_version"] = baseline.version
    ARTIFACT.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n")
    total = len(bundle["events"])
    print(f"Tagged {total} events (kept all IDs); {tagged} have >=1 tag, "
          f"{total - tagged} have empty tags (allowed).")


if __name__ == "__main__":
    main()
