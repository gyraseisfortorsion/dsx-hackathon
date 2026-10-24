"""Classifier interface, tag-output contract, and the tagger.

This module is import-safe for the FastAPI backend: pure stdlib, no sklearn.
The learned model and the keyword baseline both implement ``Scorer`` and are
turned into the contract by the same ``Tagger``.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal, Protocol

from .taxonomy import Taxonomy

Status = Literal["ok", "no_confident_tag", "insufficient_text"]
Source = Literal["model", "baseline", "organizer"]


@dataclass
class ScoredTag:
    tag_id: str
    score: float | None
    source: Source = "model"


@dataclass
class TagSuggestionResult:
    """The versioned tag-output contract consumed by the recommender and the app."""

    prediction_id: str
    taxonomy_version: str
    model_version: str
    status: Status
    suggestions: list[ScoredTag] = field(default_factory=list)
    optional: list[ScoredTag] = field(default_factory=list)
    organizer_corrected: bool = False

    def to_json(self) -> dict:
        return {
            "prediction_id": self.prediction_id,
            "taxonomy_version": self.taxonomy_version,
            "model_version": self.model_version,
            "status": self.status,
            "organizer_corrected": self.organizer_corrected,
            "suggestions": [asdict(s) for s in self.suggestions],
            "optional": [asdict(s) for s in self.optional],
        }


class Scorer(Protocol):
    """Produces a score in [0, 1] for every taxonomy tag."""

    version: str

    def score(self, title: str, description: str) -> dict[str, float]: ...


class Tagger:
    """Turn raw per-tag scores into the ranked, thresholded contract."""

    def __init__(
        self,
        taxonomy: Taxonomy,
        thresholds: dict[str, float],
        *,
        default_threshold: float = 0.5,
        max_tags: int = 5,
        source: Source = "model",
    ):
        self.taxonomy = taxonomy
        self.thresholds = thresholds
        self.default_threshold = default_threshold
        self.max_tags = max_tags
        self.source = source

    def _threshold(self, tag_id: str) -> float:
        return self.thresholds.get(tag_id, self.default_threshold)

    def build(
        self, prediction_id: str, model_version: str, title: str, description: str, scores: dict
    ) -> TagSuggestionResult:
        if not (title or "").strip() and not (description or "").strip():
            return TagSuggestionResult(
                prediction_id, self.taxonomy.version, model_version, "insufficient_text"
            )

        self.taxonomy.assert_known(list(scores))
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        passing = [(t, s) for t, s in ranked if s >= self._threshold(t)]
        below = [(t, s) for t, s in ranked if s < self._threshold(t)]

        suggestions = [
            ScoredTag(t, round(float(s), 4), self.source) for t, s in passing[: self.max_tags]
        ]
        optional = [ScoredTag(t, round(float(s), 4), self.source) for t, s in below[:3]]
        status: Status = "ok" if suggestions else "no_confident_tag"
        return TagSuggestionResult(
            prediction_id, self.taxonomy.version, model_version, status, suggestions, optional
        )
