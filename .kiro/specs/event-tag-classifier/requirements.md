# Requirements -- Event Tag Classifier
> Status (branch `feature/event-autotags`): this increment layers a fixed-taxonomy
> tag feature on top of origin/main's existing `EventService`. Tags live in the
> existing `event_artifacts.json` (all 247 events kept, empty tags allowed); the
> contract and routes are integrated into the existing event router and File/Blob
> preference store. No second catalog, recommender, or mock-interest list is added,
> and the ranking formula is unchanged. The learned model waits for human labels.
> See `design.md` section 0 for the concrete mapping.

## Overview

An NLP component that suggests tags from a fixed taxonomy for a BU campus event,
given the event's title and description. Suggested tags feed the app's
personalized recommendations. Event organizers can correct the suggested tags
before publishing, and corrections become labeled data. Model quality is measured
on a separate held-out test set.

This is a multi-label text classification problem (one event may carry several
tags, or none). It is trained and evaluated offline and serves the existing
FastAPI backend in `api/` (package `bu_api`) through a prediction interface.
The recommendation component that consumes the tags is kept separate (Req 12).

The seed event corpus is `events.txt`: an iCalendar feed of 247 BU events exported
from CampusGroups.

## Terminology

- **Tag** -- one label from the fixed taxonomy (e.g. `career`, `food`, `sports`).
- **Taxonomy** -- the closed, versioned set of allowed tags.
- **Suggestion** -- a tag the model proposes for an event, with a score.
- **Score** -- the model's raw output in [0, 1]. It is called a "score", not a
  "probability" or "confidence", unless calibration is demonstrated (Req 8).
- **Source type** -- the event's original CampusGroups `event_type` category from
  the iCalendar feed. It is metadata, NOT a human tag label (Req 0.4).
- **Correction** -- an organizer's edit of the suggested tag set (add/remove).
- **prediction_id** -- a stable id linking a stored suggestion set to a later
  organizer correction (Req 4).
- **Split** -- a disjoint partition of labeled data: train, validation, or test.
- **Validation set** -- used to tune thresholds and select the model. Never used
  to report final quality.
- **Test set (held-out)** -- a separate labeled set used only for the final
  quality report. Never seen during training or threshold tuning.
- **Label status** -- per record: `unlabeled`, or `human_reviewed`. A
  `human_reviewed` record with an empty tag set means "reviewed, no suitable tag
  applies" -- distinct from "not yet labeled" (Req 2a).

## Requirement 0 -- Event corpus import (events.txt)

**User story:** As the data-science owner, I want the 247 BU events imported from
`events.txt`, so that real event text is available to label and classify.

### Acceptance criteria

1. The importer SHALL parse the iCalendar feed `events.txt` and extract, per
   `VEVENT`: `UID`, `SUMMARY` (title), `DESCRIPTION`, `DTSTART`/`DTEND` (dates),
   `URL`, `ORGANIZER` (name), and the CampusGroups source type from
   `CATEGORIES;X-CG-CATEGORY=event_type`.
2. The importer SHALL preserve the original `UID` as the stable record id so an
   event maps to the same record across re-imports (Req 5, 9 reproducibility).
3. The importer SHALL decode iCalendar escaping (`\n`, `\,`, `QUOTED-PRINTABLE`
   encoded summaries) and normalize whitespace, without discarding the raw text.
4. The CampusGroups source type SHALL be stored as metadata ONLY and SHALL NOT be
   treated as a human tag label, SHALL NOT be auto-converted into taxonomy tags,
   and SHALL NOT be used as ground truth for training or evaluation. It MAY inform
   labeling as a hint and MAY be a model input feature if documented.
5. IF a `VEVENT` is missing a title AND a description THEN the importer SHALL
   record it with `label_status=unlabeled` and mark it insufficient-text, not drop
   it silently.
6. The import SHALL be idempotent and deterministic: re-running on the same
   `events.txt` SHALL produce the same records and ids.
7. Imported records SHALL carry `provenance.kind=real` and `provenance.source`
   identifying the CampusGroups BU feed, with attribution per `research/` guidance.

## Requirement 1 -- Fixed tag taxonomy

**User story:** As a product owner, I want a fixed, versioned list of clearly
defined tags, so that recommendations stay consistent and the model has a stable
label space.

