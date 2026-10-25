# Frontend handoff: pulled backend changes and BU public services

Reviewed October 25, 2026 on `dsx`, starting from `0339ce4`. Use the accompanying
`openapi.json` for the complete current contract. Vercel production tracks `dsx`.

## Required changes for existing screens: none

The BU integration adds **seven GET paths**. Compared with the pulled backend,
it changes **zero existing paths/operations and zero existing schema components**.
The resulting API has 107 paths / 117 operations.

Keep the current backend base URL, bearer header and `user` query parameter. No
BU key, new login, JWT, or direct BU API call belongs in the mobile app. Existing
profile, meal balance, classes, calendar, attendance, grades, events and chat calls
continue to work. Old screens can ignore the new features until adopted.

## New public data available now

| Feature | Calls to our backend | Rendering notes |
| --- | --- | --- |
| Dining halls | `GET /dining/locations` | Use returned IDs (`marciano`, `warren`, `west`) |
| Menus and opening status | `GET /dining/locations/{location}/menu?day=2026-10-25` | Optional date defaults to actual campus today; meals contain stations/items |
| Item ingredients and nutrition | `GET /dining/locations/{location}/menu/items/{id}?day=2026-10-25` | Keep the menu date; missing values stay null; show allergy notice |
| Shuttle routes and stops | `GET /transit/bus/routes` | Read route IDs and nested stop IDs from the response |
| Vehicle positions | `GET /transit/bus/vehicles` | Empty array is valid; retain provider `reported_at` |
| Arrival estimates | `GET /transit/bus/stops/{stop_id}/arrivals` | Groups contain routes/stops and arrivals; estimates may be null |
| Service notices | `GET /transit/bus/notices` | Show `partial` / `warnings` when present |

Every call above also needs `?user=alex` (or the selected demo user). Responses are
typed public-service objects, **not** the `{version,data}` service envelope. For
example, read `response.routes` or `response.locations`, not `response.data`.
The existing `apiRequest` helper works without modification.

```ts
// Existing helper still adds the user query and shared bearer header.
const locations = await apiRequest(user, '/dining/locations');
const menu = await apiRequest(user, '/dining/locations/marciano/menu', {
  params: { day: '2026-10-25' },
});
const routes = await apiRequest(user, '/transit/bus/routes');
```

Use the new `BU*` schema types in OpenAPI for typed requests/responses. The base
client already supports GET, so no client transport change is required.

Public data uses actual campus time, while existing personal records retain their
fixed demo date. Show `fetched_at` and a `stale` label when appropriate. A `503`
means that public data is unavailable, not that the demo user is signed out. Do
not turn it into zero balances, empty successful menus, or invented arrival times.
Cache menu/location queries longer than bus data. See [BU_PUBLIC_API.md](BU_PUBLIC_API.md)
for TTLs, errors and the credential cutoff.

**The supplied BU key expires October 25 at 5 p.m. Eastern.** The server stops
serving this integration at that configured cutoff; existing prototype features
remain available. Renew server credentials and redeploy to extend access.

## Features included in the pulled changes

These are separate, optional integrations; adopting one does not require replacing
the existing home, dining or event screens.

| Area | Backend capability | Frontend integration reference |
| --- | --- | --- |
| Campus services | Persistent per-user class/club/demo chats, study groups, club membership, calendar extras, housing requests/photos, work/timesheets, settings, editable name | [SERVICES_API.md](SERVICES_API.md) |
| Request routing | `GET /requests/departments`, `POST /requests/route` with `{text}`; assistant can suggest an office or request clarification | `routing` on assistant messages is optional; suggestions do not submit tickets |
| Study partners | Opt-in study profiles, matching, invitations, acceptance and participant conversations | [COMMUNITY_API.md](COMMUNITY_API.md) |
| Marketplace | Validated photos, listing search/filtering, saves, inquiries, seller actions and conversations | [COMMUNITY_API.md](COMMUNITY_API.md) |
| Academic planning | Syllabus text/PDF upload and review, academic dashboard/search/calendar, grading scenarios, workload and study/recovery plan previews/commits | [ACADEMICS_API.md](ACADEMICS_API.md) |
| Event tags | Suggested fixed-taxonomy tags and per-user corrections on event cards | [EVENTS_API.md](EVENTS_API.md), root README |

The request router and community ML features use experimental/synthetic-trained
models. Render their handling/reason fields as advisory, not verified decisions
or calibrated probabilities. No real ticket submission or university SSO is added.

## Compatibility details to keep in mind

- `/chat` still accepts only `{message}` and returns the completed assistant
  message. `event_cards`, nullable `routing`, and `academic_citations` are additive
  response fields from the pulled work. Default absent arrays to `[]`; older
  clients may ignore them. `academic_citations` contain `course_id`, `syllabus_id`,
  `passage_id`, nullable `page`, `excerpt`, and `path`.
- `/messages` remains assistant history. `/chats` is the separate campus-services
  thread API. `/community/conversations` is the participant messaging API for
  study invitations/marketplace inquiries. Do not merge these state models.
- Service mutations use their service envelope's latest `version`. Academic
  mutations use the independent academic version. Event preferences retain their
  own version. On `409`, refetch that feature's state and let the user retry.
- `/calendar` and `/grades` remain the original fixture contracts. Advanced
  syllabus/grade edits are reflected in `/academic/calendar` and
  `/academic/courses/{id}/grades`, not silently written into the old fixture APIs.
  Use the academic data consistently when building an advanced planner; do not
  merge two sets of class entries blindly. `/calendar/extras` holds service extras.
- The current mobile `apiRequest` method type supports GET/POST/PUT. Extend it to
  DELETE only when adopting a feature that actually uses DELETE (for example,
  removing a work shift). The seven new BU routes require only GET.
- Public menus do not replace `/meal-plan` or `/dining/transactions`. Personal
  financial and academic records remain fictional, and service actions remain
  prototype actions unless explicitly documented otherwise.

## Suggested adoption order

1. Keep existing screens and add menu/location queries to Dining.
2. Add route/stop selection and notices to Map & Transit, then vehicle/arrival refresh.
3. Adopt the academic dashboard and syllabus workflow as a separate feature.
4. Integrate study/marketplace screens when their independent state flows are ready.

Regenerate the contract after backend changes with
`cd api && uv run python scripts/export_openapi.py`; check freshness with `--check`.
After deployment, the authenticated live `/openapi.json?user=alex` is authoritative.
