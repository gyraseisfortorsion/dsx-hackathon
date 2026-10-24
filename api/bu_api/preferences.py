"""Separate, versioned user preferences using the existing durable storage adapters."""

import json
from dataclasses import dataclass, field

from pydantic import TypeAdapter

from .blob_history import BlobHistoryStore
from .events import Feedback, Preferences, TagCorrection
from .history import HistoryStore


@dataclass
class PreferenceState:
    preferences: Preferences = field(default_factory=Preferences)
    feedback: dict[str, Feedback] = field(default_factory=dict)
    tag_corrections: dict[str, TagCorrection] = field(default_factory=dict)
    revision: str | None = None


def decode_preferences(user, data):
    payload = json.loads(data)
    if payload.get("format_version") != 1 or payload.get("user") != user:
        raise ValueError("Unsupported or mismatched preferences")
    return PreferenceState(
        preferences=Preferences.model_validate(payload["preferences"]),
        feedback=TypeAdapter(dict[str, Feedback]).validate_python(payload["feedback"]),
        tag_corrections=TypeAdapter(dict[str, TagCorrection]).validate_python(
            payload.get("tag_corrections", {})
        ),
    )


def encode_preferences(user, state):
    return {
        "format_version": 1,
        "user": user,
        "preferences": state.preferences.model_dump(mode="json"),
        "feedback": {eid: fb.model_dump() for eid, fb in state.feedback.items()},
        "tag_corrections": {
            eid: tc.model_dump() for eid, tc in state.tag_corrections.items()
        },
    }


class PreferenceStore(HistoryStore):
    decode = staticmethod(decode_preferences)
    encode = staticmethod(encode_preferences)
    empty = staticmethod(PreferenceState)


class BlobPreferenceStore(BlobHistoryStore):
    decode = staticmethod(decode_preferences)
    encode = staticmethod(encode_preferences)
    empty = staticmethod(PreferenceState)

    @staticmethod
    def _pathname(user):
        return BlobHistoryStore._pathname(user).replace("chat/", "preferences/", 1)
