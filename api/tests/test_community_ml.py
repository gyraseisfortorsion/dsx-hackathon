"""Model export, leakage checks, API integration and safe fallback behavior."""

import hashlib
import json
from pathlib import Path

import numpy as np
from pydantic import SecretStr

from bu_api.community_ml import FEATURES, CommunityModels, study_features
from bu_api.community_models import StudyProfile
from bu_api.config import API_ROOT
from tests.test_community import get, listing, post, put, setup_matches, study

RESEARCH = API_ROOT.parent / "research/community-training"


def test_training_data_provenance_hashes_and_group_isolation():
    report = json.loads((RESEARCH / "evaluation.json").read_text())
    assert report["synthetic_only"] and report["export_parity_verified"]
    for name, group in [("moderation", "group"), ("study", "query_id")]:
        raw = (RESEARCH / f"{name}.jsonl").read_bytes()
        assert hashlib.sha256(raw).hexdigest() == report["data_sha256"][name]
        rows = [json.loads(line) for line in raw.splitlines()]
        train = {r[group] for r in rows if r["split"] == "train"}
        test = {r[group] for r in rows if r["split"] == "test"}
        dev = {r[group] for r in rows if r["split"] == "dev"}
        assert not (train & test or train & dev or test & dev)
        if name == "study":
            students = {
                s: {u for r in rows if r["split"] == s for u in r["student_ids"]}
                for s in ("train", "dev", "test")
            }
            assert not students["train"] & students["test"]


def test_exported_moderation_predictions_reproduce_training_report(client):
    model = client.app.state.community_models
    rows = [json.loads(line) for line in (RESEARCH / "moderation.jsonl").read_text().splitlines()]
    rows = {r["id"]: r for r in rows}
    predictions = json.loads((RESEARCH / "moderation_predictions.json").read_text())
    for stored in [r for r in predictions if r["split"] == "test"][:12]:
        title, description = rows[stored["id"]]["text"].split("\n", 1)
        result = model.assess_listing(title, description)
        assert abs(result["review_score"] - stored["review_score"]) < 1e-6
        assert result["flag_for_review"] == stored["flagged"]
        assert result["synthetic_only"]


def test_study_feature_order_and_export_consistency(client):
    from datetime import UTC, datetime, timedelta

    a, b = StudyProfile(**study()), StudyProfile(**study())
    start = datetime(2026, 10, 24, 16, tzinfo=UTC)
    features = study_features(a, b, [(start, start + timedelta(hours=3))])
    assert len(features) == len(FEATURES)
    assert np.allclose(features, [1, 1, 1, 1, 0, 1 / 3, 1, 1])
    model = client.app.state.community_models
    result = model.rank(features)
    assert abs(sum(result["contributions"].values()) - result["raw_score"]) < 1e-10
    assert 0 <= result["score"] <= 100 and result["synthetic_only"]


def test_experimental_ranking_preserves_eligibility_and_rules(client):
    setup_matches(client)
    baseline = get(client, "/study/matches").json()
    learned = get(client, "/study/matches", ranking="model").json()
    assert baseline["ranking"] == "rules"
    assert learned["ranking"] == "model" and learned["synthetic_only"]
    assert learned["items"][0]["rule_score"] == baseline["items"][0]["score"]
    assert learned["items"][0]["model"]["synthetic_only"]
    assert baseline["items"][0]["course_ids"] == learned["items"][0]["course_ids"]
    put(client, "/community/blocks/maya", {"enabled": True})
    assert get(client, "/study/matches", ranking="model").json()["items"] == []
    assert get(client, "/community/models").json()["automatic_removal_or_bans"] is False


def test_models_missing_fallback_does_not_break_mvp(client, tmp_path):
    setup_matches(client)
    client.app.state.community_models = CommunityModels(tmp_path)
    assert get(client, "/study/matches").status_code == 200
    assert get(client, "/study/matches", ranking="model").status_code == 503
    assert (
        post(
            client, "/marketplace/analyze", {"title": "Book", "description": "Used book"}
        ).status_code
        == 503
    )
    assert post(client, "/marketplace/listings", listing(client)).status_code == 201


def test_model_flags_advisory_and_private_to_seller_and_moderators(client, settings):
    settings.community_ml_review_enabled = True
    settings.community_moderator_token = SecretStr("moderator-secret")
    text = "Send your university login and password to verify that you can buy this desk."
    assessment = post(
        client, "/marketplace/analyze", {"title": "Campus listing", "description": text}
    )
    assert assessment.status_code == 200 and assessment.json()["synthetic_only"]
    assert "safe" not in assessment.json()
    # Control the threshold to test flag handling independently of classifier accuracy.
    client.app.state.community_models.moderation["review_threshold"] = 0.0
    created = post(client, "/marketplace/listings", listing(client, description=text)).json()
    assert created["status"] == "active"
    assert created["model_review"]["flag_for_review"]
    public = get(client, f"/marketplace/listings/{created['id']}", "maya").json()
    assert "model_review" not in public
    assert public["status"] == "active"
    queue = client.get(
        "/community/moderation?user=alex",
        headers={
            "Authorization": "Bearer test-password",
            "X-Moderator-Token": "moderator-secret",
        },
    ).json()
    assert any(r["reporter"] == "system:model" for r in queue["reports"])
    assert queue["suspended"] == []


def test_corrupt_artifact_rejected_without_pickle(tmp_path):
    import pytest

    (tmp_path / "study_ranker.json").write_text(
        json.dumps(
            {
                "format_version": 1,
                "synthetic_only": True,
                "features": list(FEATURES),
                "weights": [float("nan")] * len(FEATURES),
            }
        )
    )
    with pytest.raises(ValueError):
        CommunityModels(Path(tmp_path))
