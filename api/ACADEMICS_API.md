# Academic planning API

The academic API is a versioned, per-student backend for syllabus review, grade planning,
workload forecasting, weekly study plans, recovery plans, prerequisite checks, and cited
assistant answers. It uses the same bearer password and required `user` query parameter as
the rest of the service.

Academic writes include the latest `version`. A successful write increments the version;
stale writes return `409`. Local development stores state under `runtime/academic/`. Vercel
uses the existing private Blob store under `academic/<user>.json` with conditional writes.

## Syllabi and retrieval

`POST /academic/courses/{course_id}/syllabi` accepts plain text or a base64-encoded PDF.
Text is split into page-aware passages. The parser proposes assessments, grading weights,
attendance rules, late-work rules, and prerequisites. Candidates remain pending until they
are accepted or rejected through `PUT /academic/syllabi/{id}/review`; accepted candidates
become planner records through `POST /academic/syllabi/{id}/commit`.

The review response labels candidates from later revisions as `new`, `changed`, or
`unchanged`. Committing a revision supersedes the previous syllabus and replaces its derived
records while retaining matching grades and tasks.

`GET /academic/search?q=...&course_id=...` performs hybrid semantic and keyword retrieval.
It uses the repository's bundled Model2Vec encoder and calculates cosine similarity in
memory. Passages and metadata remain in the student's normal academic state; there is no
vector database or external embedding service. Results include syllabus, page, passage,
score, and retrieval method.

## Dashboard and planner

- `GET /academic/dashboard` returns today's classes, courses, credits, upcoming and overdue
  work, pending review count, and committed study blocks.
- `GET /academic/calendar?from=...&to=...` returns classes, assessments, and study blocks.
- `POST /academic/assessments/{id}/breakdown` creates dependency-ordered subtasks.
- `PUT /academic/availability` saves recurring study windows and a daily workload limit.
- `GET /academic/workload?from=...&to=...` compares required effort with capacity before
  each deadline. Scheduled classes reduce available capacity.
- `POST /academic/plans/preview` and `POST /academic/recovery/preview` allocate unfinished
  tasks into available time without saving changes.
- `POST /academic/plans/commit` saves a current preview. Blocks cannot overlap classes or
  other saved blocks.

## Grades and prerequisites

- `PUT /academic/courses/{id}/grading-scheme` supports points or weighted categories,
  optional drop-lowest counts, and grade thresholds.
- `PUT /academic/assessments/{id}/score` records assessment results.
- `GET /academic/courses/{id}/grades` calculates the current grade using decimal arithmetic.
- `POST /academic/courses/{id}/grade-scenarios` evaluates hypothetical scores and computes
  the score needed on a single remaining assessment when possible.
- `PUT /academic/completed-courses` records the student's evidence for prerequisite checks.
- `PUT /academic/courses/{id}/prerequisites` stores a reviewed AND/OR prerequisite rule.
- `GET /academic/courses/{id}/prerequisite-check` returns `met`, `not_met`, or `unknown`.

## Assistant integration

The existing `/chat` agent can retrieve the dashboard, search syllabus passages, calculate
grades and scenarios, evaluate prerequisites, and preview normal or recovery study plans.
Syllabus retrieval produces structured `academic_citations` on the assistant message. Chat
tools are read-only: plans and extracted candidates still require explicit API commits.

PDFs must contain extractable text and are limited to 8 MB. Image-only scans return a
validation error rather than silently inventing content.
