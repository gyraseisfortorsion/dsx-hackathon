# Personalized events for the iOS campus app

Status: original implementation plan. The backend is now implemented locally;
see [the actual iOS API contract](../api/EVENTS_API.md) for supported fields and
differences (offset pagination, no negative similarity model, exploratory clusters).
The iOS source is on another computer and is outside this implementation. Complements
[the model workflow](event-recommendation-plan.md).

## Confirmed product decisions

- The frontend is an existing Xcode/iOS app, maintained outside this repository's
  currently empty `app/` directory. Do not create a competing web frontend.
- Use the five existing demo students with editable preferences; no signup work.
- General event browsing must work without personalization.
- Offer personalized lists and search without LLM calls.
- Offer conversational event discovery with an LLM that explains ranked results.
- Use the selected student's existing classes and exams for conflict detection,
  controlled by an editable toggle. No calendar import/subscription/write is needed.
- Existing academic/meal-plan/chat features remain part of the campus app.

## User experience

1. Select a demo student. Load their preferences, existing student data, and general
   events. Preferences must persist separately for each selected student.
2. Optional onboarding: select interests, enter an optional short description of
   interests, choose goals, and set conflict avoidance. Allow Skip; do not block browsing.
3. Events screen: Upcoming, For You, Explore Themes, Saved. Expose date/category
   filters, a search box, and the schedule-conflict toggle.
4. Event details: original description, time, location, source category, source
   link, saved state, and known schedule conflicts. Distinguish unavailable metadata.
5. Preferences screen: edit the same onboarding fields and optionally add available
   time windows. Saving updates recommendations without training any model.
6. Chat: ask for activities in natural language. Display the LLM's explanation and
   canonical event cards from structured backend data. Links open the source page;
   saving in this app does not register the student or add an event to a calendar.

For You falls back to a clearly labeled general list when preferences are empty.
An empty filtered result should offer removing filters, without silently ignoring them.

## Personalization inputs

| Input | Source | How it affects results |
| --- | --- | --- |
| Interest IDs | Student selection from backend options | Main profile-matching signal |
| Free-text interests | Optional student input, max 500 chars | Adds specific topics not covered by options |
| Goals | Optional controlled choices | Adds related topic text; separate from hard constraints |
| Avoid schedule conflicts | Editable boolean, default true | Removes events overlapping known classes/exams |
| Available windows | Optional explicit timestamp intervals | Restricts events when provided; event must fit fully within one window |
| Saved events | Explicit Save action | Adds a small, capped content-similarity signal |
| Not interested | Explicit feedback action | Hides that occurrence and can supply a small negative signal |
| Current query | Search/chat input | Primary immediate intent, ahead of saved preferences |

Goals can start with make_friends, explore_interests, learn_skills, career_growth,
and community_service. Interest options should be selected after inspecting event
coverage, with IDs and readable labels. They are distinct from source categories
such as Social or Meeting. Return descriptions and example topics with options.

Do not infer interests from grades, finances, or attendance. Do not assume major
equals interest. Use existing schedule records server-side; iOS need not resend them.
Start with explicit feedback; no background click tracking is required.

## Proposed API contract

Every route uses existing `Authorization: Bearer ...` and `?user=alex` conventions.
This remains a demo-user selector with a shared password, not individual account
security. The existing `/calendar` route stays read-only.

| Method/path | iOS sends | Backend returns |
| --- | --- | --- |
| GET `/events/options` | Selected user | Allowed interests/goals, categories, clusters, preference defaults |
| GET `/preferences` | Selected user | Saved preferences, version, updated_at; defaults if none exist |
| PUT `/preferences` | Complete preferences plus expected version | Validated persisted preferences and new version |
| GET `/events` | Optional date/category/cluster filters, cursor, limit | General upcoming events, pagination, effective filters |
| GET `/events/recommended` (existing placeholder) | Optional limit and conflict-toggle override | Personalized or general fallback list |
| POST `/events/search` | Query plus optional structured filters | Ranked event list without an LLM |
| GET `/events/{event_id}` | Stable occurrence ID | Canonical details and selected user's state/conflicts |
| GET `/events/clusters` | Optional date range | Reviewed cluster labels and upcoming-event counts |
| GET `/events/saved` | Selected user, optional cursor | Saved events, including clearly marked past events |
| PUT `/events/{event_id}/feedback` | Desired saved/not-interested state | Persisted state and new profile version |
| POST `/chat` (existing) | Existing message, optional event filters | Existing answer fields plus structured event cards |

