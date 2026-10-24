# Tasks -- Event Tag Classifier

Implementation plan. Each task is a discrete coding step; do them in order.
Do NOT start until the spec is approved.

Legend: `model/` is the standalone classifier component; `api/` is the existing
`bu_api` FastAPI app. Requirement ids refer to `requirements.md`.

> Progress (first increment, not pushed/deployed): import, taxonomy, baseline,
> labeling files, API suggest/correct, file store, and the mock-interest
> recommender are DONE with 148 passing tests. Checked boxes below reflect this.
> The LR trainer, threshold tuning, evaluation, latency benchmark, synthetic
> generator, the written labeling-guideline doc, and the Vercel deploy items stay
> OPEN — the learned model waits for human labels (Req 2a.6 / 10.6).

- [x] 1. Scaffold and config
  - Create the `model/` layout and `model/config.yaml` (seed, data paths,
    taxonomy_version, split ratios, near-duplicate/recurrence thresholds,
    max_tags, hyperparameters, threshold objective, `min_reviewed_to_train`).
    English-only.
  - _Requirements: 14.2, 14.3_

- [ ] 2. Import events.txt (iCalendar)
  - [x] 2.1 Parser extracting per VEVENT: UID, SUMMARY (decode QUOTED-PRINTABLE
        + iCal escaping), DESCRIPTION (unescape, strip the "Event Details" footer,
        keep raw), DTSTART/DTEND, URL, ORGANIZER name, and
        `CATEGORIES;X-CG-CATEGORY=event_type` as `source_type`.
    - _Requirements: 0.1, 0.3_
  - [x] 2.2 Write records with `record_id=UID`, `provenance.kind=real`, source
        attribution; idempotent/deterministic re-import; title+desc-missing kept
        as `unlabeled` + insufficient-text, never dropped; `source_type` stored as
        metadata only (never a tag, never ground truth).
    - _Requirements: 0.2, 0.4, 0.5, 0.6, 0.7_
  - [x] 2.3 Tests on an `events.txt` fixture: stable ids, decoding, source_type
        never becomes a tag, idempotent re-import.
    - _Requirements: 0.2, 0.4, 0.6_

- [ ] 3. Taxonomy with facets
  - [x] 3.1 Write `taxonomy.v1.json` with 10-15 tags, each id, name, one-sentence
        definition, 2-3 examples, and a `facet` (topic/format/other).
    - _Requirements: 1.1, 1.2, 1.3, 6.1_
  - [x] 3.2 Loader: unique-id validation, expose `version`, assert output ids are
        in-taxonomy, flag stored labels with unknown ids.
    - _Requirements: 1.4, 1.5, 1.6_
  - [x] 3.3 Tests: dup id rejected, unknown-tag output rejected, version surfaced.
    - _Requirements: 1.5, 1.6_

- [ ] 4. Record schema and preprocessing
  - [x] 4.1 Record schema (record_id, title, description, raw_description, dates,
        url, organizer, source_type, provenance, label_status, tag_ids,
        normalized_text).
    - _Requirements: 2a.1, 5.1, 10.2, 10.6_
  - [x] 4.2 Preprocessor: concat title+description with title weighting,
        lowercase, strip markup, collapse whitespace, Unicode-normalize, emit
        normalized_text; empty-input handling.
    - _Requirements: 2.5, 2.6, 2.7_
  - [x] 4.3 Tests for normalization and empty-text handling.
    - _Requirements: 2.6_

- [ ] 5. Labeling file and guideline
  - [x] 5.1 Emit a labeling file seeded from imported real events (record_id,
        title, decoded description, source_type as hint, empty tags,
        `label_status=unlabeled`); support three states incl. reviewed-empty.
    - _Requirements: 2a.1, 2a.2, 2a.3_
  - [ ] 5.2 `docs/labeling-guideline.md`: per-tag definitions, facet co-assignment
        rules, mutually-exclusive pairs, when to mark reviewed-empty, source_type
        is a hint only, labeler count, double-labeled IAA subset + metric +
        threshold, adjudication, `min_reviewed_to_train`.
    - _Requirements: 2a.5, 6.3, 10.1, 10.5, 10.7_
  - [x] 5.3 Tests: reviewed-empty is a valid negative distinct from unlabeled;
        unlabeled excluded from training/eval downstream.
    - _Requirements: 2a.3, 2a.4_

