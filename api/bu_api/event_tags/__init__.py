"""Event-tag inference: fixed taxonomy, preprocessing, keyword baseline, contract.

Minimal, stdlib-only layer added ON TOP of the existing EventService. It assigns
tags from a fixed taxonomy to events and backs the organizer suggest/correct
routes. It does NOT add a second catalog, recommender, or interest list, and it
does NOT change the ranking formula.
"""

from .baseline import KeywordBaseline
from .contract import ScoredTag, Scorer, Tagger, TagSuggestionResult
from .preprocessing import build_features_text, normalize_text
from .taxonomy import Tag, Taxonomy, load_taxonomy

__all__ = [
    "KeywordBaseline",
    "ScoredTag",
    "Scorer",
    "Tag",
    "Tagger",
    "TagSuggestionResult",
    "Taxonomy",
    "build_features_text",
    "load_taxonomy",
    "normalize_text",
]
