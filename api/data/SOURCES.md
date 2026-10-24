# Fixture sources and interpretation

Researched October 24, 2026. Academic fixtures use Fall 2026; dining plans use
the 2026–2027 comparison. `sources.json` lists the 20 official BU pages the agent
may fetch. Each catalog/program record also includes its source and research date.

## Public facts versus fictional records

- Course titles, codes, credits, section IDs, listed instructors, meeting times,
  and rooms were checked against the public BU Academics section tables.
- Names, BUIDs, enrollments, balances, attendance, assessment dates and scores are
  synthetic. Emails use the reserved `example.test` domain, not deliverable BU
  addresses. These records do not represent or identify real students.
- Enrollments include one lecture and its lab/discussion where applicable. CDS
  supplemental-section component labels are prototype interpretations of the
  published section structure; the public tables do not label each component.
  This is not an authoritative registration or degree-audit system.
- CS 611 and CS 630 catalog headings use **CAS**, while section notes and program
  pages use **GRS**. We preserve the public catalog headings and explain the
  discrepancy in section notes. Sam's master's enrollment respects the reserved
  section notes; Taylor's doctoral record uses CS 640/651.
- CS 111 Wednesday evenings and MA 123 Thursday evenings are reserved exam
  windows, not recurring classes. They are stored separately and used for one
  explicitly fictional midterm each. Final exam dates are fictional dates
  within BU's published December 14–18 exam period; rooms remain null.

## Meal balances

Use the explicitly year-labeled [2026–2027 comparison](https://www.bu.edu/dining/plans-points/)
for plan amounts and prices. Its Kosher allowance is **$410**, while an older
paragraph on the [FAQ](https://www.bu.edu/dining/plans-points/faqs/) still says
$350. The comparison is the fixture's source of truth for this academic year.

- One Dining Point equals one dollar; API money fields are integer USD cents.
- Open Access is unlimited. The card system's daily technical reload of 20
  described in the FAQ is not a 20-meal daily plan allowance.
- Weekly 10+ and Kosher swipes reset before Friday breakfast without rollover.
- Residential plans include ten guest meals per semester; Connector plans have none.
- Dining Points carry from fall to spring. Unused Connector meals and included
  Dining Points expire at academic-year end. We do not simulate refund rules.
- [Convenience Points](https://www.bu.edu/housing/living/dining/convenience/)
  are separate, support non-dining purchases, and carry between academic years.
- Snapshot balances never change automatically. Weekly period boundaries describe
  the October 24 snapshot, not the machine's current date. Semester meal service
  starts August 28; Fall classes start September 2.

## Academic calendar

The [registrar calendar](https://www.bu.edu/reg/calendars/semester/) provides
September 2–December 10 classes; September 7 and October 12 holidays;
October 13's substitute Monday schedule; November 25–29 Thanksgiving recess;
and December 14–18 final exams. `zoneinfo` expands meetings in
`America/New_York`, preserving wall-clock times across the November 1 DST change.

Attendance covers completed class meetings only, through October 24 at noon.
`current_percentage` is an **unweighted mock points percentage**, not an official
course grade: sum of scores divided by possible points for graded/missing work.
Missing work scores zero; future and submitted-but-ungraded work have null scores
and do not enter the denominator. No institutional GPA or grading curve is inferred.

## Search feasibility

Inspection of `https://search.bu.edu/?q=meal%20plan` and its referenced
`/static/gen/home.js` found browser requests to `POST /search/` with form fields
`q`, `filter`, `source=web`, `site`, `multisite`, `start`, `counter`, and a CAPTCHA
`token`. A tokenless direct request returned an error fragment. The old form
action `/phpbin/search/index.php` returned a not-found page.

The agreed prototype therefore fetches and searches only `sources.json` pages.
It does not automate CAPTCHA handling, access protected BU services, or claim
whole-site search coverage. The 15-minute cache is in memory and resets with the
process. No search subscription, embeddings, or persistent search index is used.

## Rebuilding

From `api/`, run `uv run python scripts/generate_fixtures.py` to reproduce the
committed JSON fixtures without network access. The script contains the verified
snapshot values; changes to live BU pages do not silently modify the demo.