- [ ] 6. Synthetic bootstrap generator
  - Generate synthetic examples with `provenance.kind=synthetic`, stored distinct
    from real; test provenance preserved and distinguishable.
  - _Requirements: 10.2, 10.3_

- [ ] 7. Classifier interface, tagger, contract
  - [x] 7.1 `Classifier` interface and `TagSuggestionResult` (statuses ok /
        no_confident_tag / insufficient_text; source model/baseline/organizer).
    - _Requirements: 2.1, 2.2, 13.1_
  - [x] 7.2 Tagger: per-tag thresholds, rank by score, cap at max_tags, 0 when
        none pass, optional below-threshold list, insufficient_text on empty;
        flat multi-label space (facets not a head).
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 6.4_
  - [x] 7.3 `docs/tag-output-contract.md` (versioned): `{tag_id, score, source}`,
        score null for organizer-added, empty set valid, stable across retrains.
    - _Requirements: 13.1, 13.2, 13.3, 4.3_
  - [x] 7.4 Tests: empty on no-pass / empty text, contract round-trip, only
        taxonomy ids, organizer-added score=null.
    - _Requirements: 2.3, 2.6, 1.5, 4.3, 13.2_

- [ ] 8. Keyword baseline (operational first)
  - [x] 8.1 Term->tag map from definitions + examples + curated synonyms; [0,1]
        score; through the shared interface + harness.
    - _Requirements: 3.1, 3.2_
  - [x] 8.2 Make the baseline the live suggester until `min_reviewed_to_train` is
        met.
    - _Requirements: 3.3_
  - [x] 8.3 Tests: known phrases map to expected tags; runs via shared harness.
    - _Requirements: 3.2_

- [ ] 9. Splitter with leakage + recurring-series control
  - [ ] 9.1 Group recurring series: same organizer + near-identical title +
        near-duplicate description (exact normalized match + MinHash/Jaccard or
        TF-IDF cosine over char-shingles).
    - _Requirements: 5.4_
  - [ ] 9.2 Assign whole groups deterministically by seed; val/test = real +
        human_reviewed only; synthetic -> train only; unlabeled excluded; write
        `split_manifest.json`.
    - _Requirements: 5.1, 5.5, 5.7, 10.4_
  - [ ] 9.3 Leakage assertions: empty id intersection; no group spans splits;
        taxonomy-version mismatch fails loudly.
    - _Requirements: 5.3, 5.6_
  - [ ] 9.4 Tests: planted dupes + a recurring series stay in one split; val/test
        real+reviewed only; determinism.
    - _Requirements: 5.3, 5.4, 5.5, 5.7_

- [ ] 10. Learned classifier + trainer (gated on labels)
  - [ ] 10.1 TF-IDF (word 1-2gram + char 3-5gram) + one-vs-rest logistic
        regression; outputs squashed to [0,1] scores (not probabilities).
    - _Requirements: 2.1, 9.1_
  - [ ] 10.2 Trainer config-driven on the train split; REFUSE to train until
        `human_reviewed` count >= `min_reviewed_to_train`; persist artifact under
        `model/artifacts/`.
    - _Requirements: 2a.6, 14.2_
  - [ ] 10.3 Tests: trains on a fixture past the threshold, refuses below it,
        reload reproduces scores, outputs only taxonomy ids.
    - _Requirements: 2a.6, 1.5, 9.1_

- [ ] 11. Threshold tuning on validation
  - [ ] 11.1 Per-tag threshold maximizing validation F1 (support floor); on
        scores, no calibration assumption; freeze into the artifact before any
        test use.
    - _Requirements: 5.2, 9.3_
  - [ ] 11.2 Test: tuning touches only validation; test untouched until eval.
    - _Requirements: 5.2_

