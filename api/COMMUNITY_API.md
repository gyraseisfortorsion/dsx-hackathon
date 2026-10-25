# Study partners and student marketplace API

Backend-only addition to the existing BU hackathon API. No mobile app changes.
All endpoints use the existing `Authorization: Bearer <API_PASSWORD>` header and
`?user=alex|maya|jordan|sam|taylor` parameter. Swagger remains at `/docs`.

## Identity and launch boundary

These are **demo accounts**, not university SSO identities. The shared bearer
secret allows choosing any fixture user. `COMMUNITY_VERIFIED_USERS` is a
server-controlled allowlist standing in for completed verification; clients cannot
mark themselves verified. Suspended/deletion-requested accounts lose discovery,
publication, and contact access. There is no email/SSO verification integration.
Before serving real students, replace the shared-password/user-selector mechanism
with authenticated individual identities bound to university membership. Do not
expose the demo password as an individual-authentication mechanism.

Scope choices: BU only, existing Fall 2026 catalog, Boston campus, USD, manual
course selection, explicit study discovery opt-in, 30-minute minimum contiguous
shared window, and 30-day listing expiry. No payments, shipping, or escrow.
Availability is reconfirmed by saving the current term, never automatically rolled
forward. The current demo catalog stops matching after its term ends.

## Configuration

See `.env.example`. Defaults:

| Variable | Default | Effect |
| --- | --- | --- |
| `COMMUNITY_VERIFIED_USERS` | `alex,maya,jordan,sam,taylor` | Mock verified identities |
| `COMMUNITY_MODERATOR_TOKEN` | empty | Separate moderator credential; empty disables access |
| `STUDY_MIN_OVERLAP_MINUTES` | `30` | Required contiguous shared study window |
| `STUDY_OVERLAP_TARGET_MINUTES` | `180` | Availability score cap |
| `MARKETPLACE_EXPIRY_DAYS` | `30` | Listing lifetime and renewal period |
| `COMMUNITY_INVITATIONS_PER_HOUR` | `20` | Invitations / buyer conversation initiations, per action type |
| `COMMUNITY_LISTINGS_PER_HOUR` | `10` | New listings; photo limit is three times this |
| `COMMUNITY_MESSAGES_PER_HOUR` | `120` | Messages / experimental analysis, per action type |
| `COMMUNITY_ML_REVIEW_ENABLED` | `false` | Enable advisory model flags on create/edit; never remove/ban |

Moderator requests require the usual bearer/user plus `X-Moderator-Token`.
Never put that separate credential in a mobile bundle or URL.

## Study partners

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/community/config` | Current verification status, canonical courses, term, blocks, expiry, expectations |
| GET / PUT | `/study/profile` | Read/update the selected student's complete private study profile |
| GET | `/study/matches?ranking=rules` | Eligible matches and actual shared windows, goals, courses, score |
| GET | `/study/matches?ranking=model` | Explicit opt-in experimental model ranking plus original rule score and feature contributions |
| GET / POST | `/study/invitations` | Participant-only list / send to a currently eligible classmate |
| POST | `/study/invitations/{id}/action` | `{"action":"accept|decline|cancel"}`; recipients accept/decline, senders cancel |
| PUT | `/study/invitations/{id}/feedback` | Private `{"useful":true,"studied_together":false}` after acceptance; outcome optional |

Example profile body:

```json
{
  "discovery": true,
  "term": "fall-2026",
  "course_ids": ["cas-cs-111"],
  "goals": ["exam_preparation", "weekly_review"],
  "study_format": "collaborative",
  "meeting_mode": "either",
  "timezone": "America/New_York",
  "campus_area": "Mugar Library",
  "availability": [{"weekday":0,"start":"16:00","end":"18:00"}],
  "notifications": false
}
```

Weekdays are Monday=0 through Sunday=6. Windows also accept `effective_from` and
`effective_until` ISO dates. Goals: `exam_preparation`, `weekly_review`,
`assignment_discussion`. Format: `quiet|collaborative|null`; meeting mode:
`online|in_person|either|null`. Optional controlled interests:
`technology|arts|sports|science|community`.

Discovery requires verification, an opted-in current-term profile, courses,
goals and valid availability. Matching excludes self, inactive profiles, blocked
pairs in either direction, and candidates without a shared current course and
at least one sufficiently long shared window. Only shared windows are returned,
not another student's complete availability, email, grades or GPA.

The rule score is 50% capped overlap, 30% goal Jaccard, 20% comparable format/mode
agreement. Missing components are omitted and weights renormalized. `either`
agrees with either meeting mode. Tie-breaker is the stable student ID. Overlap
uses actual UTC intervals for the next seven campus dates, clipped to now and the
term, with IANA timezone conversion. Nonexistent spring-forward endpoints are
skipped; ambiguous fall-back endpoints consistently choose the first occurrence.
Overlapping windows are merged, so minutes cannot be counted twice. Overnight
windows must be split into separate days. Empty results return an explanation.

Invitations prohibit duplicate pending pairs/course in either direction. Acceptance
opens exactly one shared conversation. Declines/cancellations do not open one.
Notification preferences are stored; push/email delivery is not implemented.

## Marketplace

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/marketplace/photos` | Validate, decode, resize and strip metadata; returns owned media ID |
| GET / POST | `/marketplace/listings` | Search/filter/page / publish |
| GET / PUT | `/marketplace/listings/{id}` | Detail / seller-only edit |
| PUT | `/marketplace/listings/{id}/status` | Seller-only status change or renewal |
| PUT | `/marketplace/listings/{id}/saved` | `{"enabled":true}` saves; false unsaves |
| GET | `/marketplace/listings/{id}/related` | Content-based related active items, excluding own listings |
| POST | `/marketplace/listings/{id}/inquire` | Open/reuse buyer+listing conversation; only active items |
| POST | `/marketplace/analyze` | Experimental synthetic-trained moderation score for title/description; never publishes |