Register fixed event routes before `/events/{event_id}`. Use bounded limits and
opaque cursors tied to filter/artifact versions; stale cursors should request a
fresh page. Keep pagination deterministic. No frontend sends vectors, clusters,
model weights, grades, or training data.

### Example onboarding update

```json
{
  "version": 0,
  "interest_ids": ["technology", "music"],
  "interests_text": "Beginner robotics and live jazz",
  "goal_ids": ["make_friends", "learn_skills"],
  "avoid_schedule_conflicts": true
}
```

Interest IDs above illustrate the shape; finalize them in `/events/options` after
the dataset audit. No availability windows means no extra availability restriction.

### Example search without LLM

```json
{
  "query": "robotics and meeting people",
  "filters": {
    "starts_from": "2026-10-24T00:00:00-04:00",
    "starts_before": "2026-11-01T00:00:00-04:00",
    "category_ids": [],
    "cluster_ids": [],
    "avoid_schedule_conflicts": true,
    "available_windows": []
  },
  "limit": 5
}
```

Intervals are timezone-aware, start-inclusive/end-exclusive. An empty category or
cluster list means no restriction. Distinguish absent override (use preferences)
from explicit false. Available windows use `{starts_at, ends_at}` pairs; recurring
weekly availability can be added later. Source-local time defaults to
America/New_York; iOS formats timestamps for display.

### Proposed result envelope for new list/search routes

```json
{
  "mode": "personalized",
  "as_of": "2026-10-24T12:00:00-04:00",
  "artifact_version": "events-v1",
  "profile_version": 3,
  "next_cursor": null,
  "effective_filters": {"avoid_schedule_conflicts": true},
  "items": []
}
```

Each item has canonical id, title, description, starts_at, ends_at, location,
source_url, source_category, cluster_id, saved/not_interested state, known
conflicts, and structured reason codes with short display text. An optional score
is an internal relevance value, never an interest probability. Unknown metadata
uses null. No-match reason and data-freshness metadata should be returned explicitly.

Compatibility: `/events/recommended` currently declares a bare array. Preserve that
array shape while extending its event fields and providing the general fallback;
coordinate a versioned envelope with iOS if needed. `/chat` keeps id, role, content,
created_at, sources and adds `event_cards` defaulting to `[]`. Update response models
and OpenAPI before frontend integration. Decode added fields explicitly in Swift.

Feedback body is desired state, e.g. `{"saved":true,"not_interested":false}`;
repeating it is idempotent. Do not call saves registrations/RSVPs. Start with hiding
only that occurrence; do not hide an entire recurring series without a separate action.
Use profile versioning for writes; conflicting concurrent edits return 409 and iOS
reloads the current preferences before allowing the student to retry.

## One ranking service, two ways to present it

Offline: clean → fit vectorizer → save event vectors → fit/review clusters → export.
Startup: load the validated artifact bundle once per process/cold start.

Request: get selected user's saved preferences and calendar → apply explicit
overrides → filter events → vectorize query/profile → score → diversify → return.

With no query, use interests/goals and optional saved-event content. With a query,
prioritize query relevance and add a smaller profile signal. Start with no feedback
term, then evaluate whether capped save/negative signals improve results. Ranking
weights are configured heuristics until justified by evaluation; they are not
learned user behavior. All-zero TF–IDF queries must yield an honest lexical no-match
or labeled general fallback, not arbitrary “personalized” scores.