- [ ] 12. Evaluation harness and report (micro-F1 primary)
  - [ ] 12.1 Metrics: micro-F1 PRIMARY; macro P/R/F1; per-tag P/R/F1 + support;
        precision@k / recall@k for k in {1,3,5} with the <k-suggestions rule
        (precision@k denom = min(k, n_returned), zero-suggestion => precision 0,
        recall@k denom = gold size); empty-prediction accuracy; zero-support tags
        marked unmeasured, zero-train-support reported untrainable.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ] 12.2 Run baseline + learned model on test; write report.md + report.json
        (model/baseline ids, taxonomy version, split ids, seed); state plainly if
        the model does not beat the baseline on micro-F1.
    - _Requirements: 3.4, 3.5, 7.6_
  - [ ] 12.3 Single documented, deterministic command.
    - _Requirements: 7.7_
  - [ ] 12.4 Tests: micro-F1 + precision@k-with-few correctness on a fixture;
        determinism.
    - _Requirements: 7.1, 7.3, 7.7_

- [ ] 13. Latency benchmark
  - [ ] 13.1 Measure single-event p50/p95/p99 + batch throughput on CPU; record
        hardware + input distribution.
    - _Requirements: 8.2_
  - [ ] 13.2 Report measured p95 vs 300 ms target with the gap if missed; note the
        Vercel cold path; validated result, not an assumption.
    - _Requirements: 8.1, 8.3_

- [ ] 14. Optional calibration (only if time allows)
  - Reliability curve + expected calibration error on validation; only then may
    outputs be described as calibrated probabilities, with evidence.
  - _Requirements: 9.2_

- [ ] 15. FastAPI integration into bu_api
  - [x] 15.1 Thin inference layer in `model/classifier` importable by `bu_api`
        without the trainer; add new `Schema` response models to
        `api/bu_api/schemas.py` mirroring the contract.
    - _Requirements: 11.7, 13.1_
  - [x] 15.2 `api/bu_api/tags.py`: load taxonomy + (optional) model artifact once
        in the existing lifespan onto `app.state`; serve baseline when no artifact.
    - _Requirements: 11.3, 11.4, 3.3_
  - [x] 15.3 Routes reusing the existing bearer auth: `POST /events/tags/suggest`
        (returns contract, persists a prediction keyed by prediction_id) and
        `POST /events/tags/correct` ({prediction_id, final_tag_ids[]}; validate
        tags vs taxonomy; store correction, organizer-added score=null).
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 11.1, 11.2_
  - [ ] 15.4 Prediction/correction store: local writable dir + Vercel Blob
        (conditional writes); never the local filesystem on Vercel; corrections
        are feedback/training data, never silently val/test; document in design +
        `.env.example`.
    - _Requirements: 4.5, 11.5_
  - [ ] 15.5 Deployment: extend `vercel.json` `includeFiles` to bundle the model
        artifact + taxonomy + inference modules; keep the bundle small; existing
        routes/tests stay green.
    - _Requirements: 11.3, 11.6_
  - [x] 15.6 Tests in `api/tests/`: bearer/user guards on new routes, taxonomy
        validation on correct, prediction_id round-trip, baseline-without-artifact
        path; existing tests still pass.
    - _Requirements: 11.1, 11.2, 11.6, 4.4_

- [ ] 16. Separate interest-based recommender
  - [x] 16.1 `model/recommend/interests.py`: rank events by overlap between a
        student's EXPLICITLY selected interests (taxonomy tag ids) and event tags;
        rule-based; consume only the tag contract.
    - _Requirements: 12.1, 12.2, 12.7_
  - [x] 16.2 Back `GET /events/recommended` with interest-matched events in the
        `RecommendedEvent` shape; empty list when no interests selected; never
        infer interests from grades/attendance/meal-plan/demographics; mock
        interests marked `is_mock`, never presented as real.
    - _Requirements: 12.3, 12.4, 12.5, 12.6_
  - [x] 16.3 Tests: overlap ranking, no-interests => empty, no sensitive-signal
        inputs, mock flagged.
    - _Requirements: 12.4, 12.5, 12.6_

- [ ] 17. End-to-end reproducibility check
  - One config-driven run: import -> label file -> (label) -> split -> train ->
    tune -> eval -> report -> benchmark; assert determinism and English-only
    artifacts; confirm `bu_api` serves baseline before a model exists and the
    learned model after.
  - _Requirements: 14.1, 14.2, 14.3_
