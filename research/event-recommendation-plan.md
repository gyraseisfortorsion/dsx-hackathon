# Event recommendations: preparation, inference, and integration

Status: original architecture proposal. The backend is now implemented locally;
see [EVENTS_API.md](../api/EVENTS_API.md) for actual behavior and artifact format.
This proposal is retained as design context, not the current endpoint contract.

## Main decision

Fit models and prepare event representations offline. Save a versioned artifact
bundle. Load that bundle once per backend process/cold start. Requests reuse it;
they never fit TF–IDF or K-means again.

Two product experiences share these artifacts:

1. Conversational discovery: request → ranked events → LLM explanation.
2. Browse/discover: stable event clusters and a profile-based list without an LLM.

“Offline” means a separate build script/job, not necessarily a notebook. Notebooks
are useful for exploration and evaluation; reproducible scripts build production
artifacts. A synchronous HTTP response can still use previously fitted models.

## What data we actually have

The downloaded feed is currently at `../../data/bu_events.ics`, outside this repo.
Before implementation, snapshot it into `research/events/raw/` with source URL,
fetch timestamp, and hash. Source:
https://terriercentral.bu.edu/ical/bostonu/ical_bostonu.ics

Inspection found 247 records, 146 distinct titles, and 17 category values. Every
record has a title, description, location, start time, and category. Records span
August 2026–April 2027. Repeated titles may represent legitimate recurring sessions.
This is a modest event dataset, not a dataset of student preferences or behavior.

## What happens when

| Operation | Build time | Request time |
| --- | --- | --- |
| Fetch, parse, clean, and normalize the feed | Yes | No |
| Fit TF–IDF vocabulary and IDF weights | Yes | Never |
| Transform all event descriptions into TF–IDF vectors | Yes | No |
| Encode events with a fixed pretrained semantic encoder, if evaluated | Yes | No |
| Fit K-means and assign events to clusters | Yes | Never |
| Review and name clusters | Yes | No |
| Transform a user query with the saved vectorizer/encoder | No | Yes |
| Filter dates, known eligibility, and explicit availability | No | Yes |
| Calculate similarity, rank, and diversify | Optional for cached lists | Yes for queries |
| Write a natural-language answer with the LLM | No | Chat only |

TF–IDF has learned corpus statistics, even though fitting it needs no labels.
`fit_transform(event_texts)` happens during the build. `transform([query])` happens
on each query, using exactly the saved vocabulary and weights.

K-means is a separate fitted model. Its saved centroids and event assignments
represent groups of events. There is no need to fit one model per user or request.
K-means is optional: include it only if its groups improve browsing or diversity.

## Offline workflow

1. Parse ICS with a calendar parser that handles folded lines, escaped text,
   timezones, and recurrence. Preserve UID, source URL, original text, start/end,
   category, and location. Use stable occurrence IDs; do not deduplicate by title.
2. Strip HTML and generic RSVP boilerplate; normalize whitespace. Keep original
   display text separate from cleaned model text. Handle cancellations/updates and
   report missing fields. Do not infer missing price or eligibility as facts.
3. Explore category imbalance, repeated descriptions, text lengths, and date
   coverage. Keep historical events for analysis; filter them from live results.
4. Establish category and keyword baselines. Fit TF–IDF on cleaned event text and
   save the vectorizer plus event matrix with their matching ordered IDs.
5. Optionally compare semantic embeddings from one fixed pretrained encoder.
   This uses an existing model; it does not fine-tune a new language model.
   Pick the representation using evaluation, not an assumption that it is better.
6. Fit K-means on one selected representation for several candidate K values.
   Evaluate silhouette, cluster sizes, stability, and human-readable examples.
   For sparse TF–IDF, consider dimensionality reduction if justified; save that
   transform too. Do not claim cosine and ordinary K-means optimize the same thing.
7. Review representative titles/top terms and name useful clusters. If clusters
   are incoherent, use existing categories for browse instead of forcing them.
8. Export an immutable bundle and evaluation report. Record dataset hash, package
   versions, random seed, representation configuration, and build timestamp.

Proposed bundle under `api/data/event_artifacts/<version>/`:

```text
events.json                   # normalized records with stable IDs
tfidf_vectorizer.joblib        # fitted vocabulary and IDF
event_vectors.npz             # sparse vectors, aligned to event_ids.json
event_ids.json
kmeans.joblib                 # optional fitted clustering model
clusters.json                 # reviewed labels, assignments, representatives
manifest.json                 # provenance, version, configuration, metrics
```

If embeddings win, replace/extend the vector files and record the exact encoder
and revision. Use only artifacts built by the project; serialized Python model
files must not be loaded from arbitrary uploads.

## Online conversational workflow

Example: “I want to meet people interested in robotics this weekend.”

1. Resolve explicit filters (date interval, availability, category) into validated
   fields. Use the repository's fixed student `as_of` snapshot in this demo; a
   future live mode must choose a different clock explicitly. Never mix the two.
   Natural-language filter extraction can be a later structured LLM call; start
   with explicit filters and semantic text so the MVP needs one final LLM call.