### Acceptance criteria

1. WHEN the system starts THEN it SHALL load the taxonomy from a single versioned
   source file (tag id, display name, one-sentence definition, 2-3 example
   phrases, a `facet` field, and a version).
2. The taxonomy SHALL contain between 10 and 15 tags at launch.
3. Each tag SHALL have a definition clear enough that two labelers can agree.
   Tags MAY overlap in application across facets (Req 6); within a single facet
   the definitions SHALL be written to minimize ambiguity.
4. WHEN a tag is added, renamed, or removed THEN the taxonomy version SHALL change
   and the change SHALL be recorded.
5. The model SHALL only ever output tag ids that exist in the loaded taxonomy.
6. IF a stored label refers to a tag id absent from the current taxonomy THEN the
   system SHALL flag that record rather than silently drop it.

## Requirement 2 -- Tag suggestion from title and description

**User story:** As an event organizer, I want the system to propose tags from the
event title and description, so that I do not tag every event by hand.

### Acceptance criteria

1. WHEN given a title and description THEN the classifier SHALL return an ordered
   list of suggested tags, each with a score in [0, 1].
2. The system SHALL return between 0 and `max_tags` suggestions (default
   `max_tags` = 5).
3. WHEN no tag's score reaches its per-tag decision threshold THEN the system
   SHALL return zero suggestions and a clear "no confident tag" status; it SHALL
   NOT force a tag it does not support.
4. Tags whose score is below threshold MAY be returned separately as ranked
   optional suggestions, clearly marked as below threshold.
5. IF the description is empty THEN the classifier SHALL still produce suggestions
   from the title alone.
6. IF both title and description are empty or whitespace THEN the system SHALL
   return no suggestions and a clear "insufficient text" status.
7. The classifier SHALL accept English text; non-English or mixed input SHALL be
   accepted without error (quality not guaranteed, out of scope).

## Requirement 2a -- Labeling file and unlabeled vs reviewed-empty

**User story:** As a labeler, I want a prepared labeling file and clear
instructions, so that labels are consistent and "not yet labeled" is never
confused with "reviewed, no tag applies".

### Acceptance criteria

1. The system SHALL produce a labeling file seeded from the imported real events
   with: record id (`UID`), title, decoded description, source type (as a hint
   only), an empty tag field, and a `label_status` field defaulting to
   `unlabeled`.
2. The file format SHALL let a labeler set tags AND explicitly mark a record as
   `human_reviewed`.
3. The system SHALL distinguish three states: `unlabeled`; `human_reviewed` with
   one or more tags; and `human_reviewed` with zero tags meaning "reviewed, no
   suitable tag applies".
4. A `human_reviewed` record with zero tags SHALL be a valid, usable NEGATIVE
   example (true empty label), distinct from `unlabeled` which SHALL be excluded
   from training and evaluation.
5. A written labeling-guideline document SHALL accompany the file (per-tag
   definitions, multi-label facet rules from Req 6, when to mark reviewed-empty,
   how to treat the source type).
6. The TF-IDF + logistic-regression model SHALL NOT be trained until the
   label-analysis readiness check passes (Req 10.6): enough independent groups and
   enough per-tag support, not a fixed record count alone. Before then, only the
   keyword baseline (Req 3) operates.

## Requirement 3 -- Keyword baseline

**User story:** As the data-science owner, I want a simple keyword baseline, so
that I can prove the learned model is actually better than rules and have working
suggestions before labels exist.

### Acceptance criteria

1. The system SHALL include a keyword/rule baseline that maps taxonomy tag
   definitions and example phrases to tags by matching terms in the event text.
2. The baseline SHALL run through the same prediction interface and the same
   evaluation harness as the learned model.
3. The baseline SHALL be the operational suggester until enough human-reviewed
   labels exist to train the learned model (Req 2a.6).
4. The final report SHALL compare the learned model against the baseline on the
   same test set with the same metrics.
5. IF the learned model does not beat the baseline on the primary metric
   (micro-F1, Req 6) THEN the report SHALL state this plainly.

## Requirement 4 -- Organizer correction linked by prediction_id

**User story:** As an event organizer, I want to add or remove suggested tags and
have my change linked to what the model proposed, so that the final tags are
accurate and the correction is usable as labeled data.

