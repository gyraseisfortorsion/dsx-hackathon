# Open datasets from the CollegeHack spreadsheet

Retrieved October 24, 2026. The source worksheet lists 33 sources; several are directories, dashboards, licensed services, or reference documents rather than downloadable datasets.

[Source worksheet](https://docs.google.com/spreadsheets/d/1RaA6ecNuExAW98tWhhlHTUMMjdj5xp6fN3RgJL7e9Qk/edit?gid=806827996). A snapshot including links is saved in `source-sheet.json`.

Existing validated datasets remain in `../source-audit` and `../nsse-public-search`; the manifest references them without making duplicate copies.

Large sources use explicit subsets: Bluebikes is one latest available month; OSM is the central BU campus area; MassDOT is Boston in 2024; OpenAlex is the pre-existing BU research sample. These are not complete global or historical archives.

| Source | Result | Data files | Coverage / limitation |
| --- | --- | ---: | --- |
| [IPEDS complete data files](https://nces.ed.gov/ipeds/use-the-data) | existing_data | 3 | Existing selected files; see source-audit/source-notes.md and nsse-public-search/findings.md for coverage and provenance. |
| [College Scorecard](https://collegescorecard.ed.gov/data/) | existing_data | 1 | Existing selected files; see source-audit/source-notes.md and nsse-public-search/findings.md for coverage and provenance. |
| [Massachusetts E2C Hub](https://www.mass.gov/info-details/e2c-hub-directory-of-datasets-and-reports) | unavailable | 0 | Direct downloadable data links from the supplied source page, if exposed (up to five files). Directory/dashboard HTML is documentation, not data. Request errors: HTTP Error 403: Forbidden |
| [NSSE public displays](https://nsse.indiana.edu/nsse/reports-data/data-displays.html) | existing_data | 2 | Existing selected files; see source-audit/source-notes.md and nsse-public-search/findings.md for coverage and provenance. |
| [OpenAlex](https://docs.openalex.org/) | existing_data | 2 | Existing selected files; see source-audit/source-notes.md and nsse-public-search/findings.md for coverage and provenance. |
| [MassGIS colleges and universities](https://www.mass.gov/info-details/massgis-data-colleges-and-universities) | existing_data | 1 | Existing selected files; see source-audit/source-notes.md and nsse-public-search/findings.md for coverage and provenance. |
| [O*NET database](https://www.onetcenter.org/database.html) | downloaded | 1 | Full current O*NET database in the Excel ZIP linked from its official download page. |
| [BLS OEWS](https://www.bls.gov/oes/tables.htm) | unavailable | 0 | Latest downloadable OEWS file linked on the official tables page. Request errors: HTTP Error 403: Forbidden |
| [MA public higher education performance](https://www.mass.edu/datacenter/PMRS/home.asp) | reference_only | 0 | Direct downloadable data links from the supplied source page, if exposed (up to five files). Directory/dashboard HTML is documentation, not data. |
| [MA college and career outcomes](https://www.mass.gov/info-details/massachusetts-college-and-career-outcomes-dashboard) | unavailable | 0 | Direct downloadable data links from the supplied source page, if exposed (up to five files). Directory/dashboard HTML is documentation, not data. Request errors: HTTP Error 403: Forbidden |
| [American Community Survey](https://data.census.gov/) | reference_only | 0 | 2024 ACS 5-year, all Massachusetts counties; population, education, median household income, commuting denominator. Estimates only; not full ACS. Request errors: Expecting value: line 1 column 1 (char 0) |
| [College Navigator](https://nces.ed.gov/collegenavigator/) | existing_data | 2 | Existing selected files; see source-audit/source-notes.md and nsse-public-search/findings.md for coverage and provenance. |
| [U.S. News rankings](https://www.usnews.com/best-colleges/rankings) | restricted_or_no_bulk_export | 0 | Source link retained; no licensed data or unapproved scraping downloaded. |
| [Times Higher Education rankings](https://www.timeshighereducation.com/world-university-rankings) | restricted_or_no_bulk_export | 0 | Source link retained; no licensed data or unapproved scraping downloaded. |
| [QS subject rankings](https://www.topuniversities.com/subject-rankings) | restricted_or_no_bulk_export | 0 | Source link retained; no licensed data or unapproved scraping downloaded. |
| [ShanghaiRanking ARWU](https://www.shanghairanking.com/rankings/arwu/2026) | restricted_or_no_bulk_export | 0 | Source link retained; no licensed data or unapproved scraping downloaded. |
| [Web of Science API](https://developer.clarivate.com/apis/wos) | restricted_or_no_bulk_export | 0 | Source link retained; no licensed data or unapproved scraping downloaded. |
| [Google Scholar](https://scholar.google.com/) | restricted_or_no_bulk_export | 0 | Source link retained; no licensed data or unapproved scraping downloaded. |
| [Bluebikes system data](https://bluebikes.com/system-data) | downloaded | 2 | Latest monthly trip ZIP present in the official bucket listing at retrieval, plus the linked station CSV. Not the complete history. |
| [Cambridge Broadway Eco-Totem](https://data.cambridgema.gov/Transportation/Eco-Totem-Broadway-Bicycle-Count/q8v9-mcfg) | downloaded | 1 | Complete CSV export of the linked Socrata dataset at retrieval time. |
| [Cambridge Fresh Pond usership](https://data.cambridgema.gov/dataset/Fresh-Pond-Reservation-Usership/6xy8-cstb/about_data) | downloaded | 1 | Complete CSV export of the linked Socrata dataset at retrieval time. |
| [Cambridge citywide bicycle counts](https://data.cambridgema.gov/Transportation/Citywide-Bicycle-Counts/ijm6-q7em/about_data) | downloaded | 1 | Complete CSV export of the linked Socrata dataset at retrieval time. |
| [Boston bicycle count dashboard](https://www.arcgis.com/apps/dashboards/3491f78e46a545fe8186ad70ebe897aa) | downloaded | 4 | Bounded feature-layer snapshots from the dashboard webmap: three layers are partial API-limited samples (1,000 / 1,000 / 2,000 features), one layer has 145 features. See per-file complete flags. |
| [Boston Numina multimodal sensors](https://data.boston.gov/dataset/numina-sensor-measurement-of-multimodal-activity-and-shared-streets) | downloaded | 9 | CKAN metadata and any publicly exposed datastore records; original CSV download errors are retained. |
| [MassDOT count dashboard](https://mhd.ms2soft.com/tdms.ui/nmds/dashboard?loc=mhd) | unavailable | 0 | Direct downloadable data links from the supplied source page, if exposed (up to five files). Directory/dashboard HTML is documentation, not data. Request errors: HTTP Error 403: Forbidden |
| [Boston MPO bike/ped counts](https://bostonmpo.org/geoserver/www/apps/bp-counts-app-01262024/index.html) | downloaded | 1 | Direct downloadable data links from the supplied source page, if exposed (up to five files). Directory/dashboard HTML is documentation, not data. |
| [Somerville bicycle & pedestrian counts](https://data.somervillema.gov/Transportation-Mobility/Bicycle-Pedestrian-Counts/qu9x-4xq5/about_data) | downloaded | 1 | Complete CSV export of the linked Socrata dataset at retrieval time. |
| [Boston Vision Zero crash records](https://data.boston.gov/dataset/vision-zero-crash-records) | downloaded | 1 | CKAN metadata and any publicly exposed datastore records; original CSV download errors are retained. |
| [MassDOT statewide crash data](https://apps.crashdata.dot.mass.gov/cdp/home) | downloaded | 4 | Complete Boston subset of the official MassDOT 2024 crash layer, verified against returnCountOnly. Not the statewide archive. |
| [Cambridge police crash data](https://data.cambridgema.gov/Public-Safety/Police-Department-Crash-Data-Updated/gb5w-yva3/about_data) | downloaded | 1 | Complete CSV export of the linked Socrata dataset at retrieval time. |
| [OpenStreetMap](https://www.openstreetmap.org/) | downloaded | 1 | BU central-campus bounding box only (-71.113,42.345,-71.096,42.355); ODbL, attribute OpenStreetMap contributors. |
| [Boston Cyclists Union data explainer](https://bostoncyclistsunion.org/how-does-boston-know-when-and-where-people-are-biking) | reference_only | 0 | Direct downloadable data links from the supplied source page, if exposed (up to five files). Directory/dashboard HTML is documentation, not data. |
| [Massachusetts crash data background](https://docs.google.com/document/d/1uXopTPMfoXXUVYxw3qVNQyWBeCKVfKLmRSZtwE6gJOc/edit) | reference_document | 0 |  |

## Local files and row counts

### IPEDS complete data files

- [source-audit/ipeds-hd2024.zip](../source-audit/ipeds-hd2024.zip)
- [source-audit/ipeds-ic2024.zip](../source-audit/ipeds-ic2024.zip)
- [source-audit/om2023.zip](../source-audit/om2023.zip)

### College Scorecard

- [source-audit/scorecard.zip](../source-audit/scorecard.zip)

### NSSE public displays

- [nsse-public-search/NSSE25 Sample Data (US).sav](../nsse-public-search/NSSE25 Sample Data (US).sav)
- [nsse-public-search/NSSE25 Sample Data (Canada).sav](../nsse-public-search/NSSE25 Sample Data (Canada).sav)

### OpenAlex

- [source-audit/openalex-bu-works.json](../source-audit/openalex-bu-works.json)
- [source-audit/openalex-bu-institution.json](../source-audit/openalex-bu-institution.json)

### MassGIS colleges and universities

- [source-audit/massgis-full.json](../source-audit/massgis-full.json)

### O*NET database

- [open-datasets/o-net-database/db_31_0_excel.zip](../open-datasets/o-net-database/db_31_0_excel.zip)

### College Navigator

- [source-audit/ipeds-hd2024.zip](../source-audit/ipeds-hd2024.zip)
- [source-audit/ipeds-ic2024.zip](../source-audit/ipeds-ic2024.zip)

### Bluebikes system data

- [open-datasets/bluebikes-system-data/202608-bluebikes-tripdata.zip](../open-datasets/bluebikes-system-data/202608-bluebikes-tripdata.zip)
- [open-datasets/bluebikes-system-data/station-list.csv](../open-datasets/bluebikes-system-data/station-list.csv) — 614 rows

### Cambridge Broadway Eco-Totem

- [open-datasets/cambridge-broadway-eco-totem/data.csv](../open-datasets/cambridge-broadway-eco-totem/data.csv) — 306,854 rows

### Cambridge Fresh Pond usership

- [open-datasets/cambridge-fresh-pond-usership/data.csv](../open-datasets/cambridge-fresh-pond-usership/data.csv) — 122,568 rows

### Cambridge citywide bicycle counts

- [open-datasets/cambridge-citywide-bicycle-counts/data.csv](../open-datasets/cambridge-citywide-bicycle-counts/data.csv) — 238,799 rows

### Boston bicycle count dashboard

- [open-datasets/boston-bicycle-count-dashboard/layer-0.geojson](../open-datasets/boston-bicycle-count-dashboard/layer-0.geojson) — 1,000 features (PARTIAL)
- [open-datasets/boston-bicycle-count-dashboard/layer-1.geojson](../open-datasets/boston-bicycle-count-dashboard/layer-1.geojson) — 145 features
- [open-datasets/boston-bicycle-count-dashboard/layer-2.geojson](../open-datasets/boston-bicycle-count-dashboard/layer-2.geojson) — 1,000 features (PARTIAL)
- [open-datasets/boston-bicycle-count-dashboard/layer-3.geojson](../open-datasets/boston-bicycle-count-dashboard/layer-3.geojson) — 2,000 features (PARTIAL)

### Boston Numina multimodal sensors

- [open-datasets/boston-numina-multimodal-sensors/546c819e-97fd-4d27-9757-5bba41f9fcb1.json](../open-datasets/boston-numina-multimodal-sensors/546c819e-97fd-4d27-9757-5bba41f9fcb1.json) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/c8e8bce9-382c-4798-bade-9233df8dde60.json](../open-datasets/boston-numina-multimodal-sensors/c8e8bce9-382c-4798-bade-9233df8dde60.json) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/784da106-da55-45a6-a0dd-554f81d1f602.json](../open-datasets/boston-numina-multimodal-sensors/784da106-da55-45a6-a0dd-554f81d1f602.json) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/b0b51080-55ef-46bd-84a2-f64e1ae9701e.json](../open-datasets/boston-numina-multimodal-sensors/b0b51080-55ef-46bd-84a2-f64e1ae9701e.json) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/d47f85e5-07f9-4c77-8471-5283d61c4645.json](../open-datasets/boston-numina-multimodal-sensors/d47f85e5-07f9-4c77-8471-5283d61c4645.json) — 35,400 rows
- [open-datasets/boston-numina-multimodal-sensors/d6c06150-418d-4705-b0c9-e92afd23ede7.json](../open-datasets/boston-numina-multimodal-sensors/d6c06150-418d-4705-b0c9-e92afd23ede7.json) — 35,400 rows
- [open-datasets/boston-numina-multimodal-sensors/371fe13a-258a-44fd-8455-6766be95cdbc.json](../open-datasets/boston-numina-multimodal-sensors/371fe13a-258a-44fd-8455-6766be95cdbc.json) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/77914b24-91bd-437f-9efa-8c8463c21a0b.json](../open-datasets/boston-numina-multimodal-sensors/77914b24-91bd-437f-9efa-8c8463c21a0b.json) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/f58dac33-8255-4274-862d-71f5a22b6f14.json](../open-datasets/boston-numina-multimodal-sensors/f58dac33-8255-4274-862d-71f5a22b6f14.json) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/546c819e-97fd-4d27-9757-5bba41f9fcb1.csv](../open-datasets/boston-numina-multimodal-sensors/546c819e-97fd-4d27-9757-5bba41f9fcb1.csv) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/c8e8bce9-382c-4798-bade-9233df8dde60.csv](../open-datasets/boston-numina-multimodal-sensors/c8e8bce9-382c-4798-bade-9233df8dde60.csv) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/784da106-da55-45a6-a0dd-554f81d1f602.csv](../open-datasets/boston-numina-multimodal-sensors/784da106-da55-45a6-a0dd-554f81d1f602.csv) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/b0b51080-55ef-46bd-84a2-f64e1ae9701e.csv](../open-datasets/boston-numina-multimodal-sensors/b0b51080-55ef-46bd-84a2-f64e1ae9701e.csv) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/d47f85e5-07f9-4c77-8471-5283d61c4645.csv](../open-datasets/boston-numina-multimodal-sensors/d47f85e5-07f9-4c77-8471-5283d61c4645.csv) — 35,400 rows
- [open-datasets/boston-numina-multimodal-sensors/d6c06150-418d-4705-b0c9-e92afd23ede7.csv](../open-datasets/boston-numina-multimodal-sensors/d6c06150-418d-4705-b0c9-e92afd23ede7.csv) — 35,400 rows
- [open-datasets/boston-numina-multimodal-sensors/371fe13a-258a-44fd-8455-6766be95cdbc.csv](../open-datasets/boston-numina-multimodal-sensors/371fe13a-258a-44fd-8455-6766be95cdbc.csv) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/77914b24-91bd-437f-9efa-8c8463c21a0b.csv](../open-datasets/boston-numina-multimodal-sensors/77914b24-91bd-437f-9efa-8c8463c21a0b.csv) — 24,965 rows
- [open-datasets/boston-numina-multimodal-sensors/f58dac33-8255-4274-862d-71f5a22b6f14.csv](../open-datasets/boston-numina-multimodal-sensors/f58dac33-8255-4274-862d-71f5a22b6f14.csv) — 24,965 rows

### Boston MPO bike/ped counts

- [open-datasets/boston-mpo-bike-ped-counts/bp_counts.csv](../open-datasets/boston-mpo-bike-ped-counts/bp_counts.csv) — 8,228 rows

### Somerville bicycle & pedestrian counts

- [open-datasets/somerville-bicycle-pedestrian-counts/data.csv](../open-datasets/somerville-bicycle-pedestrian-counts/data.csv) — 2,532 rows

### Boston Vision Zero crash records

- [open-datasets/boston-vision-zero-crash-records/e4bfe397-6bfc-49c5-9367-c879fac7401d.json](../open-datasets/boston-vision-zero-crash-records/e4bfe397-6bfc-49c5-9367-c879fac7401d.json) — 44,986 rows
- [open-datasets/boston-vision-zero-crash-records/e4bfe397-6bfc-49c5-9367-c879fac7401d.csv](../open-datasets/boston-vision-zero-crash-records/e4bfe397-6bfc-49c5-9367-c879fac7401d.csv) — 44,986 rows

### MassDOT statewide crash data

- [open-datasets/massdot-statewide-crash-data/boston-page-0.json](../open-datasets/massdot-statewide-crash-data/boston-page-0.json) — 2,000 rows
- [open-datasets/massdot-statewide-crash-data/boston-page-2000.json](../open-datasets/massdot-statewide-crash-data/boston-page-2000.json) — 2,000 rows
- [open-datasets/massdot-statewide-crash-data/boston-page-4000.json](../open-datasets/massdot-statewide-crash-data/boston-page-4000.json) — 1,692 rows
- [open-datasets/massdot-statewide-crash-data/boston-2024.csv](../open-datasets/massdot-statewide-crash-data/boston-2024.csv) — 5,692 rows

### Cambridge police crash data

- [open-datasets/cambridge-police-crash-data/data.csv](../open-datasets/cambridge-police-crash-data/data.csv) — 17,230 rows

### OpenStreetMap

- [open-datasets/openstreetmap/bu-central-campus.osm](../open-datasets/openstreetmap/bu-central-campus.osm)

## Verification and reproduction

`manifest.json` records URLs, byte sizes, SHA-256 hashes, row counts where available, scope and failed requests. ZIPs were checked for readable archives and CRC integrity; CSVs were parsed. Saved HTML and metadata are documentation and are not counted as observations. CKAN exports were paginated and checked against the API total. JSON files and their derived CSVs contain the same records; do not concatenate them.

Run from the project root:

```sh
python3 research/open-datasets/download.py
python3 research/open-datasets/supplement.py
python3 research/open-datasets/complete_exports.py
```

Network access is required. The Google Sheet snapshot and crash background document were retrieved through the connected Google Drive account; these snapshots are preserved locally. Data remains subject to the original source terms and attribution requirements. OSM requires attribution to OpenStreetMap contributors (ODbL). O*NET attribution and reuse details are included in its archive / source page.
