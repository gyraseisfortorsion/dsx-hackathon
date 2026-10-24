"""Keyword baseline scorer -- stdlib only.

Maps each taxonomy tag's definition + examples (+ a small curated synonym list)
to terms, then scores a tag by how many of its terms appear in the event text.
This is the operational suggester until the learned model is trained, and the
floor the learned model must beat on micro-F1.
"""

from __future__ import annotations

import re

from .taxonomy import Taxonomy

_WORD = re.compile(r"[a-z0-9']+")
_STOP = {
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "at",
    "is", "are", "be", "by", "it", "its", "as", "that", "this", "your", "you",
    "we", "our", "will", "can", "from", "about", "how", "what", "when",
}

# Hand-curated synonyms/cue phrases per tag. English only.
SYNONYMS: dict[str, list[str]] = {
    "academic": ["study", "studying", "advising", "advisor", "thesis", "research", "scholarly",
                 "course", "homework", "tutoring", "lecture notes", "exam prep"],
    "career": ["career", "job", "jobs", "internship", "internships", "employer", "recruiter",
               "recruiting", "resume", "cv", "interview", "professional", "hiring"],
    "tech": ["tech", "technology", "software", "coding", "code", "programming", "data",
             "ai", "machine learning", "engineering", "hackathon", "developer", "computer"],
    "arts-culture": ["art", "arts", "music", "concert", "film", "theater", "theatre", "gallery",
                     "exhibit", "literature", "poetry", "creative", "painting"],
    "sports-recreation": ["sports", "sport", "fitness", "gym", "yoga", "run", "soccer",
                          "basketball", "intramural", "hike", "outdoor", "game", "athletic"],
    "wellness-health": ["wellness", "health", "mental health", "counseling", "mindfulness",
                        "meditation", "stress", "self care", "wellbeing", "therapy"],
    "community-service": ["volunteer", "volunteering", "service", "charity", "fundraiser",
                         "fundraising", "donate", "donation", "food drive", "giving"],
    "cultural-identity": ["cultural", "culture", "heritage", "identity", "religious", "faith",
                         "diversity", "affinity", "community", "celebration", "tradition"],
    "workshop": ["workshop", "training", "hands on", "clinic", "bootcamp", "how to",
                 "learn to", "skill", "practice", "session"],
    "talk-panel": ["talk", "lecture", "panel", "keynote", "speaker", "discussion",
                   "presentation", "seminar", "fireside", "q&a"],
    "social": ["social", "mixer", "party", "hangout", "meet", "mingle", "fun",
               "bingo", "trivia", "welcome", "get together"],
    "performance": ["performance", "showcase", "show", "recital", "concert", "dance",
                    "a cappella", "perform", "stage", "live"],
    "free-food": ["free food", "free pizza", "free boba", "snacks", "refreshments",
                  "catered", "lunch provided", "dinner provided", "food provided", "boba"],
    "networking": ["networking", "network", "connect", "alumni", "meet recruiters",
                   "connections", "mingle with", "professionals"],
}


def _tokens(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOP}


def _phrases(tag_id: str, taxonomy: Taxonomy) -> list[str]:
    tag = taxonomy.get(tag_id)
    seed = [tag.name, tag.definition, *tag.examples, *SYNONYMS.get(tag_id, [])]
    return [p.lower().strip() for p in seed if p.strip()]


class KeywordBaseline:
    version = "baseline-v1"

    def __init__(self, taxonomy: Taxonomy):
        self.taxonomy = taxonomy
        # Per tag: a set of single-word cues and a list of multi-word cue phrases.
        self._word_cues: dict[str, set[str]] = {}
        self._phrase_cues: dict[str, list[str]] = {}
        for tag_id in taxonomy.tag_ids:
            words: set[str] = set()
            phrases: list[str] = []
            for phrase in _phrases(tag_id, taxonomy):
                parts = phrase.split()
                if len(parts) == 1:
                    words |= _tokens(phrase)
                else:
                    phrases.append(phrase)
                    words |= _tokens(phrase)
            self._word_cues[tag_id] = words
            self._phrase_cues[tag_id] = phrases

    def score(self, title: str, description: str) -> dict[str, float]:
        text = f"{title or ''} {title or ''} {description or ''}".lower()
        text_tokens = _tokens(text)
        scores: dict[str, float] = {}
        for tag_id in self.taxonomy.tag_ids:
            words = self._word_cues[tag_id]
            hits = len(words & text_tokens)
            phrase_hits = sum(1 for p in self._phrase_cues[tag_id] if p in text)
            denom = max(1, len(words))
            raw = (hits + 2 * phrase_hits) / (denom + 2)
            scores[tag_id] = min(1.0, round(raw, 4))
        return scores
