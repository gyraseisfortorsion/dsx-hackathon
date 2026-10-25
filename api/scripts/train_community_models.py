"""Fit two synthetic-only models with grouped evaluation and safe JSON export."""

import hashlib
import itertools
import json
import sys
from pathlib import Path
from time import perf_counter

import numpy as np
import sklearn
from model2vec import StaticModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    ndcg_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT.parent / "research/community-training"
OUT = ROOT / "data/community_models"
sys.path.insert(0, str(ROOT))
from bu_api.community_ml import FEATURES, CommunityModels  # noqa: E402

SEED = 20261024


def load(name):
    raw = (RESEARCH / name).read_bytes()
    return [json.loads(line) for line in raw.splitlines()], hashlib.sha256(raw).hexdigest()


def split_rows(rows, group):
    splits = {s: [r for r in rows if r["split"] == s] for s in ("train", "dev", "test")}
    groups = {s: {r[group] for r in data} for s, data in splits.items()}
    assert all(not groups[a] & groups[b] for a, b in itertools.combinations(groups, 2))
    if "text" in rows[0]:
        texts = {s: {r["text"] for r in data} for s, data in splits.items()}
        assert all(not texts[a] & texts[b] for a, b in itertools.combinations(texts, 2))
    if "student_ids" in rows[0]:
        students = {s: {u for r in data for u in r["student_ids"]} for s, data in splits.items()}
        assert all(not students[a] & students[b] for a, b in itertools.combinations(students, 2))
        assert max(r["recorded_on"] for r in splits["train"]) < min(
            r["recorded_on"] for r in splits["dev"]
        )
        assert max(r["recorded_on"] for r in splits["dev"]) < min(
            r["recorded_on"] for r in splits["test"]
        )
    return splits


def clf_metrics(y, probabilities, threshold):
    prediction = probabilities >= threshold
    tn, fp, fn, tp = confusion_matrix(y, prediction, labels=[0, 1]).ravel()
    return {
        "examples": len(y),
        "precision": precision_score(y, prediction, zero_division=0),
        "recall": recall_score(y, prediction, zero_division=0),
        "f1": f1_score(y, prediction, zero_division=0),
        "accuracy": accuracy_score(y, prediction),
        "roc_auc": roc_auc_score(y, probabilities),
        "average_precision": average_precision_score(y, probabilities),
        "false_positive_rate": float(fp / (tn + fp)),
        "confusion_matrix_labels": ["ordinary", "needs_review"],
        "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
        "review_coverage": float(prediction.mean()),
    }


def scenario_metrics(rows, probabilities, threshold):
    groups = sorted({r["group"] for r in rows})
    scores = np.array(
        [
            np.mean([p for r, p in zip(rows, probabilities, strict=True) if r["group"] == g])
            for g in groups
        ]
    )
    labels = np.array([next(r["label"] for r in rows if r["group"] == g) for g in groups])
    return clf_metrics(labels, scores, threshold)


def ranking_metrics(rows, weights):
    queries = sorted({r["query_id"] for r in rows})
    ndcgs, agreements = [], []
    for query in queries:
        group = [r for r in rows if r["query_id"] == query]
        x = np.array([r["features"] for r in group])
        y = np.array([r["relevance"] for r in group])
        scores = x @ weights
        ndcgs.append(ndcg_score([y], [scores], k=5))
        for a, b in itertools.combinations(range(len(group)), 2):
            if abs(y[a] - y[b]) >= 0.05:
                agreements.append((y[a] > y[b]) == (scores[a] > scores[b]))
    return {
        "queries": len(queries),
        "ndcg_at_5": float(np.mean(ndcgs)),
        "pairwise_accuracy": float(np.mean(agreements)),
        "evaluated_pairs": len(agreements),
    }


def select_classifier(x_train, y_train, x_dev, y_dev, *, intercept=True):
    candidates = []
    for c in (0.1, 1, 10, 100):
        model = LogisticRegression(
            C=c, fit_intercept=intercept, max_iter=2000, random_state=SEED
        ).fit(x_train, y_train)
        score = average_precision_score(y_dev, model.predict_proba(x_dev)[:, 1])
        candidates.append((score, -c, model))
    return max(candidates, key=lambda r: r[:2])[2]


