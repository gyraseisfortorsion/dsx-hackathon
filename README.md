# BU Campus Companion

A hackathon prototype that brings student information and campus event discovery
into one API. Student profiles, enrollments, balances, attendance, and grades are
fictional demo records. The event catalog contains 247 events from a public BU
Terrier Central calendar snapshot.

## Run and explore

- [Backend setup and configuration](api/README.md)
- [Event discovery and personalization API](api/EVENTS_API.md)
- [Mobile app (Expo / React Native)](app/README.md)
- [Dataset sources and limitations](research/README.md)
- [Event labeling instructions](api/labeling/README.md)

## How we used Kiro

We used Kiro for spec-driven development of the event auto-tagging feature.
The process included iterating on requirements, design, and tasks; implementing
a fixed taxonomy and keyword baseline; integrating tag suggestions and corrections
with the existing FastAPI event service; and writing and running automated tests
and lint checks. Kiro also helped compare parallel implementations, preserve a
checkpoint, and consolidate the feature around the team's existing event catalog
instead of shipping a second recommendation system.

The committed [Kiro specs](.kiro/specs/event-tag-classifier/) document this work.
See the [Kiro usage and evidence guide](.kiro/README.md) for implementation links,
scope, and limitations. We used Kiro's specification and coding workflow; we do
not claim use of hooks, MCP integrations, or other capabilities without evidence.

## Auto-tagging

The auto-tagging feature adds 14 fixed tags across topic, format, and
other facets. The offline build retains all 247 event IDs. The baseline assigns
at least one tag to 131 events; 116 have no tags above its threshold. Empty tag
sets are valid, and events remain discoverable.

- `GET /events/{id}/tags/suggest` returns suggested tags and their scores.
- `PUT /events/{id}/tags` saves a per-demo-user correction, including an explicitly
  empty set, which takes precedence in that user's event cards.
- Existing bearer authorization and the `user` query parameter apply. The shared
  demo password does not establish an organizer role; corrections are not global.
- Fixed tag metadata is included in event cards. The existing recommendation
  scoring formula is unchanged, and frontend display of these tags is not included.

## Evaluation and limitations

Event discovery uses TF-IDF/cosine similarity and exploratory K-means clusters.
Auto-tagging currently uses a keyword/rule baseline, not a trained supervised
classifier. A labeling scaffold is provided, but human annotation, logistic
regression training, held-out tag evaluation, and latency benchmarking are not
complete. We do not claim measured tag accuracy or improved recommendation
quality. Automated functional tests are not a substitute for relevance evaluation.

The feature was developed in `feature/event-autotags` and integrated into `main`.
A source-code push does not establish that deployment succeeded. Submitted
repository/demo links must point to the version actually being presented.
