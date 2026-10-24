# Design -- Event Tag Classifier

## 0. Current architecture (branch `feature/event-autotags`, on top of origin/main)

origin/main already ships a full event-discovery system (`EventService`, TF-IDF +
clusters in `event_artifacts.json`, `/events*`, `/preferences`, File/Blob
preference store). This increment adds a FIXED-TAXONOMY tag layer ON TOP of it,
minimally, WITHOUT a second catalog, a second recommender, a mock-interest list, or
any change to the ranking formula.

Concrete design as built:
- Inference lives in `api/bu_api/event_tags/` (taxonomy loader, preprocessing,
  keyword baseline, tagger+contract). Only those four pieces were brought over.
- Tags are written INTO the existing `event_artifacts.json` by an offline step
  (`scripts/tag_events.py`, also folded into `scripts/build_events.py`). All 247
  events and their IDs are kept; an event with no passing tag keeps `tags == {}`.
  Each event gains `tags {tag_id: score}`, `tag_source: "baseline"`,
  `taxonomy_version`.
- `EventCard` gains `tags`, `tag_source` (`baseline`/`model`/`organizer`), and
  `taxonomy_version`.
- Routes on the existing event router: `GET /events/{id}/tags/suggest` (returns the
  tag contract) and `PUT /events/{id}/tags` (organizer correction). Corrections are
  stored in the EXISTING preference state (`tag_corrections` on `PreferenceState`),
  reusing the File/Blob stores.
- An organizer correction OVERRIDES the auto tags on the card, and an EMPTY
  corrected set is a real override ("reviewed, no tag applies"), with
  `tag_source: "organizer"` and null scores (organizer tags carry no model score).
- Human-labeling files + guideline: `scripts/build_labeling.py` -> `api/labeling/`
  (two labelers + shared IAA subset), kept out of the deploy bundle.
- The learned LR model is NOT trained yet (waits for human labels). No quality
  metrics are fabricated.

Sections below describe the fuller target design; where they mention a separate
`model/` recommender or `event_catalog.json`, this branch deliberately does NOT add
those -- the origin `EventService` and `event_artifacts.json` are reused instead.

## 1. Purpose and scope

Suggest 0..N tags from a fixed taxonomy for a BU event, from its title and
description. Organizers correct the tags (linked by `prediction_id`); corrections
become labeled data. Quality is reported on a held-out test set; micro-F1 is the
primary metric. A keyword baseline is the floor and the stopgap before labels
exist. The classifier is a standalone component; a separate, simple rule-based
recommender over explicit student interests backs `GET /events/recommended`.

Seed corpus: `events.txt`, an iCalendar feed of 247 CampusGroups BU events.
Backend: the existing FastAPI app in `api/` (package `bu_api`), deployed on Vercel
from the `api/` root.

Implements `requirements.md`. No implementation is started yet.

## 2. Component map

```
dsx-hackathon/
  events.txt                         iCalendar, 247 BU events (seed corpus)
  api/                               Vercel Root Directory; deployable backend
    bu_api/
      event_tags/                    SINGLE SOURCE OF TRUTH for inference (Req 11.7)
        taxonomy.py                  taxonomy loader
        preprocessing.py             normalize_text + feature-text
        baseline.py                  keyword baseline
        contract.py                  Scorer, Tagger, TagSuggestionResult, ScoredTag
        recommend.py                 rule-based interest recommender
        taxonomy/taxonomy.v1.json    the fixed tag set (bundled)
        event_catalog.json           deploy-safe pre-tagged catalog (bundled)
        artifacts/                   trained model artifact lands here (bundled)
      tags.py                        suggest/correct + prediction/correction store
      main.py                        routes + lifespan loading
      schemas.py                     contract response models
    pyproject.toml                   hatchling package "bu-student-api"
    vercel.json                      bundles taxonomy + catalog + artifacts only
  model/                             TRAINING/LABELING/EVAL only (Req 12.1)
    data/        record schema, ical_import, synthetic generator, labeling file
    split/       splitter + leakage + recurring-series grouping
    train/       trainer + threshold tuner
    eval/        metrics (micro-F1 primary), report, latency benchmark
    cli.py       import / labeling-files / stats / build-catalog
    docs/        tag-output-contract.md, labeling-guideline.md
    pyproject.toml  depends on bu-student-api (editable) for shared inference
    config.yaml
```