def dump(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n")


def train():
    OUT.mkdir(parents=True, exist_ok=True)
    encoder = StaticModel.from_pretrained(ROOT / "data/request_router/encoder", normalize=True)
    moderation, moderation_hash = load("moderation.jsonl")
    boundary, boundary_hash = load("boundary.jsonl")
    splits = split_rows(moderation, "group")
    xs = {s: encoder.encode([r["text"] for r in rows]) for s, rows in splits.items()}
    ys = {s: np.array([r["label"] for r in rows]) for s, rows in splits.items()}
    classifier = select_classifier(xs["train"], ys["train"], xs["dev"], ys["dev"])
    dev_prob = classifier.predict_proba(xs["dev"])[:, 1]
    thresholds = []
    for threshold in np.linspace(0.5, 0.99, 50):
        result = clf_metrics(ys["dev"], dev_prob, threshold)
        if (
            result["precision"] >= 0.9
            and result["false_positive_rate"] <= 0.1
            and (dev_prob >= threshold).sum() >= 6
        ):
            thresholds.append((result["f1"], float(threshold)))
    threshold = max(thresholds)[1] if thresholds else 1.0
    dump(
        OUT / "moderation.json",
        {
            "format_version": 1,
            "version": "moderation-v1-" + moderation_hash[:12],
            "synthetic_only": True,
            "target": "synthetic_review_label_not_confirmed_fraud",
            "data_sha256": moderation_hash,
            "encoder": "minishlab/potion-base-8M",
            "encoder_revision": "bf8b056651a2c21b8d2565580b8569da283cab23",
            "classes": classifier.classes_.tolist(),
            "weights": classifier.coef_[0].tolist(),
            "bias": float(classifier.intercept_[0]),
            "review_threshold": threshold,
            "hyperparameters": {"C": float(classifier.C), "seed": SEED},
            "sklearn_version": sklearn.__version__,
        },
    )
    boundary_x = encoder.encode([r["text"] for r in boundary])
    boundary_p = classifier.predict_proba(boundary_x)[:, 1]
    predictions = []
    for split in ("dev", "test"):
        for row, probability in zip(
            splits[split], classifier.predict_proba(xs[split])[:, 1], strict=True
        ):
            predictions.append(
                {
                    "id": row["id"],
                    "split": split,
                    "actual": row["label"],
                    "review_score": float(probability),
                    "flagged": bool(probability >= threshold),
                }
            )
    for row, probability in zip(boundary, boundary_p, strict=True):
        predictions.append(
            {
                "id": row["id"],
                "split": "boundary",
                "actual": row["label"],
                "review_score": float(probability),
                "flagged": bool(probability >= threshold),
            }
        )
    dump(RESEARCH / "moderation_predictions.json", predictions)
    keywords = ("password", "gift card", "crypto", "wire", "verification code", "guaranteed")
    keyword_prob = np.array(
        [float(any(k in r["text"].lower() for k in keywords)) for r in splits["test"]]
    )
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
    tf_train = vectorizer.fit_transform([r["text"] for r in splits["train"]])
    tf_dev = vectorizer.transform([r["text"] for r in splits["dev"]])
    tf_test = vectorizer.transform([r["text"] for r in splits["test"]])
    tf_baseline = select_classifier(tf_train, ys["train"], tf_dev, ys["dev"])

    study, study_hash = load("study.jsonl")
    study_splits = split_rows(study, "query_id")
    differences, preferences = [], []
    for query in sorted({r["query_id"] for r in study_splits["train"]}):
        rows = [r for r in study_splits["train"] if r["query_id"] == query]
        for a, b in itertools.combinations(rows, 2):
            if abs(a["relevance"] - b["relevance"]) < 0.05:
                continue
            diff = np.array(a["features"]) - np.array(b["features"])
            preferred = int(a["relevance"] > b["relevance"])
            differences.extend([diff, -diff])
            preferences.extend([preferred, 1 - preferred])
    rankers = []
    for c in (0.01, 0.1, 1, 10):
        ranker = LogisticRegression(C=c, fit_intercept=False, max_iter=2000, random_state=SEED).fit(
            differences, preferences
        )
        result = ranking_metrics(study_splits["dev"], ranker.coef_[0])
        rankers.append((result["ndcg_at_5"], -c, ranker))
    ranker = max(rankers, key=lambda r: r[:2])[2]
    weights = ranker.coef_[0]
    raw_train = np.array([r["features"] for r in study_splits["train"]]) @ weights
    dump(
        OUT / "study_ranker.json",
        {
            "format_version": 1,
            "version": "study-ranker-v1-" + study_hash[:12],
            "synthetic_only": True,
            "target": "synthetic_pairwise_preference_not_student_outcome",
            "data_sha256": study_hash,
            "features": list(FEATURES),
            "weights": weights.tolist(),
            "bias": 0,
            "display_scale": max(float(np.std(raw_train)), 0.01),
            "hyperparameters": {"C": float(ranker.C), "seed": SEED, "pair_margin": 0.05},
            "sklearn_version": sklearn.__version__,
        },
    )
    report = {
        "synthetic_only": True,
        "seed": SEED,
        "split_checks": {
            "scenario_groups_disjoint": True,
            "exact_text_disjoint": True,
            "student_ids_disjoint": True,
            "study_dates_ordered": True,
        },
        "data_sha256": {
            "moderation": moderation_hash,
            "study": study_hash,
            "boundary": boundary_hash,
        },
        "counts": {
            s: {"moderation": len(splits[s]), "study": len(study_splits[s])} for s in splits
        },
        "moderation": {
            "selected_C": float(classifier.C),
            "test_independent_scenarios": scenario_metrics(
                splits["test"], classifier.predict_proba(xs["test"])[:, 1], threshold
            ),
            "review_threshold": threshold,
            "threshold_policy": (
                "Dev precision >= .90 and FPR <= .10, >=6 decisions; otherwise abstain"
            ),
            "dev": clf_metrics(ys["dev"], dev_prob, threshold),
            "test": clf_metrics(ys["test"], classifier.predict_proba(xs["test"])[:, 1], threshold),
            "boundary": clf_metrics(
                np.array([r["label"] for r in boundary]), boundary_p, threshold
            ),
            "test_keyword_baseline": clf_metrics(ys["test"], keyword_prob, 0.5),
            "test_tfidf_baseline": clf_metrics(
                ys["test"], tf_baseline.predict_proba(tf_test)[:, 1], 0.5
            ),
        },
        "study_ranker": {
            "training_comparisons": len(preferences),
            "selected_C": float(ranker.C),
            "dev": ranking_metrics(study_splits["dev"], weights),
            "test": ranking_metrics(study_splits["test"], weights),
            "test_rules_baseline": ranking_metrics(
                study_splits["test"], np.array([0.5, 0.3, 0.1, 0.1, 0, 0, 0, 0])
            ),
        },
        "limitations": [
            "Entire evaluation is synthetic; no production accuracy or usefulness claim",
            "Shared neutral suffixes appear across moderation split groups",
            "Study labels use an explicit synthetic rubric plus noise, not observed outcomes",
            "No real student history, private messages, or identity attributes used",
            "Never auto-remove listings or suspend accounts using model scores",
        ],
    }
    exported = CommunityModels(OUT, encoder=encoder)
    expected = classifier.predict_proba(xs["test"])[:, 1]
    actual = np.array(
        [exported.assess_listing(*r["text"].split("\n", 1))["review_score"] for r in splits["test"]]
    )
    assert np.max(np.abs(expected - actual)) < 1e-6
    expected_rank = np.array([r["features"] for r in study_splits["test"]]) @ weights
    assert np.allclose(
        [exported.rank(np.array(r["features"]))["raw_score"] for r in study_splits["test"]],
        expected_rank,
    )
    started = perf_counter()
    for _ in range(100):
        exported.assess_listing(
            "Campus textbook", "Used copy, inspect before paying at the library."
        )
    report["local_warm_single_listing_inference_ms_mean"] = (perf_counter() - started) * 10
    report["export_parity_verified"] = True
    dump(RESEARCH / "evaluation.json", report)
    print(
        json.dumps(
            {
                "moderation_test": report["moderation"]["test"],
                "boundary": report["moderation"]["boundary"],
                "study_test": report["study_ranker"]["test"],
                "study_baseline": report["study_ranker"]["test_rules_baseline"],
                "export_parity_verified": True,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    train()
