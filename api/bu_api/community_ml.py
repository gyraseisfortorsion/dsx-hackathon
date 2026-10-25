"""Offline-trained experimental heads; JSON/NumPy inference with no runtime training.

Synthetic-only models are advisory. Eligibility/authorization never use a model.
"""

import json
from pathlib import Path

import numpy as np

FEATURES = (
    "availability",
    "goals",
    "study_format",
    "meeting_mode",
    "interests",
    "shared_courses",
    "availability_x_goals",
    "availability_x_preferences",
)


def study_features(a, b, windows, target=180):
    minutes = sum((end - start).total_seconds() / 60 for start, end in windows)
    availability = min(minutes / target, 1)
    goals = (
        len(set(a.goals) & set(b.goals)) / len(set(a.goals) | set(b.goals))
        if a.goals and b.goals
        else 0
    )
    comparable = []
    values = []
    for field in ("study_format", "meeting_mode"):
        x, y = getattr(a, field), getattr(b, field)
        comparable.append(bool(x and y))
        values.append(
            float(x == y or (field == "meeting_mode" and "either" in (x, y))) if x and y else 0
        )
    union = set(a.interests) | set(b.interests)
    interests = len(set(a.interests) & set(b.interests)) / len(union) if union else 0
    shared = min(len(set(a.course_ids) & set(b.course_ids)) / 3, 1)
    preferences = sum(values) / sum(comparable) if any(comparable) else 0
    return np.array(
        [
            availability,
            goals,
            *values,
            interests,
            shared,
            availability * goals,
            availability * preferences,
        ],
        dtype=float,
    )


def sigmoid(value):
    return float(1 / (1 + np.exp(-np.clip(value, -40, 40))))


class CommunityModels:
    def __init__(self, directory: Path, *, encoder=None):
        self.directory = directory
        self.ranker = self._load("study_ranker.json")
        self.moderation = self._load("moderation.json")
        self.encoder = encoder
        if self.ranker and (
            self.ranker["features"] != list(FEATURES)
            or len(self.ranker["weights"]) != len(FEATURES)
        ):
            raise ValueError("Incompatible study ranker artifact")
        if self.moderation:
            if encoder is None:
                from model2vec import StaticModel

                self.encoder = StaticModel.from_pretrained(
                    directory.parent / "request_router/encoder", normalize=True
                )
            dimension = self.encoder.encode(["dimension check"]).shape[1]
            if len(self.moderation["weights"]) != dimension:
                raise ValueError("Incompatible moderation head")

    def _load(self, filename):
        path = self.directory / filename
        if not path.exists():
            return None
        artifact = json.loads(path.read_text())
        if artifact.get("format_version") != 1 or artifact.get("synthetic_only") is not True:
            raise ValueError("Unsupported community artifact")
        values = np.asarray([*artifact["weights"], artifact.get("bias", 0)], dtype=float)
        if not np.isfinite(values).all():
            raise ValueError("Invalid model parameters")
        return artifact

    def rank(self, features):
        if not self.ranker:
            raise ValueError("Study ranker unavailable")
        contributions = features * np.asarray(self.ranker["weights"])
        raw = float(contributions.sum())
        return {
            "score": round(100 * sigmoid(raw / self.ranker["display_scale"]), 4),
            "raw_score": raw,
            "contributions": dict(zip(FEATURES, contributions.tolist(), strict=True)),
            "model_version": self.ranker["version"],
            "synthetic_only": True,
            "meaning": "Experimental affinity order, not a probability of a successful session",
        }

    def assess_listing(self, title, description):
        if not self.moderation:
            return None
        x = self.encoder.encode([title + "\n" + description])[0]
        score = sigmoid(float(x @ np.asarray(self.moderation["weights"]) + self.moderation["bias"]))
        return {
            "review_score": round(score, 6),
            "flag_for_review": score >= self.moderation["review_threshold"],
            "model_version": self.moderation["version"],
            "synthetic_only": True,
            "reason": (
                "Experimental text model suggests human review; this is not a fraud determination"
            ),
        }