`model/` depends on the backend package and imports `bu_api.event_tags`; there is
no duplicated inference and no `sys.path` hack (Req 11.7).

## 3. Event import from events.txt (Req 0)

`model/data/ical_import.py` parses the VCALENDAR and, per `VEVENT`, extracts:

| iCal field | Record field | Notes |
| --- | --- | --- |
| `UID` | `record_id` | stable id, survives re-import (Req 0.2) |
| `SUMMARY` (may be `ENCODING=QUOTED-PRINTABLE`) | `title` | decode QP + iCal escaping |
| `DESCRIPTION` | `description` | unescape `\n`, `\,`; strip trailing "Event Details:" footer; keep raw too |
| `DTSTART` / `DTEND` | `starts_at` / `ends_at` | parse to tz-aware datetime |
| `URL` | `url` | |
| `ORGANIZER;CN="..."` | `organizer` | display name; used for recurrence grouping (Req 5.4) |
| `CATEGORIES;X-CG-CATEGORY=event_type` | `source_type` | **metadata only, NOT a tag** (Req 0.4) |

Rules: idempotent and deterministic (Req 0.6); `provenance={kind:"real",
source:"CampusGroups BU feed (events.txt)"}` (Req 0.7); an event with neither
title nor description is kept as `unlabeled` + insufficient-text, never dropped
(Req 0.5). `source_type` is stored and MAY be used as a documented model feature,
but is never ground truth and never auto-mapped to tags.

## 4. Taxonomy with facets (Req 1, 6)

`model/taxonomy/taxonomy.v1.json`:

```json
{
  "version": "1",
  "tags": [
    { "id": "tech", "facet": "topic", "name": "Technology & Computing",
      "definition": "Software, data, AI, engineering, or IT topics.",
      "examples": ["hackathon", "coding workshop", "AI talk"] }
  ]
}
```

Facets (Req 6.1): `topic`, `format`, `other`. Starter set (10-15):

- topic: `academic`, `career`, `arts-culture`, `sports-recreation`, `tech`,
  `wellness-health`, `community-service`, `cultural-identity`
- format: `workshop`, `social`, `talk-panel`, `performance`
- other: `free-food`, `networking`

Final list is fixed in the taxonomy task; mutually exclusive pairs (if any) are
listed in the guideline. Loader validates unique ids, exposes `version`, asserts
model outputs are in-taxonomy (Req 1.5), flags stored labels with unknown ids
(Req 1.6).

## 5. Record schema, label status (Req 2a, 10)

```json
{
  "record_id": "<UID>",
  "title": "...", "description": "...", "raw_description": "...",
  "starts_at": "...", "ends_at": "...", "url": "...", "organizer": "...",
  "source_type": "Luncheon",
  "provenance": { "kind": "real|synthetic", "source": "..." },
  "label_status": "unlabeled | human_reviewed",
  "tag_ids": [],
  "normalized_text": "..."
}
```

Three states (Req 2a.3): `unlabeled`; `human_reviewed` + tags; `human_reviewed` +
empty `tag_ids` = reviewed-empty (a real negative, Req 2a.4). `unlabeled` is
excluded from train/val/test; reviewed-empty is a usable example.

## 6. Labeling file and guideline (Req 2a)

`model/data/labeling.py` emits a labeling file (CSV or JSONL) seeded from the
imported REAL events: `record_id`, `title`, decoded `description`, `source_type`
(hint only), empty `tags`, `label_status=unlabeled`. Labelers set tags and flip
`label_status` to `human_reviewed`; leaving tags empty while reviewed records a
reviewed-empty negative. `docs/labeling-guideline.md` holds per-tag definitions,
the facet co-assignment rules (Req 6.3), when to mark reviewed-empty, and "treat
`source_type` as a hint, never as the answer".

## 7. Models (Req 2, 3, 8)

