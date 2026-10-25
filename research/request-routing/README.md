# BU student request routing: data, trained model, and integration

Researched and implemented October 24, 2026. This prototype trains a local request
classifier and integrates suggestions into the API and mobile assistant. It does
not submit tickets and is not official BU routing policy.

## Run the complete pipeline

From `dsx-hackathon/api`:

```bash
uv sync --locked
uv run python scripts/build_request_data.py
uv run python scripts/train_request_router.py
uv run pytest
uv run uvicorn bu_api.main:app --reload
```

The trained artifacts are already included in `api/data/request_router/`, so normal
API startup requires no training, Hugging Face access, or encoder download. Rebuilding
requires internet access to the pinned public encoder revision. Keep the entire
artifact directory together; Vercel's existing `data/**` inclusion bundles it.
The encoder adds approximately 30 MB; inference uses Model2Vec and NumPy rather than
PyTorch or scikit-learn. Scikit-learn is required only for offline training/evaluation.

## Dataset and annotation

`requests_synthetic.jsonl` and `.csv` contain **300 newly authored synthetic
requests**, 30 per department, including the original 100 seeds and 200 expanded
examples authored in `scenarios.json`. Labels refer to `departments.json` and record
intent, evidence URLs, provenance, language, review status, and split. All labels
remain `needs_independent_human_review`; they were annotated by the assistant,
not BU staff. No live student data or external generation API was used.

`build_request_data.py` maps overlapping seed/expanded topics to **63 scenario
families** before deterministic per-department splitting with seed 42. There are
182 training requests (39 families), 62 development requests (12 families), and
56 test requests (12 families). Every split contains every department. Wording
variants of a family stay together. The data remains small and stylistically
correlated; these families are not independently collected student observations.

## Encoder, classifier, and evaluation

