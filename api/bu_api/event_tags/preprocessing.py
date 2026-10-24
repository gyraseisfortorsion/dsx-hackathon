"""Text preprocessing shared by the baseline, the learned model, and tooling."""

from __future__ import annotations

import re

_WS = re.compile(r"\s+")


def normalize_text(title: str, description: str) -> str:
    """Lowercased, whitespace-collapsed title+description for duplicate detection."""
    combined = f"{title or ''} {description or ''}".lower()
    return _WS.sub(" ", combined).strip()


def build_features_text(title: str, description: str, *, title_weight: int = 2) -> str:
    """Model input text: the title repeated ``title_weight`` times (it is short and
    high-signal) followed by the description. Shared so training and serving use the
    exact same feature construction.
    """
    title = (title or "").strip()
    description = (description or "").strip()
    repeated = " ".join([title] * max(1, title_weight)) if title else ""
    text = f"{repeated} {description}".strip()
    return _WS.sub(" ", text)