### 7.1 Keyword baseline (Req 3) -- operational first

Term->tag map from each tag's `definition` + `examples` + a small curated synonym
list; score = normalized matched-term count in [0,1]. Runs through the shared
`Classifier` interface and evaluation harness. It is the live suggester until
enough `human_reviewed` labels exist (Req 2a.6, 3.3).

### 7.2 Learned classifier -- trained only after labels (Req 2a.6)

TF-IDF (word 1-2gram + char 3-5gram) + one-vs-rest logistic regression. Outputs
are raw decision scores squashed to [0,1] -- **scores, not probabilities**
(Req 9). Small and CPU-fast, which serves the latency target (Req 8) and the
Vercel cold-start budget. Training is gated: the trainer refuses to run until the
`human_reviewed` count meets the configured minimum.

### 7.3 Tagger

Apply per-tag thresholds (tuned on validation, Section 9), rank passing tags by
score, cap at `max_tags` (default 5), return 0 if none pass (Req 2.3). Optional
below-threshold list marked "optional" (Req 2.4). Empty input -> insufficient-text
status (Req 2.6). Flat multi-label space; facets are not a model head (Req 6.4).

## 8. Prediction/correction linkage by prediction_id (Req 4, 13)

`suggest` produces a `TagSuggestionResult` AND persists a prediction record:

```json
// prediction record (stored, keyed by prediction_id)
{ "prediction_id": "uuid", "created_at": "...",
  "input": { "title": "...", "description": "..." },
  "model_version": "baseline-v1 | tfidf-lr-v1",
  "taxonomy_version": "1",
  "suggestions": [ { "tag_id": "tech", "score": 0.82 } ] }
```

```json
// TagSuggestionResult (contract returned to clients, Req 13)
{ "prediction_id": "uuid", "taxonomy_version": "1",
  "status": "ok | no_confident_tag | insufficient_text",
  "model_version": "tfidf-lr-v1", "organizer_corrected": false,
  "suggestions": [ { "tag_id": "tech", "score": 0.82, "source": "model" } ],
  "optional":    [ { "tag_id": "networking", "score": 0.31, "source": "model" } ] }
```

```json
// correction record (stored), references the prediction_id
{ "prediction_id": "uuid", "corrected_at": "...", "taxonomy_version": "1",
  "final_tags": [
    { "tag_id": "tech",       "score": 0.82, "source": "model" },
    { "tag_id": "free-food",  "score": null, "source": "organizer" }   // added -> null
  ] }
```

`source` in {`model`,`baseline`,`organizer`}; an organizer-ADDED tag has
`score=null` (Req 4.3). `suggestions` may be empty (Req 13.2). Documented in
`docs/tag-output-contract.md`, versioned with the taxonomy.

## 9. Splits, leakage, recurring series (Req 5)

`model/split/splitter.py`:

1. Compute `normalized_text`.
2. **Recurring-series grouping (Req 5.4):** group records by (same `organizer` +
   near-identical normalized title + near-duplicate description). Exact-duplicate
   normalized text is one group; near-duplicate via MinHash/Jaccard or TF-IDF
   cosine over char-shingles. Weekly series collapse into one group.
3. Assign whole groups to train/val/test deterministically by `seed`.
4. Validation/test are REAL + `human_reviewed` only; `unlabeled` excluded;
   synthetic -> train only (Req 5.7, 10.4).
5. Write `split_manifest.json` (record ids per split + taxonomy version).
6. Leakage assertion: empty id intersection across splits; no group spans splits;
   taxonomy-version mismatch fails loudly (Req 5.3, 5.6).

## 10. Threshold tuning (Req 5.2, 9.3)

Per-tag threshold on the VALIDATION split maximizing per-tag F1 (support floor);
thresholds are on scores, no calibration assumption; frozen into the artifact
before any test-split use.

## 11. Evaluation, micro-F1 primary (Req 7, 8)

- Primary: **micro-F1** on the test split; headline baseline-vs-model comparison
  is in micro-F1 (Req 7.1, 3.5). Also macro P/R/F1 and per-tag P/R/F1 + support.
