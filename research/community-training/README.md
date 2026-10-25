# Trained community models — synthetic prototype

Two models were actually fitted and exported; inference runs offline in the API.
The datasets contain no actual students, messages, sales, successful study
sessions or confirmed fraud labels. These results demonstrate the training and
serving pipeline, not real-world usefulness or scam-detection accuracy.

## Reproduce

From `api/`, with the repository's locked dev dependencies:

```sh
uv sync --frozen
uv run python scripts/build_community_data.py
uv run python scripts/train_community_models.py
uv run pytest tests/test_community.py tests/test_community_ml.py -q
```

Generation uses seed `20261024`. Training uses only the train split; C and the
moderation threshold use dev; test/boundary data are evaluation-only. Dataset
SHA-256 hashes, versions, hyperparameters, export parity, local inference timing,
metrics and limitations are in `evaluation.json`. Timing depends on the machine;
it is not an API p95/load test. Re-running training may change floating-point
roundoff between platforms/library versions. Dependencies are pinned in `uv.lock`.

`moderation_scenarios.json` retains all 60 authored scenario seeds. All six neutral
suffix variants of a seed remain in one split: 36 train, 12 dev, 12 test scenarios
(216/72/72 texts). Shared neutral suffixes do appear across groups. The texts are
correlated within a scenario; 72 test variants are not 72 independent scenarios.
The report also evaluates the 12 independent held-out scenario mean scores.
`boundary.jsonl` contains 16 separately authored texts, including negation and
benign discussions of phishing/crypto. No boundary texts enter training or tuning.

## Study ranking

A pairwise logistic regression learns preferences between candidates belonging to
the same synthetic query. It uses eight interpretable features: normalized shared
availability, goal similarity, format/mode agreement, interest similarity, shared
course count, and availability interactions. Labels are generated from the
explicit utility rubric and Gaussian noise in `build_community_data.py`; they are
**not** accepted invitations or reported real study outcomes.

The 2,240 candidate rows form 280 groups of eight (180/40/60 train/dev/test
queries). Synthetic student IDs are disjoint across splits, and dev/test dates
follow training dates. Chronology and isolation are asserted before fitting.
Hard course, availability, discovery, verification and block filters remain in
server logic and cannot be overridden by model scores.

On 60 held-out synthetic queries:

| Metric | Learned ranker | Rule baseline |
| --- | ---: | ---: |
| NDCG@5 | 0.995893 | 0.995004 |
| Pairwise agreement, relevance gap ≥ .05 | 0.987586 | 0.978621 |

The synthetic teacher resembles the rules, so both score highly and the measured
gain is very small. This is not evidence that learned ranking improves real
matches. Missing optional preferences currently map to zero model features;
the rule baseline correctly renormalizes missing components and remains the
default. Use `GET /study/matches?ranking=model` explicitly to inspect experimental
rankings, model versions, original rule scores and feature contributions.
The displayed model score is an affinity ordering, not a success probability.

## Marketplace moderation

A binary logistic regression head is fitted on frozen local Model2Vec embeddings.
The encoder is the already bundled `minishlab/potion-base-8M`, revision
`bf8b056651a2c21b8d2565580b8569da283cab23`; this work trains the head, not the encoder.
Upstream attribution stays in `api/data/request_router/encoder/README.md`.
No model download, LLM call, pickle load or training occurs in API requests.

The target is an authored synthetic `needs_review` label. C is selected by dev
average precision. The review threshold is selected on dev for precision ≥ .90,
FPR ≤ .10 and at least six flagged cases, otherwise it abstains. The selected
threshold is .55. These dev constraints do not guarantee held-out performance.

| Held-out set | Precision | Recall | F1 | False-positive rate |
| --- | ---: | ---: | ---: | ---: |
| 72 test text variants | 0.857143 | 0.833333 | 0.845070 | 0.138889 |
| 16 boundary texts | 0.600000 | 1.000000 | 0.750000 | 0.400000 |

Boundary false positives are material: warnings that mention credential theft or
crypto can be flagged even when the listing is legitimate. No test/boundary data
were added to training after observing these results. A keyword baseline and a
train-only TF-IDF/logistic baseline are included in the report for comparison.
Raw held-out decisions are in `moderation_predictions.json`.

`POST /marketplace/analyze` accepts a title/description and returns an explicitly
synthetic `review_score`, advisory decision, version and reason. A low score is
never described as safe. `COMMUNITY_ML_REVIEW_ENABLED=false` by default avoids
adding this experimental head's false positives to the normal moderation queue.
When enabled, create/edit attaches a private seller assessment and optional
`system:model` report. The listing remains active; only an authorized moderator
can remove it or suspend an account. Assessments are hidden from buyers.

## Artifacts and next data

`api/data/community_models/study_ranker.json` and `moderation.json` contain the
actual trained coefficients, schema/version, data hashes and provenance. Export
inference is numerically checked against the fitted classifiers; model absence
keeps ordinary API features available and returns 503 only for requested ML APIs.
The existing encoder is reused at startup to avoid a second copy in memory.

A production ranker needs consented match feedback and reported study outcomes,
with temporal and student-isolated evaluation. Production abuse detection needs
independently reviewed positive/negative cases, false-positive audits and tested
moderation policy. The NSSE example files in this repository have no compatible
pair-outcome or marketplace-abuse labels and were not used for training.
