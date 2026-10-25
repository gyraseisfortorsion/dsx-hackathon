# BU Student API

A small FastAPI service with five fictional BU students, researched Fall 2026
courses and 2026–2027 dining plans, and a Pydantic AI chat agent. All student data
is a fixed **October 24, 2026, 12:00 America/New_York** snapshot.

## Start

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
cd api
uv sync --frozen
cp .env.example .env
# Edit .env: set API_PASSWORD and GOOGLE_API_KEY.
uv run uvicorn bu_api.main:app --host 127.0.0.1 --port 8000 --workers 1
```

The data endpoints work without an LLM key. Chat returns `503` if the model is
not configured. The service refuses to start with an empty `API_PASSWORD`.
For a mobile client on another device, bind to `0.0.0.0` and use the computer's
LAN IP. Configure `CORS_ORIGINS` for any browser frontend.

## Requests

Every API route, including `/openapi.json`, requires the shared bearer password and
a `user` query parameter. Supported users: **alex, maya, jordan, sam, taylor**.
The shared password permits selecting any mock user; there is no individual
authentication or login flow.

Open `/docs` for **Swagger UI** and enter the shared API password. The public
HTML shell loads the protected schema only after authentication, then supplies
the bearer header for **Try it out** requests. Set the required `user` parameter
on each request. The password stays in browser memory and is cleared on reload;
it is never placed in the URL or local storage. ReDoc remains disabled.

```bash
curl 'http://localhost:8000/student?user=alex' \
  -H 'Authorization: Bearer YOUR_PASSWORD'

curl 'http://localhost:8000/meal-plan?user=maya' \
  -H 'Authorization: Bearer YOUR_PASSWORD'

curl 'http://localhost:8000/chat?user=alex' \
  -H 'Authorization: Bearer YOUR_PASSWORD' \
  -H 'Content-Type: application/json' \
  -d '{"message":"When is my next class, and how much Dining Points balance do I have?"}'

curl 'http://localhost:8000/messages?user=alex' \
  -H 'Authorization: Bearer YOUR_PASSWORD'
```

| Method | Path | Response |
| --- | --- | --- |
| GET | `/student` | Profile with BUID, full name, email, school, program, major, degree level, year |
| GET | `/meal-plan` | Plan, separate balances, meal/reset period, sources |
| GET | `/courses` | Registered sections and recurring meeting times |
| GET | `/calendar` | Whole-semester class meetings, deadlines, and exams, sorted by start time |
| GET | `/attendance` | Completed-session records and counts grouped by course |
| GET | `/grades` | Assessments and unweighted current points percentage per course |
| GET | `/events/recommended` | Real upcoming events ranked by saved interests, with general fallback |
| POST | `/chat` | One assistant `ChatMessage`; body: `{"message":"..."}` |
| GET | `/messages` | Chronological array of user and assistant `ChatMessage` objects |
| GET | `/openapi.json` | Protected OpenAPI specification |

Structured student responses contain `user`, `as_of`, and `is_mock: true`.
Chat messages contain `id`, `role`, `content`, UTC `created_at`, `event_cards`, and `sources`
(`title`, `url`). Chat is a normal completed JSON response, without streaming.

`/meal-plan` returns integer USD cents in `balance.dining_points_balance_cents`
and `balance.convenience_points_balance_cents`. Unlimited meal plans have
`unlimited_meals: true` and `balance.meals_remaining: null`. No-plan users have
`plan: null`, `meal_period: "none"`, and zero meal/Dining Point balances.
Meal period dates are inclusive; `next_reset_on` is the next Friday for weekly
plans. None of the balances mutate or reset automatically.

The calendar uses timezone-aware ISO timestamps. Class rooms/times are sourced;
assessment dates and scores are mock data. Assignment deadlines have a start
timestamp and null `ends_at`; exams have start/end timestamps. Each assessment
event links to its `/grades` record via `assessment_id`. Reserved weekly exam
windows are not displayed as regular classes.

Errors: `401` bearer password, `404` unknown user, `422` request validation,
`502` model failure, `503` model configuration, `504` model timeout, or `500`
unreadable/unwritable history. Failed chat turns do not append partial exchanges.
Blank messages, extra body fields, and messages over 8,000 characters are rejected.
With Blob storage, `409` means another function saved a turn first; retry the
message. Storage outages return `503` without replacing history with an empty file.

## Mock users

| User | Name | Program | Dining plan |
| --- | --- | --- | --- |
| alex | Alex Morgan | BA in Computer Science | Open Access |
| maya | Maya Patel | BA in Economics | Weekly 10+ |
| jordan | Jordan Rivera | BS in Data Science | Kosher |
| sam | Sam Chen | MS in Computer Science | Campus Connector 50+ |
| taylor | Taylor Brooks | PhD in Computer Science | None; Convenience Points only |

The ten course definitions and seven meal plans live in `data/`. All five
students' records are in `data/students.json`. See [source notes](data/SOURCES.md)
for verified BU links, the CAS/GRS catalog naming discrepancy, mock component
interpretations, and the older FAQ's conflicting Kosher amount.

## Agent configuration and search

`LLM_MODEL=google:gemini-3.8-flash` is passed directly to Pydantic AI. The Google
SDK reads `GOOGLE_API_KEY`. To change providers, change the Pydantic AI model
string and add that provider's environment credentials, for example
`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Provider SDK credentials in `.env` are
loaded at startup. Agent instructions, routes, tool code, and stored histories
do not depend on Gemini-specific request/response formats.