- Ranking: precision@k / recall@k for k in {1,3,5}. **When fewer than k
  suggestions:** precision@k denominator is `min(k, n_returned)`; zero-suggestion
  event contributes precision 0; recall@k denominator is the gold-set size
  (Req 7.3).
- Empty-prediction accuracy over reviewed-empty records (Req 7.4).
- **Zero-support tags (Req 7.5):** a tag with no support in a split is dropped from
  that split's macro average and marked "unmeasured"; a tag with zero TRAIN
  support is reported untrainable.
- Outputs `report.md` + `report.json` with model/baseline ids, taxonomy version,
  split ids, seed (Req 7.6); single deterministic command (Req 7.7).
- Latency benchmark: p50/p95/p99 single-event + batch throughput on CPU, hardware
  + input distribution recorded, measured p95 vs 300 ms with the gap (Req 8).

## 12. FastAPI integration into bu_api (Req 11)

Observed from the existing app: bearer-password auth via `HTTPBearer` +
`secrets.compare_digest`; a `user` query param selecting one of five mock
students; `Schema` = `BaseModel` with `extra="forbid"`; startup wiring in the
`lifespan` context on `app.state`; Vercel bundles `data/**` via `vercel.json`
`includeFiles`; on Vercel the filesystem is read-only and history uses private
Blob with conditional (ETag) writes; chat requires an LLM key but data routes do
not.

### 12.1 New module `api/bu_api/tags.py`

- Loads the taxonomy and the (optional) trained model artifact from bundled files
  ONCE at startup, stored on `app.state` in the existing `lifespan` (Req 11.3).
  If no trained artifact is present, it serves the keyword baseline (Req 3.3).
- Depends only on the thin `model/classifier` + `model/taxonomy` inference layer,
  not the trainer (Req 11.7). The relevant `model/` inference modules are bundled
  into the function (added to `includeFiles`).
- New Pydantic `Schema` response models mirror Section 8, added to `schemas.py`.

### 12.2 Routes (Req 11.2), reusing `authenticate`

```
POST /events/tags/suggest   body {title, description}
     -> TagSuggestionResult ; persists a prediction record (prediction_id)
POST /events/tags/correct   body {prediction_id, final_tag_ids[]}
     -> stored correction ; 404 if prediction_id unknown, 422 if a tag is
        not in the taxonomy
GET  /events/recommended    (existing) -> now interest-matched (Section 13)
```

All require the existing bearer auth. Suggestion needs NO LLM key and does not
touch the chat/history subsystem (Req 11.4).

### 12.3 Prediction/correction storage (Req 11.5)

Follow the existing history pattern: an abstract store with two backends.
- Local: a writable JSON directory (like `runtime/messages/`), one file per
  prediction or an append log.
- Vercel: private Blob with conditional writes (reuse the `BlobHistoryStore`
  pattern) since the function filesystem is read-only.
Selected by the same `HISTORY_BACKEND`-style setting; documented in the design and
`.env.example`. The design explicitly forbids writing to the local filesystem on
Vercel.

### 12.4 Deployment compatibility (Req 11.6)

- `vercel.json` `includeFiles` extended to bundle the model artifact + taxonomy +
  the thin inference modules alongside `data/**`.
- Keep the model small (linear + TF-IDF vocab) to fit the serverless bundle and
  the 120 s `maxDuration`; the latency benchmark (Section 11) validates the cold
  and warm paths.
- All existing routes and tests keep passing; new tests join `api/tests/`
  (password/user validation on the new routes, taxonomy validation on correct,
  prediction_id round-trip, baseline-without-artifact path, `/events/recommended`
  interest matching).

### 12.5 Implementation status (second increment)

Architecture finalized: Vercel Root Directory stays `api/`. The inference code is
the single source of truth at `api/bu_api/event_tags/` (taxonomy loader,
preprocessing, baseline, contract+tagger, rule-based recommender, taxonomy.v1.json).
`model/` (import, labeling, split, train, eval) depends on the backend package
`bu-student-api` as an editable install and imports `bu_api.event_tags` -- no
`sys.path` hacks, no duplicated inference. The backend package ships
`bu_api` as a hatchling wheel with the taxonomy, catalog, and artifacts as package
data; `model/pyproject.toml` pins it via `[tool.uv.sources]`.

