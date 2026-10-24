"""Taxonomy loader: the single source of truth for the fixed, versioned tag set.

Pure stdlib so the backend can import it without the training dependencies.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

VALID_FACETS = ("topic", "format", "other")


@dataclass(frozen=True)
class Tag:
    id: str
    facet: str
    name: str
    definition: str
    examples: tuple[str, ...]


class Taxonomy:
    """Immutable view over a loaded taxonomy file."""

    def __init__(self, version: str, tags: list[Tag]):
        self.version = version
        self._tags = {tag.id: tag for tag in tags}
        if len(self._tags) != len(tags):
            raise ValueError("Duplicate tag id in taxonomy")
        if not 10 <= len(tags) <= 15:
            raise ValueError(f"Taxonomy must hold 10-15 tags, found {len(tags)}")
        for tag in tags:
            if tag.facet not in VALID_FACETS:
                raise ValueError(f"Tag {tag.id!r} has unknown facet {tag.facet!r}")

    @property
    def tag_ids(self) -> list[str]:
        return list(self._tags)

    @property
    def tags(self) -> list[Tag]:
        return list(self._tags.values())

    def __contains__(self, tag_id: object) -> bool:
        return tag_id in self._tags

    def __len__(self) -> int:
        return len(self._tags)

    def get(self, tag_id: str) -> Tag:
        return self._tags[tag_id]

    def by_facet(self, facet: str) -> list[Tag]:
        return [tag for tag in self._tags.values() if tag.facet == facet]

    def assert_known(self, tag_ids: list[str]) -> None:
        """Raise if any id is not in the taxonomy (used to guard model output)."""
        unknown = [t for t in tag_ids if t not in self._tags]
        if unknown:
            raise ValueError(f"Unknown tag id(s) not in taxonomy v{self.version}: {unknown}")

    def unknown_ids(self, tag_ids: list[str]) -> list[str]:
        """Return the ids absent from this taxonomy, for flagging stored labels."""
        return [t for t in tag_ids if t not in self._tags]


def load_taxonomy(path: str | Path) -> Taxonomy:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    version = str(payload["version"])
    tags = [
        Tag(
            id=item["id"],
            facet=item["facet"],
            name=item["name"],
            definition=item["definition"],
            examples=tuple(item.get("examples", [])),
        )
        for item in payload["tags"]
    ]
    return Taxonomy(version, tags)
