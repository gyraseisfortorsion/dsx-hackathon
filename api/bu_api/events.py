"""Event discovery using offline TF–IDF vectors. No ML fitting or LLM at runtime."""

import json
import math
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from .schemas import EventCard, Schema


def deduplicate_events(events: list[EventCard]) -> list[EventCard]:
    """Keep the first ranked occurrence per title, without changing stored records."""
    seen = set()
    unique = []
    for event in events:
        key = " ".join(unicodedata.normalize("NFKC", event.title).casefold().split())
        # Missing titles must not collapse unrelated events.
        key = key or event.id
        if key not in seen:
            seen.add(key)
            unique.append(event)
    return unique


INTERESTS = {
    "technology": "technology robotics programming software engineering computers",
    "music": "music jazz concert singing band performance",
    "arts": "art design film dance theatre creative painting",
    "culture": "culture cultural international language community",
    "sports": "sports athletics fitness exercise recreation",
    "service": "volunteer volunteering community service fundraiser",
    "career": "career professional networking entrepreneurship business",
    "wellbeing": "wellness wellbeing health mindfulness relaxation",
    "science": "science research biology chemistry physics mathematics",
    "social": "social friends games gathering food community",
}
GOALS = {
    "make_friends": "social meet friends community gathering",
    "explore_interests": "explore introduction beginner workshop",
    "learn_skills": "learn skills workshop training educational",
    "career_growth": "career professional networking industry",
    "community_service": "volunteer service community fundraiser",
}


class Preferences(Schema):
    version: int = Field(default=0, ge=0)
    interest_ids: list[str] = Field(default_factory=list, max_length=10)
    interests_text: str = Field(default="", max_length=500)
    goal_ids: list[str] = Field(default_factory=list, max_length=5)
    avoid_schedule_conflicts: bool = True

    @model_validator(mode="after")
    def known_options(self):
        if set(self.interest_ids) - INTERESTS.keys() or set(self.goal_ids) - GOALS.keys():
            raise ValueError("Unknown interest or goal; use /events/options")
        self.interest_ids = list(dict.fromkeys(self.interest_ids))
        self.goal_ids = list(dict.fromkeys(self.goal_ids))
        return self


class Feedback(Schema):
    saved: bool = False
    not_interested: bool = False

    @model_validator(mode="after")
    def exclusive(self):
        if self.saved and self.not_interested:
            raise ValueError("An event cannot be both saved and hidden")
        return self


class Window(Schema):
    starts_at: AwareDatetime
    ends_at: AwareDatetime

    @model_validator(mode="after")
    def ordered(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Window end must follow its start")
        return self


class EventFilters(Schema):
    starts_from: AwareDatetime | None = None
    starts_before: AwareDatetime | None = None
    category_ids: list[str] = Field(default_factory=list, max_length=30)
    cluster_ids: list[str] = Field(default_factory=list, max_length=30)
    avoid_schedule_conflicts: bool | None = None
    available_windows: list[Window] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def ordered(self):
        if self.starts_from and self.starts_before and self.starts_before <= self.starts_from:
            raise ValueError("starts_before must follow starts_from")
        return self


class EventSearch(Schema):
    query: str = Field(default="", max_length=1000)
    filters: EventFilters = Field(default_factory=EventFilters)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=10000)


class EventResults(Schema):
    mode: Literal["general", "personalized", "search", "no_match"]
    as_of: datetime
    artifact_version: str
    profile_version: int
    effective_filters: EventFilters
    total: int
    next_offset: int | None
    notice: str | None = None
    items: list[EventCard]


