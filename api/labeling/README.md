# Event tag labeling

Taxonomy: `api/bu_api/event_tags/taxonomy/taxonomy.v1.json` (14 tags, facets
topic / format / other). Read every tag's definition before labeling.

## Files
- `labeler_A.jsonl` / `labeler_B.jsonl`: each labeler's assigned events.
- `iaa_shared.jsonl`: 37 events BOTH labelers label INDEPENDENTLY, for
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
