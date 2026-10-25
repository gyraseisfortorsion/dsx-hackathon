# BU public dining and transit integration

These are additive, read-only routes backed by BU's public-services gateway. They
use our existing `Authorization: Bearer <API_PASSWORD>` and required `user` query
parameter. The BU `X-API-Key` is sent by the backend only.

The gateway's verified OpenAPI version is `20261024-204c759`. Its real paths start
with `/api/v1`, unlike the abbreviated examples in the supplied PDF.

## Endpoints

| GET path on our API | Response root | Parameters |
| --- | --- | --- |
| `/dining/locations` | `locations`, `source`, `source_url` | `user` |
| `/dining/locations/{location}/menu` | `location`, `date`, `schedules`, `meals`, `open_now`, `status`, `current_meal`, freshness/source | `user`, optional `day=YYYY-MM-DD` |
| `/dining/locations/{location}/menu/items/{item_id}` | Item identity, dietary/nutrition fields, `ingredients`, `location`, `date`, `meal`, `station`, `allergy_notice`, freshness/source | `user`, optional `day` |
| `/transit/bus/routes` | `routes`, freshness/source | `user` |
| `/transit/bus/vehicles` | `vehicles`, freshness/source | `user` |
| `/transit/bus/stops/{stop_id}/arrivals` | `stop_id`, `groups`, freshness/source | `user` |
| `/transit/bus/notices` | `notices`, `partial`, `warnings`, freshness/source | `user` |

`location` is `marciano`, `warren`, or `west`. Discover item IDs from a menu and stop
IDs from `routes[].stops[]`; do not hardcode provider IDs. Route stop IDs and
`physical_stop_id` are distinct fields. Follow the upstream route/stop structure.

Menus contain `meals[].stations[].items[]`. Missing ingredients, calories, nutrition,
arrival estimates and vehicle IDs remain null. There is no structured allergen
list in the supplied API. Preserve `allergy_notice`; missing information does not
establish that a meal is safe for an allergy. Dietary flags use BU's returned values.

## Time and freshness

Public services use actual campus time, independently of the October 24 mock
student snapshot. If `day` is omitted, the backend explicitly requests today's
`America/New_York` date. Send the same date when following a menu item link.

Transit, menu and item responses retain BU's original `fetched_at`, `stale` and
`source`. Vehicle `reported_at` is the provider's update time, not a retrieval
timestamp. Preserve null timestamps. Notices may be `partial` and include warnings.
An empty vehicle/arrival list is a valid result and must not create fictional buses.

Per-process cache settings:

| Data | Fresh TTL | Maximum cached age on temporary failure |
| --- | --- | --- |
| Routes | 60 seconds | 300 seconds |
| Vehicles / arrivals | 10 seconds | 30 seconds |
| Notices | 30 seconds | 180 seconds |
| Location directory | 1 hour | No stale fallback |
| Menus / items | 5 minutes | 30 minutes |

Fallbacks set `stale: true` and keep the original `fetched_at`. Show a stale-data
label and avoid presenting cached estimates or opening status as current. Upstream
stale flags are never reset. Cached responses are shared only for this public data,
not for personal student records. Concurrent misses are coalesced; the bounded
in-memory cache holds at most 256 entries.

The client limits each process to 90 upstream attempts/minute, backs off 60 seconds
after auth/rate-limit failures, and does not automatically retry requests. The
provider's quota is shared across instances and team usage, so the upstream may
still throttle. Do not poll locations or menus at a shuttle-update frequency.

## Errors and availability

- Existing `401` / unknown-user `404` / input `422` rules still apply.
- `404`: BU resource not found. `422`: invalid/unsupported request or dining date.
- `503`: missing or expired server credentials, rejected BU access, timeout,
  malformed upstream response, rate limit, or unavailable upstream without a valid
  bounded fallback. A rate-limit response includes `Retry-After: 60`.
- Raw provider errors and credentials are never returned to the app. Redirects
  are not followed with the BU key. Existing mock/student endpoints remain usable
  when BU public services are unavailable.

## Server configuration

```dotenv
BU_PUBLIC_API_KEY=<team key from the supplied instructions>
BU_PUBLIC_API_BASE_URL=https://public.api-nonprod.bu.edu/api/v1
BU_PUBLIC_API_EXPIRES_AT=2026-10-25T17:00:00-04:00
BU_PUBLIC_API_TIMEOUT_SECONDS=8
```

The supplied hackathon window ends **October 25, 2026 at 5 p.m. Eastern**. At the
configured cutoff, the backend stops upstream requests and cached fallback service.
For a renewed credential, update the key and expiration together and redeploy.
Keep the key in ignored local environment files or sensitive Vercel environment
variables. Do not create an `EXPO_PUBLIC_*` variable for it. This access is scoped
to the team/hackathon; it is not a general redistribution license.

## What is intentionally unchanged

`/meal-plan`, `/dining/transactions`, `/student`, `/courses`, `/calendar`, attendance
and grades keep their existing shapes and mock semantics. The public API supplies
menus and shuttle information, not a student's account balance or academic record.

The PDF's course-catalog Postgres service requires BU-authenticated VPN access and
has a separate read-only credential. It is not a public HTTP endpoint in this
gateway. This integration does not add a serverless database dependency or replace
enrollment IDs, sections, grades, or calendar fixtures.

The assistant's bounded `campus_services` tool uses this same client and cache. It
can cite BU sources and explain unavailable data without changing `/chat`'s request
or response contract.
