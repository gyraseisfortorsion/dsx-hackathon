"""Train frozen Model2Vec embeddings + logistic regression, with grouped evaluation.

Run from api/: uv run python scripts/build_request_data.py
               uv run python scripts/train_request_router.py
"""

import hashlib
import json
import shutil
import sys
from pathlib import Path
from time import perf_counter

import model2vec
import numpy as np
import sklearn
from huggingface_hub import snapshot_download
from model2vec import StaticModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT.parent / "research/request-routing"
OUTPUT = ROOT / "data/request_router"
sys.path.insert(0, str(ROOT))


def metrics(y, prediction, labels):
    return dict(
        accuracy=accuracy_score(y, prediction),
        macro_f1=f1_score(y, prediction, labels=labels, average="macro", zero_division=0),
        per_department=classification_report(
            y, prediction, labels=labels, output_dict=True, zero_division=0
        ),
        confusion_matrix=confusion_matrix(y, prediction, labels=labels).tolist(),
    )


def train():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    raw = (RESEARCH / "requests_synthetic.jsonl").read_bytes()
    rows = [json.loads(line) for line in raw.splitlines()]
    indices = {
        s: [i for i, r in enumerate(rows) if r["split"] == s] for s in ("train", "dev", "test")
    }
    groups = {s: {rows[i]["scenario_group"] for i in ids} for s, ids in indices.items()}
    assert not (
        groups["train"] & groups["dev"]
        or groups["train"] & groups["test"]
        or groups["dev"] & groups["test"]
    )
    labels = sorted({r["department_id"] for r in rows})
    y = np.array([r["department_id"] for r in rows])
    texts = [r["text"] for r in rows]
    model_id = "minishlab/potion-base-8M"
    revision = "bf8b056651a2c21b8d2565580b8569da283cab23"
    # Download an immutable revision, then bundle it for network-free serving.
    local = snapshot_download(model_id, revision=revision)
    encoder = StaticModel.from_pretrained(local, normalize=True)
    encoder.save_pretrained(OUTPUT / "encoder")
    # Preserve upstream attribution and license alongside redistributed weights.
    for filename in ("README.md", "LICENSE"):
        source = Path(local) / filename
        if source.exists():
            shutil.copyfile(source, OUTPUT / "encoder" / filename)
    x = encoder.encode(texts)
    np.savez_compressed(
        RESEARCH / "embeddings.npz", embeddings=x, ids=np.array([r["id"] for r in rows])
    )
    tr, dev, test = (indices[s] for s in ("train", "dev", "test"))
    candidates = []
    for c in (0.1, 1, 10, 100):
        clf = LogisticRegression(C=c, max_iter=2000, random_state=42).fit(x[tr], y[tr])
        score = f1_score(y[dev], clf.predict(x[dev]), average="macro", zero_division=0)
        candidates.append((score, -c, clf))
    _, _, clf = max(candidates, key=lambda item: item[:2])
    probabilities = clf.predict_proba(x[dev])
    ordered = np.sort(probabilities, axis=1)
    correct = clf.predict(x[dev]) == y[dev]
    similarity = (x[dev] @ x[tr].T).max(axis=1)
    # Select highest dev coverage achieving >=90% selective accuracy, >=5 examples.
    thresholds = []
    for probability in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9):
        for margin in (0.05, 0.1, 0.2):
            for cosine in (0.3, 0.4, 0.5):
                mask = (
                    (ordered[:, -1] >= probability)
                    & (ordered[:, -1] - ordered[:, -2] >= margin)
                    & (similarity >= cosine)
                )
                if mask.sum() >= 5 and correct[mask].mean() >= 0.9:
                    thresholds.append(
                        (int(mask.sum()), float(correct[mask].mean()), probability, margin, cosine)
                    )
    selected = max(thresholds) if thresholds else (0, 0.0, 1.0, 1.0, 1.0)
    _, _, probability, margin, cosine = selected
    data_hash = hashlib.sha256(raw).hexdigest()
    version = "routing-v1-" + data_hash[:12]
    manifest = dict(
        version=version,
        encoder=model_id,
        encoder_revision=revision,
        dataset_sha256=data_hash,
        classes=clf.classes_.tolist(),
        weights=clf.coef_.tolist(),
        bias=clf.intercept_.tolist(),
        thresholds=dict(probability=probability, margin=margin, similarity=cosine),
        max_length=512,
        synthetic_only=True,
    )
    (OUTPUT / "classifier.json").write_text(json.dumps(manifest, indent=2) + "\n")
    np.save(OUTPUT / "train_embeddings.npy", x[tr], allow_pickle=False)
    shutil.copyfile(RESEARCH / "departments.json", OUTPUT / "departments.json")
    report = dict(
        version=version,
        dataset_sha256=data_hash,
        encoder=model_id,
        encoder_revision=revision,
        model2vec_version=model2vec.__version__,
        sklearn_version=sklearn.__version__,
        seed=42,
        split_counts={s: len(ids) for s, ids in indices.items()},
        group_counts={s: len(v) for s, v in groups.items()},
        classes=labels,
        selected_c=clf.C,
        thresholds=manifest["thresholds"],
        dev=metrics(y[dev], clf.predict(x[dev]), labels),
        test=metrics(y[test], clf.predict(x[test]), labels),
        limitations=(
            "Synthetic only; labels need human review. Boundary rules are "
            "regression checks, not independent evaluation. Encoder is frozen; "
            "head trained on train only. Dev selects C and thresholds; test never "
            "tunes them."
        ),
    )
    report["test_predictions"] = []
    for index, probs in zip(test, clf.predict_proba(x[test]), strict=True):
        rank = np.argsort(probs)[::-1]
        sim = float((x[index] @ x[tr].T).max())
        accepted = bool(
            probs[rank[0]] >= probability
            and probs[rank[0]] - probs[rank[1]] >= margin
            and sim >= cosine
        )
        report["test_predictions"].append(
            dict(
                id=rows[index]["id"],
                expected=y[index],
                predicted=clf.classes_[rank[0]],
                score=float(probs[rank[0]]),
                accepted=accepted,
            )
        )
    accepted = [r for r in report["test_predictions"] if r["accepted"]]
    report["selective_test"] = dict(
        coverage=len(accepted) / len(test),
        accuracy=np.mean([r["expected"] == r["predicted"] for r in accepted]).item()
        if accepted
        else None,
        accepted=len(accepted),
    )
    # A lexical baseline uses the same split and dev C selection.
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
    lexical = vectorizer.fit_transform([texts[i] for i in tr])
    baselines = []
    for c in (0.1, 1, 10, 100):
        base = LogisticRegression(C=c, max_iter=2000).fit(lexical, y[tr])
        score = f1_score(
            y[dev],
            base.predict(vectorizer.transform([texts[i] for i in dev])),
            average="macro",
            zero_division=0,
        )
        baselines.append((score, -c, base))
    base = max(baselines, key=lambda item: item[:2])[2]
    report["tfidf_baseline_test"] = metrics(
        y[test], base.predict(vectorizer.transform([texts[i] for i in test])), labels
    )
    from bu_api.request_routing import RequestRouter

    router = RequestRouter(OUTPUT)
    boundaries = [
        json.loads(line) for line in (RESEARCH / "boundary_cases.jsonl").read_text().splitlines()
    ]
    report["boundary_regression"] = [
        dict(id=r["id"], expected=r["expected_handling"], actual=router.route(r["text"]).handling)
        for r in boundaries
    ]
    final_predictions = []
    timings = []
    for index in test:
        started = perf_counter()
        result = router.route(texts[index])
        timings.append((perf_counter() - started) * 1000)
        final_predictions.append(
            dict(
                id=rows[index]["id"],
                expected=y[index],
                handling=result.handling,
                predicted=result.department.id if result.department else None,
            )
        )
    routed = [r for r in final_predictions if r["predicted"] is not None]
    report["end_to_end_test"] = dict(
        coverage=len(routed) / len(test),
        routed=len(routed),
        total=len(test),
        accuracy=sum(r["expected"] == r["predicted"] for r in routed) / len(routed)
        if routed
        else None,
        predictions=final_predictions,
    )
    report["warm_local_latency_ms"] = dict(
        p50=float(np.percentile(timings, 50)),
        p95=float(np.percentile(timings, 95)),
        count=len(timings),
        scope="Single local process, guard + encoder + head; excludes HTTP/LLM",
    )
    (RESEARCH / "evaluation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {
                k: report[k]
                for k in (
                    "split_counts",
                    "group_counts",
                    "selected_c",
                    "thresholds",
                    "selective_test",
                )
            },
            indent=2,
        )
    )
    print("Test macro F1:", report["test"]["macro_f1"])


if __name__ == "__main__":
    train()
