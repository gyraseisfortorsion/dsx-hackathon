# Campus services API

Backend support for the app's `campus.ts`, `services.ts`, and local service stores.
These are **fictional prototype records and actions**, not integrations with BU chat,
housing, payroll, banking, notification delivery, or biometric authentication.
The frontend is not rewired by this backend change.

Use the existing bearer password and `?user=alex|maya|jordan|sam|taylor` on every
route. The shared password permits choosing any demo user; it is not individual
student authentication. See authenticated `/openapi.json` or `/docs` for exact schemas.

## Responses and writes

New service routes return:

```json
{
  "user": "alex",
  "as_of": "2026-10-24T12:00:00-04:00",
  "is_mock": true,
  "version": 0,
  "data": {}
}
```

`as_of` describes the fixture snapshot; new messages and request updates have actual
UTC timestamps. All monetary amounts are integer USD cents; dates use ISO 8601.
Shift times are local HH:MM in `America/New_York`.

Every mutation body requires the last service envelope's `version`. A successful
write increments the per-user service version, including repeated PUTs. All
service areas share this counter. On `409`, refetch affected service state and retry
with its current version; do not blindly resend an old state. Event `/preferences`
and `/events/{id}/feedback` retain their existing separate versioning contracts.
DELETE takes `version` as a query parameter. Validation failures do not persist.

Errors: `401` invalid bearer, `404` unknown user/resource, `422` invalid body or
business rule, `409` stale version / storage race / locked timesheet, `503` storage
failure or corrupt state. Local atomic files live beside message storage at
`runtime/services/<user>.json`; Vercel private Blob uses `services/<user>.json` with
conditional writes. Existing chat and event preference files remain separate.
Use one worker for the local file backend, as with assistant history.

## Chats

| Method | Path | `data` / body |
| --- | --- | --- |
| GET | `/chats` | Threads with messages, author IDs/names, timezone-aware timestamps, preview, last activity, notice and optional pinned notice. Optional `kind=class|club|dm|study_group`. |
| GET | `/chats/{thread_id}` | One thread |
| POST | `/chats/{thread_id}/messages` | `{version, body}` → created message (201) |
| POST | `/chats/{thread_id}/study-groups` | `{version, title, starts_at, ends_at, location}` → study group with its new `thread_id` (201) |

Class threads derive from each student's actual fixture enrollments, rather than
hardcoding CS 210 for everyone. Use IDs returned by `/chats`. Study groups require
a class thread and create a persistent group thread plus calendar extra. `ends_at`
must follow `starts_at`; both require timezone offsets. `from_me` derives from the
selected user. These prototype threads are isolated per user; sending a message
never delivers it to another demo student or invokes the AI assistant. `/chat`
and `/messages` remain the assistant conversation endpoints.

## Clubs and calendar

| Method | Path | `data` / body |
| --- | --- | --- |
| GET | `/clubs` | Club profiles, stats, tags, dated open house, membership and planned flags |
| GET | `/clubs/{club_id}` | One club |
| PUT | `/clubs/{club_id}/membership` | `{version, enabled}` → club |
| PUT | `/clubs/{club_id}/open-house` | `{version, enabled}` → club |
| GET | `/calendar/extras` | Explicitly planned open houses, study groups and enabled syllabus deadlines |
| PUT | `/calendar/deadlines/{course_id}` | `{version, enabled}` → extras |

Fetch `/calendar` for existing academic entries **and** `/calendar/extras` for the
service entries, then merge/sort by `starts_at` in the frontend. Existing calendar
schemas and IDs are unchanged. Extra `kind` values are `club_open_house`,
`study_group`, `extracted_deadline`; academic-only fields are not fabricated.
Open houses have a fixed October 24, 2026 date, not the device's current “today.”
The syllabus toggle enables a labeled prototype deadline for an enrolled course;
it does not parse an uploaded syllabus or modify `/grades`. Bookmarked campus
events never enter either calendar endpoint. Joining a club also does not plan
its open house. Repeated enabled writes do not duplicate memberships or entries.

## Housing

| Method | Path | `data` / body |
| --- | --- | --- |
| GET | `/housing` | Assignment: building, room, office |
| GET | `/housing/contacts` | Residence, real estate, and emergency contacts; `routing_is_mock: true` |
| GET | `/housing/requests` | Requests, newest first |
| GET | `/housing/requests/{request_id}` | One request and status timeline |
| POST | `/housing/requests` | New request (201) |
| PUT | `/housing/requests/{request_id}` | `{version, status?, text?}`; at least one required |

Creation body example:

```json
{
  "version": 0,
  "description": "Radiator is noisy",
  "category": "Heating & Cooling",
  "urgency": "Urgent",
  "building": "Warren Towers A",
  "room": "814",
  "preferred_time": "Weekday afternoon",
  "photos": []
}
```

Categories: Plumbing, Heating & Cooling, Electrical, Furniture / Appliance / Key,
Pest, Cleaning / Common Area, Roommate / Community, Safety / Security, Other.
Urgency: Routine, Urgent, Emergency. Preferred time: Weekday morning, Weekday
afternoon, Any time. The server derives a prototype destination; clients do not
supply routing decisions. Emergency requests return explicit contact guidance;
they do not dispatch responders. Existing public contact values are carried over
from the app's fixtures without a new verification of those numbers.

