"""Offline build: uv run python scripts/build_events.py. No runtime ML dependencies."""

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import sklearn
from bs4 import BeautifulSoup
from icalendar import Calendar
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "research/events/raw/bu_events.ics"
OUTPUT = ROOT / "data/event_artifacts.json"


def clean(value):
    text = BeautifulSoup(str(value), "html.parser").get_text(" ", strip=True)
    text = re.split(r"---\s*Event Details:", text)[0]
    return re.sub(r"\s+", " ", text).strip()


def timestamp(value):
    if value is None:
        return None
    dt = value.dt
    if not isinstance(dt, datetime):
        dt = datetime.combine(dt, datetime.min.time(), ZoneInfo("America/New_York"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("America/New_York"))
    return dt.astimezone(UTC).isoformat()


def build():
    raw = SOURCE.read_bytes()
    events = {}
    for component in Calendar.from_ical(raw).walk("VEVENT"):
        if component.get("RRULE"):
            raise ValueError("Recurring rules require expansion before building")
        if str(component.get("STATUS", "")).upper() == "CANCELLED":
            continue
        uid = str(component["UID"])
        start = timestamp(component["DTSTART"])
        eid = hashlib.sha256(f"{uid}|{start}".encode()).hexdigest()[:24]
        categories = component.get("CATEGORIES")
        category_values = categories if isinstance(categories, list) else [categories]
        category = (
            ", ".join(str(c) for value in category_values if value for c in value.cats) or "Other"
        )
        url = str(component.get("URL", ""))
        if not url.startswith("https://terriercentral.bu.edu/"):
            raise ValueError("Unexpected event source URL")
        events[eid] = {
            "id": eid,
            "title": clean(component.get("SUMMARY", "")),
            "description": clean(component.get("DESCRIPTION", "")),
            "starts_at": start,
            "ends_at": timestamp(component.get("DTEND")),
            "location": clean(component.get("LOCATION", "")) or None,
            "source_url": url,
            "source_category": category,
        }
    records = sorted(events.values(), key=lambda e: (e["starts_at"], e["id"]))
    texts = [e["title"] + " " + e["description"] + " " + e["source_category"] for e in records]
    vectorizer = TfidfVectorizer(stop_words="english", sublinear_tf=True)
    matrix = vectorizer.fit_transform(texts)
    terms = vectorizer.get_feature_names_out()
    experiments = []
    for k in (4, 6, 8):
        model = KMeans(n_clusters=k, random_state=42, n_init=10).fit(matrix)
        metric = float(silhouette_score(matrix, model.labels_, metric="cosine"))
        experiments.append((metric, k, model))
    _, k, model = max(experiments, key=lambda x: x[0])
    clusters = {}
    for i, center in enumerate(model.cluster_centers_):
        top = [str(terms[j]) for j in center.argsort()[-5:][::-1]]
        clusters[f"cluster-{i}"] = {
            "id": f"cluster-{i}",
            "label": " / ".join(top[:3]),
            "top_terms": top,
            "reviewed": False,
        }
    vectors = {}
    for i, event in enumerate(records):
        event["cluster_id"] = f"cluster-{int(model.labels_[i])}"
        row = matrix.getrow(i)
        vectors[event["id"]] = {
            str(terms[j]): float(v) for j, v in zip(row.indices, row.data, strict=True)
        }
    source_hash = hashlib.sha256(raw).hexdigest()
    manifest = {
        "source_url": "https://terriercentral.bu.edu/ical/bostonu/ical_bostonu.ics",
        "source_sha256": source_hash,
        "built_at": datetime.now(UTC).isoformat(),
        "sklearn_version": sklearn.__version__,
        "seed": 42,
        "events": len(records),
        "unique_titles": len({e["title"] for e in records}),
        "selected_k": k,
        "clustering_experiments": [{"k": n, "cosine_silhouette": s} for s, n, _ in experiments],
        "limitations": (
            "Clusters are exploratory and unreviewed. No human relevance evaluation yet."
        ),
    }
    bundle = {
        "version": hashlib.sha256(
            (
                source_hash + json.dumps(manifest["clustering_experiments"]) + sklearn.__version__
            ).encode()
        ).hexdigest()[:16],
        "manifest": manifest,
        "events": records,
        "vectors": vectors,
        "idf": {str(t): float(w) for t, w in zip(terms, vectorizer.idf_, strict=True)},
        "clusters": clusters,
    }
    bundle["version"] = hashlib.sha256(
        json.dumps(
            {key: bundle[key] for key in ("events", "vectors", "idf", "clusters")},
            sort_keys=True,
        ).encode()
    ).hexdigest()[:16]
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(OUTPUT)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    build()
