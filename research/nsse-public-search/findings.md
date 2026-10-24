# Public NSSE respondent data search — October 24, 2026

Result: official respondent-level sample files are publicly downloadable, but
they are small examples. No substantial openly downloadable real-response NSSE
dataset was verified in this search. This is a bounded search result, not proof
that no public extract exists anywhere.

## Verified downloads

Source page: https://nsse.indiana.edu/nsse/reports-data/data-files.html

- US: https://nsse.indiana.edu/nsse/reports-data/nsse25-sample-data-us.zip
  - Archive contains `NSSE25 Sample Data (US).sav`.
  - Parsed successfully with pyreadstat: 13 rows, 255 columns.
  - Grades: 11 nonmissing responses; intention to return: 0 nonmissing.
  - Belonging items, co-curricular time, work time, commute time, and faculty
    interaction fields are present.
- Canada: https://nsse.indiana.edu/nsse/reports-data/nsse25-sample-data-canada.zip
  - Archive contains `NSSE25 Sample Data (Canada).sav`.
  - Parsed successfully: 15 rows, 248 columns.

Neither archive included a README. The inspected SPSS file metadata had no
file label or notes identifying whether the rows were actual, altered, or
simulated responses. Describe these as official sample data, not verified
anonymized real-response samples. Do not assume the two examples are independent.

`sample-profile.json` records selected US variables and completeness counts;
`variable-dictionary.json` contains column labels. No individual records,
identifiers, or sensitive demographic responses are displayed in the findings.

## Other reviewed destinations

- Colorado State: https://www.ir.colostate.edu/nsse/
  Public Excel/PDF reports include means, frequencies, comparisons, and
  respondent characteristics; these are summaries rather than a verified
  respondent-level matrix.
- Ohio University: https://www.ohio.edu/iea/student-data/nsse
  Public dashboard and summary reports, not a verified individual response file.
- Mendeley: https://data.mendeley.com/datasets/bnft2dr82d/1
  A Colombian NSSE research supplement; the listed file is a DOCX containing
  analytical results, not a respondent dataset.
- Frontiers study:
  https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2023.1305747/full
  Its data availability statement directs requests to Indiana University's
  Center for Postsecondary Research; no open respondent download was verified.
- Official full-file description: NSSE delivers processed respondent data to
  participating institutions through its Institution Interface.

Searches included official NSSE data/download pages, university report pages,
and indexed repository/research-supplement leads for GitHub, OSF, Dataverse,
Zenodo, Figshare, and Mendeley. No permission gates were bypassed and no
requests or messages were sent to people.

## Consequence for the hackathon

The sample files can help establish fields, encoding, and prototype inputs.
Their small size is not a sound basis for a generalizable clustering model or
claims linking engagement to student outcomes. A substantial NSSE model still
requires an authorized larger extract. Public aggregate reports can support
aggregate comparisons but do not reconstruct joint individual responses.