Cosine similarity and diversity selection happen per request. TF–IDF and K-means
fitting never happen in the HTTP path. Cache only when needed, keyed by artifact,
profile version, filters, and effective clock. At 247 events exact scoring is enough.

For conflict avoidance, use existing class/exam occurrences. Assignment deadlines
are points in time, not full-day busy blocks. Use half-open interval overlap. If an
event has no known end, report conflict checking as incomplete rather than invent
a duration or guarantee that it fits. Travel time is not included initially.

The demo uses the backend's fixed October 24, 2026 snapshot for time-sensitive
results. Return that `as_of` and show demo status in iOS; do not silently combine
the phone's live clock with frozen academic fixtures.

Without LLM: browse/search/recommendations and deterministic reasons work normally.
With LLM: a bounded event-search tool on the existing agent calls the same internal
service with validated query/filters; selected records become canonical event_cards.
The LLM explains results and may ask clarification. It cannot save preferences or
change feedback without an explicit supported user action. Event descriptions are
untrusted reference data. It must not invent events, dates, price, or eligibility.
Distinguish this selected tool flow from the earlier plan's simpler pre-retrieval
alternative: use a tool here to handle mixed academic and event chat naturally.

If the LLM is unavailable, existing chat errors can remain; iOS offers the working
non-LLM search screen. Do not promise automatic semantic interpretation of arbitrary
date phrases in non-LLM search: provide date chips and send structured intervals.

## Persistence and deployment

Add a separate per-user store for preferences and feedback, independent of
fictional student fixtures and chat transcripts. Local development uses atomic
files and per-user locks; Vercel uses private Blob persistence with conditional
writes, following existing storage conventions. Do not mutate packaged fixtures or
write serverless local files. Keep versions for lost-update detection and cache
invalidation. Validate cross-user isolation within the demo-user convention.

Bundle event artifacts under `api/data/`; model building remains a separate script.
Persist stable event/occurrence IDs across rebuilds so saves continue to work.
Removed/expired events remain identifiable for saved-history display. Preference
interest IDs must remain stable or have explicit migration. Cluster IDs can change
between builds; avoid persisting them as permanent user interests.

The iOS app needs the deployed base URL, demo bearer password, selected user,
network loading/error states, and Swift request/response models. Existing CORS only
allows GET/POST; native URLSession is not governed by browser CORS. Update CORS
methods if a browser client later uses the proposed PUT endpoints.

## Implementation phases and acceptance

1. Data/artifacts: snapshot feed in repo, parse/clean/profile, TF–IDF build script,
   cluster experiment, versioned artifact bundle and provenance report.
2. Personalization storage: preference options, defaults, per-user read/write,
   version conflicts, saved/hidden state. Skip onboarding remains usable.
3. Non-LLM product: general list, details, search, profile ranking, clusters, saved
   list, schedule toggle; publish sample payloads/OpenAPI for the iOS developer.
4. Chat integration: event search tool and typed cards; preserve existing chat
   fields and existing academic/meal tools. All event features outside chat work
   with no LLM key.
5. iOS integration in its actual Xcode project: student switch, onboarding/settings,
   event screens, filters, actions, and chat cards. The Xcode source location is
   still needed before code changes to that frontend can be made.
6. Evaluation and delivery: compare keyword/category and TF–IDF ranking on human
   judgments; inspect clusters; document results and dataset limitations. Test
   restart persistence, same-user write conflicts, different-user separation,
   artifact alignment, past-event filtering, known/unknown conflicts, no-match
   behavior, missing LLM configuration, and canonical chat cards.

Definition of complete: a demo student can skip or edit onboarding, browse general
events, get an explainable personalized list, change conflict handling, save/hide
events with persistence, and ask chat for the same catalogue. An LLM outage leaves
all non-chat discovery features working. No production deployment, calendar writes,
or automatic retraining is implied by this planning document.