Required listing body fields: `title`, `description`, `category`, `condition`,
`price_minor` (strict nonnegative integer USD cents), `currency` (`USD`),
`pickup_area` (public campus area), `photo_ids` (1–3 owned uploaded IDs).
Books optionally accept normalized checksum-validated `isbn`, `edition`, `author`,
and canonical `course_id`. Book fields are rejected on other categories. Zero
price returns `price_label: "Free"`. No inferred sale price is recorded.

Categories: `books|furniture|supplies|electronics|other`. Conditions:
`new|like_new|good|fair`. A small explicit alias map accepts `textbooks`, `book`,
`school supplies`, `tech`, `like new`, `excellent`, `brand new`, `used`.

Photo body: `{"data":"data:image/jpeg;base64,..."}`; JPEG/PNG/WebP only, maximum
2 MB decoded and 16 megapixels, resized to at most 1200×1200 and re-encoded as a
fresh JPEG without EXIF/GPS. Invalid/broken inputs return 422. Prototype media
is inline in the private community document; production should use independent
private media objects and thumbnail endpoints.

Search query parameters:

- `q`: title/description terms or normalized ISBN (title and ISBN rank stronger).
- `category`, `condition`, `min_price`, `max_price`: price filters use cents.
- `sort=relevance|newest|price_asc|price_desc`.
- `scope=active|mine|saved`; `offset>=0`, `limit=1..50`.

Responses contain `items`, `total`, `next_offset`. Sorting uses stable IDs for
ties, so unchanged results do not repeat across pages. Default results contain
active/reserved items. Sold, withdrawn, deleted, removed and expired items are
excluded. Saved results retain unavailable states; removed content is redacted
for other students, and deleted items return 404. Blocks/suspensions also hide
seller content. Reserved items are labeled and cannot receive new inquiries.

Status body: `{"status":"active|reserved|sold|withdrawn|deleted","renew":false}`.
An expired item requires `{"status":"active","renew":true}`. Sellers cannot
restore moderator-removed or deleted listings. Expiry is evaluated on every read;
no scheduler is required. Exact active duplicates by the same seller are rejected;
reused sanitized photo hashes create an advisory report. Similar books from other
sellers remain legitimate. Repetitive spam text is rejected by a basic rule.

## Conversations, safety and moderation

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/community/conversations` | Selected participant's study/marketplace inbox |
| GET | `/community/conversations/{id}` | Participant-only messages |
| POST | `/community/conversations/{id}/messages` | `{"body":"..."}`; verified participants, block checks, rate limit |
| PUT | `/community/blocks/{student}` | `{"enabled":true}` blocks discovery/contact in both directions and cancels pending invitations |
| POST | `/community/reports` | `{"target_type":"listing|account","target_id":"...","reason":"..."}` |
| POST | `/community/deletion-request` | Disable community contact/discovery and withdraw own listings; queue retained-record deletion request |
| GET | `/community/moderation` | Separately authorized reports, target context, suspensions, deletion requests, audit trail |
| POST | `/community/moderation/{report}` | Separately authorized action with recorded reason |
| GET | `/community/metrics` | Separately authorized aggregate counts; no messages or private feedback rows |
| GET | `/community/models` | Loaded model versions, synthetic provenance, enabled review policy |

Moderator action body: `{"action":"dismiss|remove_listing|suspend_account|restore_account","reason":"..."}`.
User reports, system duplicate signals and `system:model` reports retain their
source separately from review decisions. Only explicit moderator actions remove
listings or suspend accounts. The audit records actor, report, action, reason,
and UTC timestamp. Existing conversation history remains readable by active
participants after a block, but no new messages are permitted. Removed/deleted
listing conversations also reject new messages. Marketplace screens can use the
returned `expectations` text: arrange payment/pickup directly; no payment protection.

## Storage and errors

Community state is a shared `community/campus.json` record on the existing private
Blob backend, or `<HISTORY_DIR parent>/community/campus.json` locally. Mutations
serialize under one shared lock locally; Blob conditional writes reject concurrent
updates instead of silently losing another student's changes. Use one local
worker. The single-document layout is for the small hackathon population, not a
scalable database design. There is no deployment or data migration in this change.

401: missing/wrong bearer; 403: unverified, blocked, ownership or moderator access;
404: absent/private item; 409: duplicate/concurrent state change; 410: editing a
deleted listing; 422: invalid input/state; 429: configured rate limit; 503:
storage/model unavailable. Model failures do not prevent rule-based matching or
normal listing publication. Text is returned as data; render it as text, not HTML.

## Validation and remaining launch decisions

`uv run pytest -q` and `uv run ruff check .` cover cross-account access, rules,
DST, aliases, invalid prices/ISBNs/photos, metadata removal, duplicates,
invitation lifecycle, feedback privacy, listing expiry/renewal, saved items,
blocking, moderation/audits, rate limits, persistence, model export and fallbacks.

Launch still requires real university verification, a moderation owner and
prohibited-items policy, defined retention/backups/deletion processing, secure
individual identities and transport/storage operations, production media storage,
and an agreed load/p95 benchmark. Deletion requests are recorded, not a claim of
complete erasure from messages/reports/backups. Aggregate metrics currently give
coverage, invitations, private feedback counts, seller-reported sold counts,
reports/reviews and inquiries; search-session conversion/cohort dashboards and
review-time analytics are not implemented. No real-user quality experiment ran.