Up to three photos, each `{name, media_type, content_base64}`, may be attached.
JPEG/PNG only, at most 1 MiB decoded per photo, strict base64 and matching file
signature required. Photos are stored in the private per-user JSON and returned
with the request; they are not public URLs. This is a small prototype attachment
contract, not an image processing service. No local device paths are stored.

Statuses: Submitted, Routed, Assigned, Scheduled / In progress, Resolved.
Each explicit prototype status edit or text update appends a timestamped timeline
entry. Status edits remain possible in either direction to support the app's undo
interaction; there is no separate facilities staff role in this shared-password demo.

## Work & Pay

| Method | Path | `data` / body |
| --- | --- | --- |
| GET | `/work` | Job, timesheets, checklist, pay, masked direct deposit |
| GET | `/work/job` | Job, supervisor and hourly rate |
| GET | `/work/pay` | Last payment, next payday, YTD gross/net |
| GET | `/work/direct-deposit` | Authorization status, last four digits, official management URL |
| GET | `/work/checklist` | Onboarding checklist |
| PUT | `/work/checklist/{item_id}` | `{version, enabled}` → item |
| GET | `/work/timesheets` | Current and prior timesheets |
| GET | `/work/timesheets/{sheet_id}` | One timesheet |
| POST | `/work/timesheets/{sheet_id}/shifts` | Shift body → updated timesheet (201) |
| PUT | `/work/timesheets/{sheet_id}/shifts/{shift_id}` | Shift body → updated timesheet |
| DELETE | `/work/timesheets/{sheet_id}/shifts/{shift_id}?version=N` | Updated timesheet |
| POST | `/work/timesheets/{sheet_id}/release` | `{version}` → Awaiting supervisor |

Shift body: `{version, date: "2026-10-24", start: "10:00", end: "12:00",
break_minutes: 30, note: "Library shift"}`. Use IDs/dates from the GET response.
The current fixture week is October 19–25, 2026. Hours and gross cents are computed
from paid minutes and the job rate, rounding monetary totals once to the nearest
cent (half up). Clients cannot supply hours or pay. Overnight, overlapping,
out-of-week, zero/negative paid shifts are rejected. Only Draft sheets can be
edited; release requires a nonempty sheet and locks edits. Release does not
approve a timesheet, issue pay, or change fixed YTD figures.

Bank details beyond a fictional last four digits are never accepted or stored;
management uses the official external URL. Onboarding flags are prototype state.
Historical sheets expose summary totals and may omit individual shift details.

## Dining, settings and resources

| Method | Path | `data` / body |
| --- | --- | --- |
| GET | `/dining/transactions` | Sample dated transactions, signed cents, separate account IDs; `limit` 1–100 and nonnegative `offset` |
| GET | `/settings/preferences` | Device-style display/planning preferences, now persistable per demo user |
| PUT | `/settings/preferences` | `{version, settings: <complete settings object>}` |
| PUT | `/student` | `{version, full_name}` → edited profile envelope |
| GET | `/resources` | Static menu/settings pages including the selected profile |
| GET | `/resources/{page_id}` | One page |
| GET | `/resources/external-links` | Existing app external destinations and confirmation copy |
| GET | `/resources/external-links/{link_id}` | One external destination |

`GET /student` preserves its existing flat profile schema and returns the edited
name. School, major, BUID and email remain fixture identity fields. Get the version
for a profile edit from any service envelope (for example `/settings/preferences`).

Settings: `vegetarian`, `step_free`, `class_reminders`, `saved_event_updates`,
`club_activity`, `reduced_motion`, `larger_text`, `grades_hidden`, `face_id_enabled`,
`pay_hidden`, `menu_hint_visible`. These flags do not implement notifications,
step-free navigation or biometric verification. Grades and pay APIs remain
accessible under the prototype bearer contract. Event interests/goals remain in
`/preferences`; editing service settings never resets them.

Dining transaction samples do not mutate or reconcile the fixed meal balances.
No-plan students receive only Convenience Points transaction samples. Existing
`/meal-plan` remains the source for balances and rules. Resource pages and links
are static prototype content, without live transit, support ticket delivery or
external-link side effects.

## Frontend migration

1. Replace `campus.ts` reads with `/clubs` and `/chats`; map snake_case fields to
   presentation props and format absolute timestamps locally.
2. Replace service stores' reads/writes with the routes above; keep cached service
   versions synchronized after each write and refetch on 409. Return server IDs
   from request/shift/group creation rather than incrementing local counters.
3. Merge calendar extras explicitly; keep saved events as bookmarks.
4. Read dynamic Edit Profile content from `/student` or `/resources/edit-profile`.
5. Map housing photo picker bytes to base64 after resizing to the documented limits.
6. Fetch fresh service settings after user changes/sign-in. Persisted privacy flags
   are display preferences; the app must implement any actual Face ID prompt.