### Acceptance criteria

1. WHEN suggestions are produced THEN the system SHALL persist a prediction record
   keyed by a stable `prediction_id` containing: the input text (title +
   description), the model/baseline version, the suggested tags with their scores,
   the taxonomy version, and a timestamp.
2. WHEN suggestions are shown THEN the organizer SHALL be able to accept all, add
   a tag from the taxonomy, or remove any suggested tag.
3. WHEN an organizer saves corrected tags THEN the correction SHALL reference the
   originating `prediction_id` and store the final tag set, each final tag marked
   with `source` (`model`, `baseline`, or `organizer`) and a `score`; an
   organizer-ADDED tag SHALL have `score=null` (it had no model score).
4. The system SHALL only accept final tags that exist in the current taxonomy.
5. A correction record SHALL NOT be silently used as validation or test data; it
   is training/feedback data unless explicitly promoted into a labeled split
   through the documented procedure (and only after human review, Req 2a).
6. The correction interface SHALL be exposed through the prediction API (Req 11)
   so the app and backend can present and submit corrections.

## Requirement 5 -- Data splits without leakage

**User story:** As the data-science owner, I want strictly separated train,
validation, and held-out test data with no duplicate or recurring-series leakage,
so that reported quality reflects unseen events.

### Acceptance criteria

1. Labeled data SHALL be partitioned into three disjoint splits: train,
   validation, and test, each carrying the taxonomy version it was labeled
   against.
2. Decision thresholds and model selection SHALL be tuned ONLY on the validation
   split. The test split SHALL be used only for the final report.
3. No record in the test or validation split SHALL appear in the training split,
   verified by a stable record id (`UID`) check.
4. The split procedure SHALL keep recurring event series together in ONE split.
   Recurrence SHALL be detected by: shared organizer plus near-identical title,
   and near-duplicate description (normalized-text exact-match plus a
   near-duplicate similarity check). Each such group SHALL be assigned to a single
   split as a unit.
5. The split SHALL be deterministic given a fixed seed and a documented procedure,
   and SHALL be reproducible.
6. IF the taxonomy version differs across splits or from the model THEN evaluation
   SHALL fail loudly rather than report misaligned numbers.
7. Only `human_reviewed` records SHALL enter validation and test; `unlabeled`
   records SHALL be excluded (Req 2a.4).

## Requirement 6 -- Multi-label facets and co-assignment rules

**User story:** As a labeler and a consumer, I want a tag to be able to describe
different aspects of an event at once, so that one event can carry a topic tag, a
format tag, and an audience tag together.

### Acceptance criteria

1. Each taxonomy tag SHALL belong to a `facet`: at least `topic` (what it is
   about), `format` (how it runs, e.g. workshop, social, talk), and `other`
   (cross-cutting, e.g. free-food, networking).
2. An event MAY be assigned multiple tags across different facets simultaneously
   (e.g. a `tech` topic + `workshop` format + `free-food` other).
3. The co-assignment rules SHALL state: multiple facets are encouraged; multiple
   topic tags are allowed only when the event genuinely spans topics; mutually
   exclusive tag pairs (if any) SHALL be listed explicitly in the guideline.
4. The model and the metrics SHALL treat all tags in one flat multi-label space;
   facets are a labeling and documentation aid, not a separate model head
   (prototype scope).

## Requirement 7 -- Quality metrics and reporting

**User story:** As the data-science owner, I want standard multi-label metrics on
the held-out test set with a single primary metric, so that I can judge the model
and track regressions.

### Acceptance criteria

1. The PRIMARY metric SHALL be micro-F1 on the test split. Model selection and the
   headline comparison vs the baseline SHALL be stated in terms of micro-F1.
2. The evaluation SHALL also report macro precision/recall/F1, per-tag
   precision/recall/F1 and support count, on the test split.
3. The evaluation SHALL report ranking metrics precision@k and recall@k for k in
   {1, 3, 5}. WHEN the model returns fewer than k suggestions for an event THEN
   precision@k SHALL be computed over only the suggestions actually returned (the
   denominator is min(k, number returned)); an event with zero suggestions
   contributes precision 0 for that event; recall@k uses the gold set size as its
   denominator as usual.
4. The evaluation SHALL report empty-prediction behavior: how often the model
   correctly returns zero tags when the gold label set is empty (a reviewed-empty
   record).
