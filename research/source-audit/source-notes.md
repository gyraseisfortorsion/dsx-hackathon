# Hackathon source feasibility — checked October 24, 2026

Purpose: choose a defensible data-science feature for a campus super-app. Events,
personal balances, and other integrations may remain explicitly mocked. This is
a source inventory and design assessment, not a fitted recommendation model or
an impact evaluation.

## Downloaded and inspected

| File/source | Verified coverage | Grain and caveats |
| --- | --- | --- |
| `om2023.zip` | 47,342 rows; 3,626 institutions; 54 columns | Unique `UNITID, OMCHRT` pairs. Overlapping cohort totals and Pell subcohorts must not be added together. Entrants are from 2015–16, with award status at 2019, 2021, and 2023. |
| `ipeds-hd2024.zip` | 6,072 institutions; 72 columns | National directory, despite the library's Massachusetts label. BU `UNITID=164988`. |
| `ipeds-ic2024.zip` | 5,963 institutions; 111 columns | Service-availability indicators and athletic associations. Service presence does not measure service usage, quality, hours, or impact. Sports fields do not measure students' recreational participation. |
| `scorecard.zip` | 6,278 institutional rows; 3,379 columns; 140 Massachusetts rows | Main CSV inspected; ignored the archive's macOS resource-fork file. Different measures refer to different populations and years. Fields include `UGDS`, `PPTUG_EF`, `PCTPELL`, retention, completion, cost, debt, and earnings. |
| `massgis.json`, `massgis-full.json` | 204 campus points; 182 with `NCES_ID` | Campus points are not necessarily unique universities. The library query omits `NCES_ID`; the additional query requests it. No within-campus building or pedestrian-routing network is established. |
| `openalex.json` | 25 returned works; API reports 73,338 matching 2024 works across the supplied institution IDs | The library labels this as 500 works/a ZIP, but it is a paginated JSON query. Total is the API response at retrieval, not a downloaded corpus. |
| `openalex-bu-works.json` | 25 sampled works; API reports 9,493 BU-affiliated 2024 works | BU OpenAlex ID `I111088046`. All 25 sampled works have topics; 21 have abstracts. Coverage in this sample is not a population estimate. Papers are not internship or lab-vacancy listings. |

The HD–IC ID intersection is 5,963; HD–Scorecard is 5,735. An inner join would
therefore remove institutional records; retain unmatched records and examine
scope/year differences before combining.

## Outcome Measures definitions

The official `om2023-dictionary.zip` documents `OMACHRT` (adjusted cohort),
`OMAWDN4/6/8` (award counts), and `OMAWDP4/6/8` (reported percentages).
`OMCHRT` codes 10/20/30/40 identify first-time/full-time,
first-time/part-time, non-first-time/full-time, non-first-time/part-time;
11/12 etc. split Pell/non-Pell. Codes 50/51/52 are overlapping total summaries.
Use mutually exclusive cells and the appropriate denominators. Recompute rates
from counts when appropriate rather than averaging rounded percentages.
Unknown enrollment status is not confirmed dropout.

The exact OM2024 URLs tried returned 404; the verified raw OM file is 2023.
This does not establish that newer data are unavailable through all NCES tools.

## Documentation inspected, without protected data access

- NSSE: the supplied destination is a codebook directory. Its survey covers
  grades, co-curricular time, study/work/commute time, belonging, faculty contact,
  and intention to return. This is a strong conceptual fit, but no authorized
  respondent file was located. Institutional/consortium access is governed;
  do not assume the codebook is the data.
- BU Course Catalog: the shared guide describes courses, sections, meetings,
  and terms with read-only, temporary BU-authenticated access. No connection
  was made and no record count was established.
- BU transit/dining: `bu-openapi.json` is an actual accessible schema from
  https://public.api-nonprod.bu.edu/openapi.json. Its real paths begin
  `/api/v1/`; these differ from the guide's illustrative paths. Dining schemas
  include item nutrition, diet flags, schedules, and three location IDs.
  Transit schemas include route/stops, vehicles, arrivals, and freshness flags.
  A dining-location request without credentials returned 401. The schema is
  not proof of populated data, nutritional completeness, or historical coverage.
  Its license says BU Internal Use Only; follow the event's access terms.

## Design implications

1. Event recommendations: interest-based retrieval and ranking using real
   respondent preferences, user availability, and a tagged mock catalog.
   Evaluate ranked relevance on independent human judgments. Cluster quality
   alone is not recommendation quality; no attendance-lift claim is established.
2. Campus support planning: cohort outcomes plus comparable-institution matching
   can reveal historical disparities and benchmark gaps. Show uncertainty,
   cohort sizes, and dates. Mapping a gap to a service is a designed policy,
   not a learned causal benefit. Keep this administrator-facing or explicitly
   contextual; do not assign individual failure probabilities from campus rates.
3. Research discovery: OpenAlex titles/topics/available abstracts support
   TF-IDF or embedding retrieval by self-declared interests. Evaluate precision
   at five against keyword search with human relevance labels.
4. Course discovery/scheduling: conditional on BU catalog access, recommend
   relevant courses and optimize schedules with time/conflict constraints.
   Prerequisites, capacity, and degree requirements require verified fields.
5. Dining or daily-plan optimization: conditional on BU API data access,
   use constrained optimization with chosen dietary preferences, availability,
   and travel estimates. Treat missing nutrition as unknown, distinguish stale
   data, and do not guarantee allergy safety. Optimization alone may not meet
   the DS rubric: pair it with substantive data analysis and baseline evaluation.

## Evidence and reproducibility

Original URLs, request status, and inventory metadata are in `audit.json` and
`audit-followup.json`; these retain failed requests as well as successes.
Run `python3 profile_downloads.py` to reproduce the local inventory into
`verified-profile.json`. No keys or protected student data were downloaded.

Primary source links:

- https://library.bu.edu/dsxhackathon/college
- https://nces.ed.gov/ipeds/survey-components/11
- https://nces.ed.gov/ipeds/datacenter/data/om2023.zip
- https://nces.ed.gov/ipeds/datacenter/data/om2023_dict.zip
- https://nces.ed.gov/ipeds/datacenter/data/HD2024.zip
- https://nces.ed.gov/ipeds/datacenter/data/IC2024.zip
- https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_10152026.zip
- https://collegescorecard.ed.gov/files/InstitutionDataDocumentation.pdf
- https://www.mass.gov/info-details/massgis-data-colleges-and-universities
- https://nsse.indiana.edu/nsse/working-with-nsse-data/data-codebooks/index.html
- https://nsse.indiana.edu/nsse/survey-instruments/old%20versions%20of%20core/nsse-2023-us-english.html
- https://nsse.indiana.edu/nsse/administering-nsse/customizing-nsse/consortia.html
- https://public.api-nonprod.bu.edu/docs
- https://openalex.org
