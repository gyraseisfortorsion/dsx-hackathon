# DS+X CollegeHack research

Research for a Boston University campus companion: a unified student app with
personalized discovery of events and campus opportunities. Meal-plan balances,
events, and other integrations can be mocked for the prototype while its data
science component uses clearly attributed data.

The project structure reserves `../api/` for the backend and `../app/` for the
mobile app. Both contain only Git placeholders; implementation has not started.

## Research files

- [CollegeHack open datasets](open-datasets/README.md): source-sheet snapshot,
  additional downloaded datasets, coverage, row counts, source URLs, and download
  errors for all 33 sources on the supplied open-datasets worksheet.
- [Source assessment](source-audit/source-notes.md): verified dataset coverage,
  field definitions, access limitations, and possible data-science approaches.
- [Verified source inventory](source-audit/verified-profile.json): row counts,
  dimensions, and candidate-key checks.
- [Inventory script](source-audit/profile_downloads.py): reproduce the inventory
  from the downloaded public data, using the Python standard library.
- [Public NSSE search](nsse-public-search/findings.md): official sample files,
  inspected variables, and findings from the public-data search.
- [NSSE variable dictionary](nsse-public-search/variable-dictionary.json).

The source-audit directory also preserves downloaded archives, API responses,
and request audit logs. Some failed downloads are retained as evidence and are
identified in the audit logs; a `.zip` filename alone does not establish that
the response is a valid ZIP archive.

## Current data findings

- IPEDS and College Scorecard support institutional and cohort-level analysis.
- OpenAlex supports discovery of BU-affiliated research by interests.
- The official public NSSE samples are small examples, not a sufficient basis
  for generalizable student clustering or outcome claims. Their real-versus-
  simulated provenance was not established.
- BU catalog, dining, and transit access requires the authorized hackathon
  workflow. No protected student records or API credentials are included.

Dataset access does not transfer ownership. Preserve source attribution and
observe the original licenses and usage terms. Public documentation and example
data must not be presented as a verified BU student population.

## Hackathon references

- [Participant resource guide](https://docs.google.com/document/d/1kwfZWTHP8fj_bcB7FF2L3LMfoK9Xs9Dc7kiqKbRP1qE/edit)
- [CollegeHack data sources](https://library.bu.edu/dsxhackathon/college)

Research conducted October 24, 2026. No recommendation model or mobile/backend
implementation is included yet.