Storage: `FilePredictionStore` (local, off-Vercel) and `BlobPredictionStore`
(private Vercel Blob, same conditional-write pattern as `BlobHistoryStore`).
`build_prediction_store` refuses the local file store when `VERCEL` is set, and a
Blob read/write that cannot be confirmed raises `StorageUnavailable`, surfaced as a
`503` -- a record is never silently dropped.

Deploy bundle (`vercel.json` includeFiles): `data/**`, the taxonomy, the pre-tagged
`event_catalog.json`, and `artifacts/**` (the trained model, once it exists). It
does NOT include training data (`model/datasets/`), labeling tools, or the trainer.
The catalog is a deploy-safe artifact built offline by `model build-catalog`
(id, title, starts_at, tags only -- no descriptions, no labels).

Tests: 147 backend + 7 model, all green, including storage-backend round-trips, the
Vercel-refuses-file-backend guard, and Blob-failure-surfaces-not-silent.

Still OPEN: the LR trainer/threshold-tuning/eval/latency benchmark wait for human
labels (Req 2a.6 / 10.6). The model artifact loads into `TagClassifier` once built.

## 13. Separate interest recommender (Req 12)

`model/recommend/interests.py`, a standalone rule-based ranker:

- Input: a student's EXPLICITLY selected interests (a set of taxonomy tag ids) and
  the tagged upcoming events.
- Score: overlap / weighted overlap between interests and each event's tags
  (optionally weighting by tag score from the contract). Rank, return top N as the
  existing `RecommendedEvent` shape (extended only if documented).
- Backs `GET /events/recommended`, replacing the current `[]` (Req 12.3).
- Interests come ONLY from explicit selection; NEVER inferred from grades,
  attendance, meal plan, or demographics (Req 12.4). No interests selected -> empty
  list (Req 12.5). Mock interests are marked mock, never presented as real
  (Req 12.6). Consumes only the tag contract, not classifier internals (Req 12.7).

Where student interests live (mock vs a new field) is an open question (see the
summary's open questions); the prototype may store a mock `interests: string[]`
on the student record, clearly `is_mock`.

## 14. Config and reproducibility (Req 14)

Single `model/config.yaml`: `seed`, data paths, `taxonomy_version`, split
ratios, near-duplicate/recurrence thresholds, `max_tags`, model hyperparameters,
threshold objective, `min_reviewed_to_train`. Each run records config + git
commit in its report. English-only artifacts.

## 15. Testing strategy

- Import: `events.txt` fixture -> stable ids; QP/escaping decoded; source_type
  never becomes a tag; title+desc-missing kept as unlabeled; re-import idempotent.
- Taxonomy/tagger: dup id rejected, unknown-tag output rejected, empty on no-pass
  and on empty text, facets present, contract round-trip, organizer-added tag
  `score=null`.
- Split: planted exact + near-dupes + a recurring series stay in one split;
  val/test real + reviewed only; determinism (same seed => same manifest).
- Label status: unlabeled excluded; reviewed-empty counted as negative.
- Eval: micro-F1 correctness on a tiny fixture; precision@k with < k suggestions;
  zero-support tag marked unmeasured; determinism.
- Latency: benchmark emits p50/p95/p99.
- API: bearer/user guards on new routes; taxonomy validation on correct;
  prediction_id round-trip; baseline path with no artifact; existing tests green;
  `/events/recommended` interest matching incl. the no-interests empty case.

## 16. Risks and sequencing

- **No labels yet.** Baseline serves first; learned model is gated on
  `min_reviewed_to_train`. Honest: val/test are real + reviewed only.
- **Serverless bundle size / cold start.** Keep the model linear and small; the
  benchmark gate catches regressions; the chat path is untouched.
- **source_type looks like a label.** Explicitly forbidden as ground truth; used
  only as a labeling hint / optional documented feature.
- **Interest inference creep.** Hard rule: explicit selection only, no sensitive
  signals, empty when unset.