5. WHEN a tag has zero support in a split (train, validation, OR test) THEN: it
   SHALL be excluded from macro averaging for that split and marked "unmeasured"
   in the report rather than scored as 0; a tag with zero TRAIN support SHALL be
   reported as untrainable and the model SHALL never be expected to predict it.
6. The evaluation SHALL write a human-readable report and a machine-readable JSON
   file including model id, baseline id, taxonomy version, split ids, and seed.
7. The evaluation SHALL be runnable with a single documented command and SHALL be
   deterministic given a fixed seed.

## Requirement 8 -- Latency benchmark

**User story:** As an engineer, I want a measured latency target, so that the
serving path is fast enough for the app and the claim is validated, not assumed.

### Acceptance criteria

1. The target SHALL be: single-event prediction under 300 ms on CPU at p95 on the
   documented target hardware (including the Vercel serverless cold path note in
   the design).
2. A benchmark SHALL measure p50/p95/p99 single-event latency and batch
   throughput on CPU and record the hardware and input distribution used.
3. The benchmark SHALL be a validated result in the report, not an assumption; IF
   the target is not met THEN the report SHALL state the measured number and the
   gap.

## Requirement 9 -- Score meaning and optional calibration

**User story:** As a consumer of the scores, I want to know what a score means, so
that the recommendation component uses it correctly.

### Acceptance criteria

1. Model outputs SHALL be labeled "score" in all code, APIs, and reports unless a
   calibration analysis is run and included.
2. IF calibration is demonstrated (e.g. a reliability curve and a calibration
   error metric on validation data) THEN, and only then, MAY the output be
   described as a calibrated probability, with the evidence included.
3. Thresholds SHALL be defined on scores and SHALL NOT assume the scores are
   calibrated probabilities.

## Requirement 10 -- Data collection and human-labeling plan

**User story:** As the data-science owner, I want a concrete plan to collect and
label events, cleanly separating synthetic bootstrap from real events, so that the
dataset is honest and the gold measurement is trustworthy.

### Acceptance criteria

1. The plan SHALL use `events.txt` (247 real CampusGroups BU events) as the
   primary real source, imported per Req 0, with attribution.
2. Every record SHALL carry a `provenance` field: `kind` in {`synthetic`, `real`}
   plus `source`.
3. Synthetic bootstrap examples SHALL be generated and stored distinctly from real
   events and SHALL be identifiable by `provenance.kind=synthetic`.
4. The validation and test splits SHALL be drawn from REAL, `human_reviewed`
   events only; synthetic examples MAY be used in training but SHALL NOT appear in
   validation or test.
5. The labeling plan SHALL define: the labeling guideline document; a two-labeler
   setup with a shared independent double-labeled subset for inter-annotator
   agreement, its agreement metric and acceptance threshold, and an adjudication
   step for disagreements. IF only one labeler is available THEN the plan SHALL
   record this limitation plainly and SHALL NOT report any invented IAA number.
6. The readiness to train the learned model SHALL be determined AFTER analyzing
   the human labels, not from a fixed record count alone. The readiness check SHALL
   consider: the number of independent (non-near-duplicate, non-recurring) groups,
   and the per-tag support (each trainable tag needs enough positive examples
   across train AND validation). The chosen threshold and the observed per-tag
   support SHALL be recorded in the report.
6. Labeled records SHALL use the `UID` stable record id so splits and leakage
   checks are reproducible.
7. Public example data (e.g. NSSE samples) SHALL NOT be presented as a verified BU
   student population.

## Requirement 11 -- FastAPI integration (bu_api)

**User story:** As a backend engineer, I want the classifier and corrections
wired into the existing FastAPI app, so that the app and the deployment keep
working with current auth and the Vercel setup.

### Acceptance criteria

1. New routes SHALL live in the existing `bu_api` app and reuse the existing
   bearer-password authentication (`Authorization: Bearer <API_PASSWORD>`) and the
   existing `Schema` (extra-forbidden Pydantic) response style.
2. The routes SHALL be:
   - `POST /events/tags/suggest` -> returns the tag-suggestion contract and
     persists a prediction record keyed by `prediction_id`.
   - `POST /events/tags/correct` -> accepts `{prediction_id, final_tag_ids[]}`,
     validates tags against the taxonomy, stores the correction.