2. Transform the query with the already fitted representation.
3. Exclude past/cancelled events and events failing known explicit constraints.
   Missing eligibility remains unknown. Unknown schedule/price cannot guarantee fit.
4. Compute cosine similarity to saved event vectors and rank eligible results.
   At 247 records an exact matrix comparison is sufficient; no vector database
   is needed. Return fewer results or a clear empty state when nothing fits.
5. Optionally diversify across clusters and suppress repeated sessions of the
   same series. Validate that diversification does not sacrifice too much relevance.
6. Pass selected IDs, titles, descriptions, times, URLs, and supported match
   reasons to the LLM. Similarity scores are not probabilities of student interest.
7. Let the LLM explain the results. Render canonical event cards directly from
   backend records so the model cannot invent dates, URLs, or events. Preserve
   backend ranking in cards and provide a deterministic fallback if the LLM fails.

This pipeline performs inference on every request, not training. Requests can be
handled synchronously from the frontend's perspective. Avoid blocking the async
event loop with CPU-heavy inference; use a worker thread if needed.

## Stable browse and recommendation lists

Cluster events, not students: there are no real student behavior/preference data
and the five existing students are fictional fixtures. Do not claim to have
discovered meaningful student segments from those fixtures.

Provide `GET /events/clusters` for reviewed groups and their upcoming events.
For personalized home lists, collect explicit interests and optional availability.
Represent those interests using the same saved vectorizer/encoder, then rank
events. A major can be an optional weak signal, not a substitute for preferences.
Without preferences, show a clearly identified general upcoming-events list.

A stable list can be computed on demand with the fixed artifacts or cached by
artifact version, user/profile version, filters, and time boundary. It need not
involve an LLM. Refilter expired events when serving cached candidates. Cache
changes and ranking inference are not model retraining.

## Fit to the existing backend

- `api/bu_api/main.py`: load a recommendation service during lifespan startup.
  The current `/events/recommended` returns `[]`; replace it with structured results.
- Add `POST /events/search?user=alex` with a body such as
  `{"query":"robotics and meeting people","limit":5}` and optional validated filters.
  Follow existing bearer authentication and selected-user conventions.
- Both search and home recommendations use the same internal Python service.
  `/chat` should call that service directly, not make an HTTP request to itself.
- `api/bu_api/agent.py`: for an event-discovery chat turn, retrieve ranked events
  before the final LLM answer and include them as reference data. Replace the
  current instruction that recommendations are always empty. Treat event text
  as untrusted data. Keep unrelated chat turns on their existing path.
- `api/bu_api/repository.py`: replace the empty `recommended_events` context with
  real results where appropriate; avoid injecting the entire event catalogue.
- `api/bu_api/schemas.py`: extend the event result with URL, ends_at, category,
  cluster, and explanation fields as needed. Keep existing required fields usable.
- The current Vercel deployment uses `api/` as its root. Bundle selected artifacts
  under that directory and check deployment inclusion. First use TF–IDF locally;
  verify dependency size and cold-start costs before adding an encoder to runtime.

## Evaluation and refresh

Create a small human-written query set with independently rated candidate events.
Include low-overlap wording, vague queries, unavailable dates, and no-match cases.
Keep development queries separate from a final held-out set; group paraphrases
and recurring event series when constructing splits to reduce leakage.

Compare category/keyword baselines, TF–IDF, and optional embeddings using
Precision@5 and NDCG@5. Document how candidates were pooled/judged; unjudged items
are not automatically irrelevant. Measure constraint violations and repeated-series
results. Review clustering coherence and usefulness separately from ranking.
Report limitations honestly: 247 records and few human judgments do not establish
campus-wide impact. No evaluation results exist yet.

Build once for the MVP, then reuse. Rebuild when the event corpus changes enough
to justify a new version; do this outside requests. A saved TF–IDF vectorizer can
transform new events without refitting, but new words outside its vocabulary are
ignored. A full rebuild recomputes vocabulary, event vectors, and clusters together.
Cluster numbers can change between builds. Replace complete bundles atomically;
never mix a new vectorizer with an old event matrix. Keep the last good bundle
when fetching or building fails. For the hackathon, a manual rebuild and redeploy
is enough; no scheduler needs to be created now.

## Implementation order

1. Snapshot and clean the feed; generate a profiling report.
2. Explore baselines and clustering in a notebook; build reproducible TF–IDF
   artifact scripts and a small evaluation set.
3. Implement a shared load-once ranking service and `/events/search`.
4. Add cluster browsing and explicit-interest `/events/recommended` results.
5. Integrate ranked records into `/chat` and return canonical event cards.
6. Evaluate, tune on development data, and publish held-out results/limitations.

Verify artifact reload matches offline rankings; check ID/vector alignment,
date/schedule filters, empty queries, zero-vector queries, and deterministic ties.
Check both API paths share ranking behavior and the LLM only receives selected
records. Do not test quality by comparing an implementation to itself; use human
relevance judgments and meaningful baselines.
