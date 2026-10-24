# Kiro usage and evidence

This directory records Kiro-assisted work on the event auto-tagging feature.
It is documentation of the development process, not a claim that every planned
item in the specs has been implemented.

## Workflow

1. **Specify:** Kiro produced and iteratively revised
   [requirements](specs/event-tag-classifier/requirements.md),
   [design](specs/event-tag-classifier/design.md), and
   [tasks](specs/event-tag-classifier/tasks.md). Revisions addressed multi-label
   behavior, score interpretation, human labeling, leakage prevention, API
   integration, and deployment constraints.
2. **Implement:** Kiro implemented the fixed taxonomy, normalization, keyword
   baseline, tag contract, offline tagging, API integration, and labeling scaffold.
3. **Consolidate:** After the team added event discovery independently, Kiro
   compared implementations and retained the team's EventService, catalog, and
   preferences. The final increment adds tags rather than another recommender.
4. **Verify:** Kiro added functional tests and reported a final run of 147 passing
   backend tests and a clean Ruff check for checkpoint `8370ca4`. These are
   development-time results, not a live CI badge or model-quality measurements.

## Evidence in this repository

| Contribution | Files |
| --- | --- |
| Versioned taxonomy and baseline | [event_tags package](../api/bu_api/event_tags/) |
| Tag fields and per-user overrides | [schemas](../api/bu_api/schemas.py), [events](../api/bu_api/events.py), [preferences](../api/bu_api/preferences.py) |
| Suggestion and correction endpoints | [event routes](../api/bu_api/event_routes.py) |
| Offline artifact tagging | [tag_events.py](../api/scripts/tag_events.py), [build_events.py](../api/scripts/build_events.py) |
| Human-labeling scaffold | [build_labeling.py](../api/scripts/build_labeling.py), [labeling instructions](../api/labeling/README.md) |
| Functional tests | [test_event_tags.py](../api/tests/test_event_tags.py) |

To reproduce checks, follow `api/README.md` and run from `api/`:

```sh
uv sync --frozen
uv run pytest -q
uv run ruff check .
```

## Scope and honest limitations

- Auto-tagging is currently keyword-based. Supervised training and quality
  evaluation remain planned work awaiting reviewed labels.
- The existing TF-IDF/cosine recommendation service and K-means build were already
  present in the team's base branch. We do not attribute their original
  implementation to this Kiro auto-tagging increment.
- Corrections are personal to a demo user, not organizer-wide edits. The API may
  retain the legacy source value `organizer`; that value is provenance metadata,
  not proof of an authenticated organizer role.
- No improvement to recommendation ranking, frontend tag UI, or production
  deployment is claimed by this increment.
- Specs include historical and future tasks. For current implemented behavior,
  use the code and root README rather than interpreting every checked historical
  task as a feature of the final branch.
- We do not claim Kiro hooks, steering, MCP, Powers, or property-based testing
  were used unless separately documented by the team.

Runtime secrets and service settings are excluded. The substantive spec files
are intentionally committed for review.