3. The model and taxonomy SHALL be loaded once at startup (in the existing
   lifespan) from files bundled with the function, NOT fetched at request time;
   model artifacts SHALL be included via `vercel.json` `includeFiles` like the
   existing `data/**` bundle.
4. Suggestion SHALL work with NO LLM key configured (it is a local model, not the
   Gemini chat agent); it SHALL NOT depend on the chat/history subsystem.
5. Prediction and correction storage on Vercel SHALL NOT use the local filesystem
   (read-only); it SHALL use the same Blob-backed persistence pattern as chat
   history (conditional writes), or another documented writable store. Locally it
   MAY use a writable directory. The design SHALL state this explicitly.
6. The integration SHALL preserve existing behavior: all current routes and tests
   SHALL continue to pass; new work SHALL add tests in the existing `tests/` suite.
7. The classifier training/evaluation code SHALL remain a SEPARATE component from
   `bu_api`; `bu_api` SHALL import only a thin inference + contract layer, not the
   training pipeline (Req 12).

## Requirement 12 -- Separate classifier + simple interest-based recommendations

**User story:** As a student, I want event recommendations from interests I
explicitly chose, so that I see relevant events; and as an owner, I want the
classifier and the recommender kept as separate components.

### Acceptance criteria

1. The tag classifier SHALL remain a standalone component with its own training,
   evaluation, and inference code, independent of the recommender.
2. A SEPARATE, simple recommendation step SHALL rank events for a student using
   ONLY the student's explicitly selected interests, PASSED IN AS AN ARGUMENT (a
   set of taxonomy tag ids), matched against event tags; it SHALL be rule-based
   for the prototype (e.g. overlap/weighted-overlap scoring), not a learned ranker,
   and SHALL NOT read interests from any store itself.
3. This recommender SHALL back the existing `GET /events/recommended` route,
   replacing its current empty `[]` with interest-matched events (returning the
   existing `RecommendedEvent` shape, extended only if documented).
4. Interests SHALL be taken only from an explicit student selection. The system
   SHALL NOT infer interests from sensitive data (grades, attendance, meal plan,
   demographics, protected attributes).
5. IF a student has selected no interests THEN `/events/recommended` SHALL return
   an empty list (no guessing), not inferred recommendations.
6. For the first demo, interests SHALL come from explicitly-marked MOCK interests
   on the student record (consistent with the app's `is_mock` convention). Any
   mock or demo interests SHALL NOT be presented as real student preferences.
7. The recommender SHALL consume ONLY the documented tag output contract (tag ids
   + the versioned shape), not classifier internals (Req 13).

## Requirement 13 -- Tag output contract

**User story:** As the owner of the recommendation component, I want a documented,
stable contract for tag output, so that I can consume it without coupling to the
model internals.

### Acceptance criteria

1. The tag output contract SHALL be documented and versioned: for each event, a
   list of `{tag_id, score, source}` where `source` is `model`, `baseline`, or
   `organizer` and `score` MAY be null for an organizer-added tag, plus the
   taxonomy version and whether the set was organizer-corrected.
2. The contract SHALL define the empty-suggestion case explicitly (zero tags is a
   valid, meaningful output).
3. The contract SHALL be stable across model retrains: consumers depend on tag ids
   and the field shape, not on model internals.

## Requirement 14 -- Reproducibility, attribution, and language

**User story:** As a reviewer, I want the work reproducible and properly
attributed, so that it meets the hackathon's data and licensing rules.

### Acceptance criteria

1. Any external dataset or model used SHALL be attributed and SHALL observe its
   original license (per `research/` guidance).
2. Training, threshold tuning, and evaluation SHALL be driven by a config file
   capturing seed, data paths, taxonomy version, split ids, and hyperparameters.
3. All code, comments, identifiers, docs, and committed artifacts SHALL be in
   English only.

## Out of scope (prototype)

- A learned recommendation ranker (the prototype recommender is rule-based over
  explicit interests; contract in Req 13).
- Organizer UI styling and mobile app surfaces (only the API contract).
- Real-time / automated retraining; retraining is an offline, manual step.
- Non-English quality guarantees.
- A per-facet model head (facets are a labeling aid only, Req 6.4).
