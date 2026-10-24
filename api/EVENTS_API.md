# Events and personalization: iOS integration

Implemented locally; these changes have not been deployed. Use the existing API
base URL after deployment, or the local server's LAN address from a device.
Every endpoint requires `Authorization: Bearer YOUR_PASSWORD` and `?user=alex`
(or maya/jordan/sam/taylor). These are mock users, not individual logins. Events
come from the real Terrier Central snapshot. Nothing subscribes to or writes to a calendar.

## Startup and onboarding

1. Load `GET /events/options?user=alex` for interest/goal IDs, source categories,
   exploratory clusters, defaults, and artifact provenance.
2. Load `GET /preferences?user=alex` for this user's saved preferences.
3. Skip onboarding to use general events, or save preferences with PUT.

```http
PUT /preferences?user=alex
Authorization: Bearer YOUR_PASSWORD
Content-Type: application/json

{
  "version": 0,
  "interest_ids": ["technology", "music"],
  "interests_text": "Beginner robotics and live jazz",
  "goal_ids": ["make_friends", "learn_skills"],
  "avoid_schedule_conflicts": true
}
```

PUT replaces the preference fields; send the complete form. Always use the latest
version from GET or the preceding mutation response. Each changed preference or
feedback write increments the version. A stale preference edit returns 409;
reload preferences and let the user retry. Defaults have empty interests and no
pre-seeded claims about a mock student's tastes. Switching users loads that user's
separate preferences, saved events, and chat history.

## Screens and endpoints

| Screen/action | Request | Response |
| --- | --- | --- |
| Upcoming | GET `/events?user=alex&limit=20&offset=0` | General event envelope |
| For You | GET `/events/recommended?user=alex&limit=20` | Array of event cards; existing array contract preserved |
| Search or advanced filtering | POST `/events/search?user=alex` | Ranked event envelope |
| Explore themes | GET `/events/clusters?user=alex` | Exploratory clusters with upcoming eligible counts |
| Event details | GET `/events/{id}?user=alex` | Canonical event card |
| Save | PUT `/events/{id}/feedback?user=alex` with `{"saved":true}` | Desired state and profile_version |
| Hide | Same PUT with `{"not_interested":true}` | Hidden occurrence excluded from discovery |
| Unsave/unhide | Same PUT with `{"saved":false,"not_interested":false}` | State cleared |
| Saved | GET `/events/saved?user=alex` | Array including past saved events |
| Chat | POST `/chat?user=alex` with `{"message":"Find music events"}` | Existing message plus `event_cards` |

Feedback is idempotent and replaces both flags; omitted flags default to false.
Saved and hidden cannot both be true. Saving does not RSVP or register attendance.
Hidden applies to the single occurrence. Unsupported IDs return 404. Source links
open the original event page. Cluster labels are algorithmic top terms, marked
`reviewed:false`; do not present them as official university categories.

GET `/events` accepts `category`, `cluster`, and `avoid_schedule_conflicts` query
parameters as well as limit/offset. For complete filtering, send a blank search
query with the following structured body. Get a general, non-personalized list
through GET `/events`; blank POST search still uses saved preferences.

```json
{
  "query": "music and meeting people",
  "filters": {
    "starts_from": "2026-10-24T00:00:00-04:00",
    "starts_before": "2026-11-01T00:00:00-04:00",
    "category_ids": [],
    "cluster_ids": [],
    "avoid_schedule_conflicts": true,
    "available_windows": []
  },
  "limit": 20,
  "offset": 0
}
```

All filter fields are optional. Absent/null conflict override uses saved preferences;
explicit false turns it off. Dates require timezone offsets. Date bounds filter event
start times, start inclusive/end exclusive. Available windows use
`{"starts_at":"...","ends_at":"..."}` pairs and require the entire event to fit
within one window. Empty lists impose no restriction. iOS should use date chips
to send explicit intervals; non-LLM search does not parse phrases like “tomorrow.”

Envelope fields: `mode` (general, personalized, search, no_match), `as_of`,
`artifact_version`, `profile_version`, `effective_filters`, `total`, `next_offset`,
`notice`, `items`. For the next page send next_offset with the same filters; reset
pagination after preference/filter/artifact changes. Search limits are 1–100.

Cards include id, title, description, starts_at, ends_at, location, source_url,
source_category, cluster_id, saved, not_interested, conflict_ids,
conflict_check_complete, score, reasons. Dates are ISO 8601 with offsets or Z;
ends_at/location/score can be null. Unknown end time means incomplete conflict
checking, not guaranteed availability. Scores are relevance values, not probabilities.
Reasons are deterministic strings and need no LLM. Display source data, rather
than extracting event fields from chat prose.

The existing `/events/recommended` returns cards in a bare array. Use POST search
with a blank query if the frontend needs personalized mode/notice/pagination metadata.
The general list is chronological, honors hidden events and the schedule toggle,
and does not use profile similarity. Interest matching and saved-event similarity
rank For You. A current search query dominates saved preferences. Hiding affects
eligibility only; there is no trained negative-feedback model.

## Calendar and LLM behavior

Known conflicts are computed on the backend from the selected mock student's
class/exam calendar, using overlapping intervals. Assignment deadlines do not
occupy the whole day. No schedule upload is needed and no travel time is assumed.
Events starting before the demo clock are excluded from discovery; details and
saved views can still show past records. Unknown cost/eligibility is not inferred.

The fixed demo clock is October 24, 2026 at 12:00 America/New_York, matching the
existing academic fixtures. Show the returned as_of; do not describe these results
as live updates relative to the phone clock.

Chat has a bounded `search_events` tool that uses the same service. It returns
canonical event_cards with the existing id/role/content/created_at/sources message
fields. Cards may include candidates from multiple tool searches. Chat does not
silently edit preferences or save events. When the model fails, existing chat error
codes apply; offer the non-LLM search screen. General browsing, recommendations,
search, preferences, saves, and clusters work without a model key.

## Offline model workflow

```bash
uv sync --frozen
uv run python scripts/build_events.py
uv run pytest -q
uv run ruff check .
```

The build reads `research/events/raw/bu_events.ics`, parses/cleans it, fits TF–IDF,
compares K-means K=4/6/8 by cosine silhouette, and exports
`api/data/event_artifacts.json`. The source snapshot contains 247 records and 146
distinct titles. It retains recurring sessions with distinct occurrence IDs.
Recurring rules are rejected rather than silently mis-expanded. Update the source
snapshot manually before rebuilding; nothing fetches feeds during user requests.

At startup each backend process loads a single bundle. Requests transform text
with the saved vocabulary/IDF and compute exact cosine scores against saved vectors.
K-means never runs in an endpoint. The runtime uses a small pure-Python scorer;
scikit-learn and icalendar are development/build dependencies only. Runtime-vs-offline
TF–IDF parity is tested. Deploy the bundled artifact along with the backend.

Preferences use separate local atomic JSON files in `runtime/preferences` or the
sibling of the configured messages directory. Production uses the existing private
Blob store under `preferences/<user>.json`, with ETag conditional writes. No fixtures
or serverless local files are modified. Existing chat history stays in `chat/`.

Current limits: lexical matching, heuristic ranking weights, unreviewed clusters,
no repeated-series diversification, no human relevance evaluation yet. Silhouette
is cluster geometry, not proof of recommendation usefulness. No collaborative
filtering, user clustering, or click-history training is claimed. Preserve stable
IDs and retain old saved records when introducing a future feed-refresh lifecycle;
this version serves a single bundled snapshot.