The agent receives only the selected student's profile, finances, course
schedule, calendar, attendance, and grades. The `search_events` tool retrieves real
events using saved preferences and known schedule conflicts. Time-sensitive
answers use the fixed demo snapshot. `search_bu(query)` fetches the 20 official
pages in `data/sources.json`, strips navigation/scripts, caches their readable
text for 15 minutes, and returns up to five keyword-ranked excerpts with source
links. Redirects remain restricted to official BU HTTPS domains. Source failures
are reported to the agent; missing facts must not be invented.

BU's search frontend requires a CAPTCHA token for web results, so this is the
agreed **curated-page search**, with limited coverage. It needs no additional
API key, database, vector index, or external search service. The agent is limited
to five model requests and three BU searches per turn. At the search limit,
search is removed so the model can finish from the results it already has.
Extra calls within a parallel batch receive a budget notice without fetching
more pages. The 60-second timeout is configurable through `CHAT_TIMEOUT_SECONDS`.

## Persistence and checks

Locally, one conversation per user is stored in `runtime/messages/<user>.json` (ignored
by Git). `HISTORY_DIR` can select another writable persistent local directory;
relative paths resolve from `api/`. Each file contains display messages and
Pydantic AI's serialized native history. Successful exchanges commit atomically.
Same-user chat requests serialize; different users can run concurrently.

**Run one worker for the local file backend.** Locks are in-process and local JSON
files require persistent storage. On Vercel, private Blob storage replaces the
filesystem; conditional writes prevent silent lost updates across function instances.

## Vercel deployment

The backend is a separate Vercel project named **dsx-bu-student-api**, under
**gyraseisfortorsions-projects**. The deployment source/root is `api/` (not the
repository root). `pyproject.toml` points to `bu_api.main:app`; `vercel.json` bundles
the JSON fixtures, sets region `iad1`, and allows a 120-second invocation. Local
secrets, virtual environments, tests, and runtime files are excluded from uploads.

Production base URL: <https://dsx-bu-student-api.vercel.app>.
Swagger UI: <https://dsx-bu-student-api.vercel.app/docs>.
The root path has no webpage; use `/docs` or the authenticated API paths above.

Production configuration:

- `API_PASSWORD`: the shared secret configured in Vercel. Use this value in the
  API's bearer header; keep any local copy in the ignored `api/.env`.
- `GOOGLE_API_KEY`: configure in the project's Vercel production environment to
  enable direct Gemini chat.
- `LLM_MODEL=google:gemini-3.8-flash`.
- `HISTORY_BACKEND=blob` and `BLOB_STORE_ID=store_MqRrrdG6vZKHvwL4`.
- The connected **dsx-bu-student-chat** Blob store is private. Its automatically
  provisioned storage token or refreshed deployment OIDC supplies credentials;
  no database or public history URLs are used.

Each conversation remains JSON, now at `chat/<user>.json` inside the private
store. Reads bypass the Blob cache. Updates require the ETag from the read;
initial writes reject existing files. Same-instance requests serialize, and
competing instances return `409` rather than overwrite a newer conversation.
The app refuses to use local-file history when `VERCEL` is set.

Production relies on the application's shared bearer password. Preview builds
retain Vercel SSO protection. Vercel environment changes require a redeployment.

The project is connected to `gyraseisfortorsion/dsx-hackathon` on GitHub, with
**Root Directory `api`** and production branch **`main`**. Pushes to `main`
automatically build and deploy production through Vercel's Git integration.
Pushes to other branches create preview deployments. No separate CI workflow
or manual deployment command is required.

Optional model routing: `LLM_MODEL=vercel:google/gemini-3.8-flash` uses Pydantic AI's
Vercel AI Gateway provider with a fresh deployment OIDC token per turn. Gateway
requires model access/credits; the account's free tier currently blocks this
Gemini model, so production uses the direct Google provider. Local `.env.local`
is loaded for Vercel development credentials, ahead of `.env` without overwriting
existing environment values.

```bash
uv run pytest -q
uv run ruff check .
uv run python scripts/generate_fixtures.py
```

Tests use Pydantic AI `TestModel`/`FunctionModel` with real model requests disabled
and mocked HTTP for search. They cover all routes' password/user validation,
fixture consistency, calendar holidays and DST, search cache/failures/citations,
chat isolation, restart memory, per-user concurrency, timeout/failure rollback,
and atomic JSON persistence. No provider key is needed to run them.

## Event discovery and personalization

See [EVENTS_API.md](EVENTS_API.md) for the iOS request/response contract, preferences,
saved/hidden events, general browsing, personalized search, clustering, and chat cards.
The implementation uses 247 real Terrier Central events, an offline TF–IDF artifact,
and separate durable preferences for the five mock students. It does not require
an LLM key outside chat. Source and build artifacts are bundled; requests do not
fit models or refresh the feed. These changes require deployment before they are
available at the production URL above.

## Campus services backend

[Campus services API](SERVICES_API.md) documents persistent prototype chats,
clubs, housing requests/photos, work/timesheets, dining transactions, calendar
extras, settings/profile edits and menu resources. These endpoints are ready for
frontend integration; they do not connect to official BU service systems.


## Request routing

The API includes a bundled local Model2Vec encoder and trained logistic regression
classifier for 10 student support queues. `POST /requests/route?user=alex` accepts
`{"text":"I need an official academic transcript"}` with the existing bearer password.
`GET /requests/departments?user=alex` lists the supported offices. The assistant can
call the routing tool and returns structured routing cards in `ChatMessage.routing`.
The model suggests an office or requests clarification; it never submits a ticket.

See the [pipeline, metrics, rebuild commands, and limitations](../research/request-routing/README.md).
Artifacts are bundled under `data/request_router`; serving requires no download or
training. Missing artifacts return 503 for routing while other services still start.
The routing labels and evaluation are synthetic-only and need human validation.