Text alone is encoded by frozen [Model2Vec potion-base-8M](https://huggingface.co/minishlab/potion-base-8M)
(256 dimensions), following its [inference API](https://minish.ai/packages/model2vec/inference/).
The immutable encoder revision is recorded in `evaluation.json` and the bundled
manifest. A multinomial logistic regression head trains on the train split only.
Development macro F1 selects C from 0.1, 1, 10, 100; selected C is 1. Development
also selects score/margin/similarity thresholds to maximize coverage subject to
at least 90% selective accuracy and at least five accepted development examples.
Nothing is refitted on test data.

| Synthetic held-out result | Value |
| --- | --- |
| Encoder + logistic regression macro F1 | 0.867 |
| TF–IDF + logistic regression macro F1, same grouped splits | 0.793 |
| Classifier-only accepted coverage | 34/56 (60.7%) |
| Classifier-only accuracy among accepted | 34/34 |
| Full router coverage, including context/boundary guards | 33/56 (58.9%) |
| Full router accuracy among routed requests | 33/33 |
| Documented boundary regression cases | 12/12 |

`evaluation.json` contains per-class precision/recall, the confusion matrix (in
`classes` order), individual predictions, versions, thresholds, data hash, and local
warm latency measurements. `embeddings.npz` stores vectors keyed by request ID.
The boundary examples directly informed the rules; passing them is a regression
check, **not independent boundary evaluation**. Neither perfect selective accuracy
on 33 synthetic examples nor the raw classifier score proves reliability on real
student requests. We do not claim campus-wide performance or calibrated confidence.

The serving head is exported as JSON weights and bias with NumPy reference vectors;
no pickle is loaded. The encoder's upstream model card and available license are
preserved with the weights. Missing or incompatible artifacts disable routing with
HTTP 503 while the rest of the API remains available.

## API and app behavior

Both endpoints use the existing bearer authorization and selected `user`:

```bash
curl -X POST 'http://localhost:8000/requests/route?user=alex' \
  -H "Authorization: Bearer $API_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"text":"I need an official academic transcript"}'
```

- `GET /requests/departments?user=alex`: queue definitions, boundaries, official links.
- `POST /requests/route?user=alex`: accepts `{ "text": "..." }`, 1–8000 characters.
  Returns `handling`, optional `department`, ranked `candidates`, `message`, model
  version and source. `submitted` is always false; `synthetic_only` is always true.
- Handling is `route`, `clarify`, `multiple_routes`, `out_of_scope`, or `urgent_bypass`.
  Only `route` supplies a chosen department. Candidate scores are uncalibrated model
  scores; rule-based candidates have null scores. Unknown/low-similarity, low-score,
  close alternatives and long requests trigger clarification. Undergraduate aid and
  leave suggestions require explicit undergraduate context.
- Guards cover known ambiguity, graduate aid/leave, prerequisite overrides, some
  unsupported services, known multi-office combinations, and immediate hazards.
  These limited rules cannot identify every emergency, multi-intent or unknown
  request. The router is not an emergency detection system.
- The chat agent has a `route_request` tool and instructions to call it for support
  routing. Its structured result is saved with the assistant response, shown as a
  mobile routing card, and includes official intake links. Older history without
  routing fields still loads. Normal schedule/event questions retain their existing
  flow. Chat still requires the configured LLM; the route endpoint works locally
  without an LLM. Read-only routing does not save the submitted text; chat continues
  to use the existing per-student history storage.
- No ticket is transmitted to BU or any department. This suggests the next office
  and official intake rather than implementing an institutional ticketing workflow.

## Before relying on real requests

Have two independent reviewers check labels and adjudicate disagreements. Collect
consented, de-identified real requests or independently authored scenarios for a new
final evaluation. Expand negative, multi-office, multilingual and urgent examples;
validate abstention and label boundaries with office staff. Current examples are
English and emphasize routine Charles River undergraduate services.

The original source research and seed limitations follow.

## Original source-linked seed files

- `departments.json`: 10 proposed routing queues, official BU source links,
  scope and exclusions. Queue IDs and label boundaries are our project design.
- `requests_seed.jsonl` and `requests_seed.csv`: the same 100 assistant-created
  synthetic requests (10 per queue). Each row has a proposed department label,
  intent, scenario group, evidence URLs, language, and review/provenance fields.
- `boundary_cases.jsonl`: 12 synthetic cases requiring clarification, multiple
  routes, an out-of-scope response, or urgent bypass instead of forced classification.

No real student messages, usernames, BUIDs, or ticket histories were collected.
Every request is newly authored; official FAQs supplied evidence about service
responsibilities, not proof that these exact requests were submitted by students.
Labels need independent human review; no BU office has validated this dataset.
The two requests in each scenario group are related variants, not independent
observations. There are 50 scenario groups, not 100 independent problem types.

## Initial taxonomy and verified support sources

| Queue ID | Support area | Official evidence |
| --- | --- | --- |
| registrar | Academic records, transcripts, enrollment verification | [Registrar contact and intake topics](https://www.bu.edu/reg/contact-us/), [FAQ](https://www.bu.edu/reg/students/faqs/) |
| financial_assistance | Undergraduate aid, missing awards, documents, appeals | [Financial Assistance](https://www.bu.edu/finaid/contact-us/), [missing-aid distinctions](https://www.bu.edu/studentfinancials/resources/frequently-asked-questions/) |
| student_financials | Posted bills/payments, account holds, late-fee review | [Student account](https://www.bu.edu/studentfinancials/your-bill/), [FAQ](https://www.bu.edu/studentfinancials/resources/frequently-asked-questions/) |
| housing | Ordinary room changes and assignment requests | [Room change requests](https://www.bu.edu/housing/assignments/changes/requests/), [changes and swaps](https://www.bu.edu/housing/assignments/changes/) |
| residential_maintenance | Residence repairs and maintenance intake | [Maintenance instructions](https://www.bu.edu/housing/services/maintenance/) |
| it_help | BU account access, login and connectivity problems | [IT help](https://www.bu.edu/tech/contact/), [eduroam help](https://www.bu.edu/tech/services/infrastructure/networks/wireless/eduroam/) |
| disability_access | Disability accommodation applications and reviews | [DAS procedures](https://www.bu.edu/disability/accommodations/procedures/), [DAS contact/intake](https://www.bu.edu/disability/about/), [housing boundary](https://www.bu.edu/housing/assignments/changes/requests/) |
| isso | Immigration-related student advising and travel documents | [ISSO role](https://www.bu.edu/isso/about/), [travel guidance](https://www.bu.edu/isso/international-students/traveling-while-at-bu/) |
| terrier_card | ID replacement and meal-plan/account questions | [Terrier Cards](https://www.bu.edu/housing/services/terriercards/), [meal-plan FAQ](https://www.bu.edu/dining/plans-points/faqs/) |
| university_service_center | General undergraduate leave/discontinuation guidance | [USC FAQ](https://www.bu.edu/usc/faqs/), [USC](https://www.bu.edu/usc/) |

Most seed scenarios target routine Charles River Campus undergraduate needs.
They do not cover all campuses, graduate programs, or offices. In particular,
graduate financial aid generally goes to the student's school/program, and leave
workflows depend on student/program context. FirstPoint is an existing front-door
service supporting Admissions, Financial Assistance and Registrar; avoid making it
an interchangeable competing class with its downstream offices. See
[FirstPoint](https://www.bu.edu/firstpoint/).

## Important routing distinctions

- Cannot register: an account hold is a Student Financials issue; a missing semester
  record can be Registrar; authentication is IT; prerequisite/academic permission
  may require the school/department. The phrase alone is insufficient.
- Missing scholarship: distinguish missing award/eligibility from account posting.
  Ask undergraduate/graduate status before assuming the undergraduate aid office.
- Dorm problem: ordinary assignment changes are Housing; disability accommodation
  review is DAS; physical repairs use maintenance intake. Routine residence requests
  may start at the residence office; furniture/appliances use My Housing. A queue
  label does not imply direct automatic submission to FMO.
- Meal-plan account issues can belong with Terrier Card Office; a technical login
  failure belongs with IT. Do not equate all dining feedback with card administration.
- Leave plus visa implications can legitimately involve USC and ISSO. Keep multiple
  needs or clarification rather than forcing one department.
- Immediate hazards must bypass ordinary administrative queues. The boundary file
  records the expected handling; it is not an emergency response system.

## What public request data exists?

The public Registrar, Student Financials, USC, Housing and Dining pages contain
student-facing questions and routing instructions. These are valuable scenario
sources. We did not locate a public BU historical dataset pairing incoming ticket
text with final responsible departments in the searches performed. BU's IT support
page links a ticket portal; that does not make underlying student tickets public.
No authenticated ticket systems were accessed.

Public student discussions can suggest realistic wording but should not be treated
as verified routing labels. This starter avoids copying personal forum posts and
uses official service definitions instead. An approved, de-identified internal
support export with final resolved queues would be a stronger future dataset.

## How to expand and evaluate

1. Have reviewers check both the label and its evidence. Mark disagreements as
   needs_clarification or revise the taxonomy, instead of assigning fake certainty.
2. Expand distinct situations and wording: informal requests, errors, spelling
   mistakes, short messages, overlapping issues, and requests outside the taxonomy.
   Do not inflate dataset size by creating hundreds of near-identical paraphrases.
3. Ask consenting students to write new scenarios independently of the seed and
   office labels. Have two reviewers label them and adjudicate disagreements.
   Keep this independently written material for final evaluation.
4. If making train/development/test splits of the seed, split by scenario_group,
   never by individual row. Keep variants together. Synthetic-only test results
   must be reported as synthetic-only, not campus routing performance.
5. Train a keyword baseline and TF–IDF + logistic regression using only `text` as
   input. Department ID is the target. Do not feed source URLs, provenance, intent,
   or scenario IDs to the classifier: they leak label information.
6. Compare macro F1, per-department recall, confusion matrix, and routing accuracy
   versus coverage when abstaining. Choose any threshold on held-out development
   data; a raw model score is not proven reliability on real requests.
7. Evaluate the boundary set separately: clarification, multiple routes, and unknown
   requests are part of the product, not ordinary mistakes to hide in accuracy.

The original 100 seeds alone were a baseline scaffold. The implementation above
expands them and trains a model; the dataset still lacks independent validation.
No external communication or ticket submission was added. Source links
establish routing rationale, not permission to redistribute BU website contents;
only newly authored examples and brief research descriptions are stored here.