class EventService:
    def __init__(self, path: Path):
        bundle = json.loads(path.read_text())
        self.version = bundle["version"]
        self.manifest = bundle["manifest"]
        self.idf = bundle["idf"]
        self.events = bundle["events"]
        self.by_id = {e["id"]: e for e in self.events}
        self.vectors = bundle["vectors"]
        self.clusters = bundle["clusters"]
        if set(self.by_id) != set(self.vectors) or len(self.by_id) != len(self.events):
            raise ValueError("Event artifact IDs do not align")

    def vectorize(self, text: str) -> dict[str, float]:
        counts: dict[str, int] = {}
        for term in re.findall(r"(?u)\b\w\w+\b", text.lower()):
            if term in self.idf:
                counts[term] = counts.get(term, 0) + 1
        values = {t: (1 + math.log(c)) * self.idf[t] for t, c in counts.items()}
        norm = math.sqrt(sum(x * x for x in values.values()))
        return {t: v / norm for t, v in values.items()} if norm else {}

    @staticmethod
    def similarity(a: dict, b: dict) -> float:
        return sum(v * b.get(t, 0) for t, v in a.items())

    def search(self, student, calendar, state, request: EventSearch, *, general=False):
        prefs = state.preferences
        f = request.filters.model_copy(deep=True)
        if f.avoid_schedule_conflicts is None:
            f.avoid_schedule_conflicts = prefs.avoid_schedule_conflicts
        categories = {e["source_category"] for e in self.events}
        if set(f.category_ids) - categories or set(f.cluster_ids) - self.clusters.keys():
            raise ValueError("Unknown category or cluster; use /events/options")
        query = self.vectorize(request.query)
        profile = (
            self.vectorize(
                " ".join(
                    [INTERESTS[i] for i in prefs.interest_ids]
                    + [GOALS[g] for g in prefs.goal_ids]
                    + [prefs.interests_text]
                )
            )
            if not general
            else {}
        )
        saved = (
            [
                self.vectors[eid]
                for eid, fb in state.feedback.items()
                if fb.saved and eid in self.vectors
            ]
            if not general
            else []
        )
        has_query = bool(request.query.strip())
        mode = "search" if has_query else "personalized" if profile or saved else "general"
        now = student.profile.as_of
        rows = []
        busy = [e for e in calendar.events if e.ends_at is not None]
        for event in self.events:
            fb = state.feedback.get(event["id"], Feedback())
            start = datetime.fromisoformat(event["starts_at"])
            end = datetime.fromisoformat(event["ends_at"]) if event["ends_at"] else None
            if start < now or fb.not_interested:
                continue
            if f.starts_from and start < f.starts_from:
                continue
            if f.starts_before and start >= f.starts_before:
                continue
            if f.category_ids and event["source_category"] not in f.category_ids:
                continue
            if f.cluster_ids and event["cluster_id"] not in f.cluster_ids:
                continue
            if f.available_windows and (
                not end
                or not any(w.starts_at <= start and end <= w.ends_at for w in f.available_windows)
            ):
                continue
            conflicts = [e.id for e in busy if end and start < e.ends_at and e.starts_at < end]
            if f.avoid_schedule_conflicts and conflicts:
                continue
            vector = self.vectors[event["id"]]
            qscore = self.similarity(query, vector)
            pscore = self.similarity(profile, vector)
            sscore = sum(self.similarity(v, vector) for v in saved) / len(saved) if saved else 0
            if has_query and qscore <= 0:
                continue
            score = (
                0.8 * qscore + 0.15 * pscore + 0.05 * sscore
                if has_query
                else (0.9 * pscore + 0.1 * sscore)
            )
            reasons = []
            if qscore > 0:
                reasons.append("Matches words in your search")
            if pscore > 0:
                reasons.append("Matches your selected interests or goals")
            if sscore > 0:
                reasons.append("Similar to events you saved")
            if not reasons:
                reasons.append("Upcoming campus event")
            rows.append(
                EventCard(
                    **event,
                    saved=fb.saved,
                    conflict_ids=conflicts,
                    conflict_check_complete=end is not None,
                    score=round(score, 6) if mode != "general" else None,
                    reasons=reasons,
                )
            )
        rows.sort(key=lambda e: (-(e.score or 0), e.starts_at, e.id))
        rows = deduplicate_events(rows)
        unmatched_profile = mode == "personalized" and not any(e.score for e in rows)
        if unmatched_profile:
            mode = "general"
            for event in rows:
                event.score = None
        total = len(rows)
        next_offset = request.offset + request.limit
        notice = None
        if mode == "general" and not general:
            notice = (
                "No matches to your preferences; showing general upcoming events."
                if unmatched_profile
                else "Choose interests or save events to personalize this list."
            )
        if has_query and not rows:
            mode = "no_match"
            notice = "No lexical matches meet these filters. Try other words or browse events."
        return EventResults(
            mode=mode,
            as_of=now,
            artifact_version=self.version,
            profile_version=prefs.version,
            effective_filters=f,
            total=total,
            next_offset=next_offset if next_offset < total else None,
            notice=notice,
            items=rows[request.offset : next_offset],
        )
