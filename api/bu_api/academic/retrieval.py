import re

import numpy as np

from .models import AcademicState


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.casefold()))


class PassageSearch:
    """Hybrid semantic/keyword search over the selected user's in-memory passages."""

    def __init__(self, encoder=None):
        self.encoder = encoder

    def search(
        self, state: AcademicState, query: str, course_id: str | None = None, limit: int = 5
    ) -> list[dict]:
        active = []
        for syllabus in state.syllabi.values():
            if syllabus.status == "superseded" or (course_id and syllabus.course_id != course_id):
                continue
            active.extend((syllabus.course_id, passage) for passage in syllabus.passages)
        if not active:
            return []
        query_tokens = _tokens(query)
        lexical = np.asarray(
            [len(query_tokens & _tokens(p.text)) / max(1, len(query_tokens)) for _, p in active]
        )
        semantic = np.zeros(len(active))
        if self.encoder is not None:
            texts = [query, *[p.text for _, p in active]]
            vectors = np.asarray(self.encoder.encode(texts, max_length=256), dtype=np.float64)
            norms = np.linalg.norm(vectors, axis=1, keepdims=True)
            vectors = vectors / np.maximum(norms, 1e-12)
            semantic = vectors[1:] @ vectors[0]
        scores = 0.75 * semantic + 0.25 * lexical if self.encoder is not None else lexical
        ranking = np.argsort(scores)[::-1][:limit]
        return [
            {
                "course_id": active[i][0],
                "passage": active[i][1].model_dump(mode="json"),
                "score": round(float(scores[i]), 6),
                "retrieval": "hybrid_vector_keyword" if self.encoder is not None else "keyword",
            }
            for i in ranking
            if scores[i] > 0
        ]
