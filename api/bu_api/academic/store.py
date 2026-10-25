"""Versioned academic state using the service's local and private Blob adapters."""

import json
from dataclasses import dataclass

from ..blob_history import BlobHistoryStore
from ..history import HistoryStore, HistoryUnavailable
from .models import AcademicState


@dataclass
class StoredAcademicState:
    data: AcademicState | None = None
    revision: str | None = None


def decode_academic(user: str, data: bytes) -> StoredAcademicState:
    try:
        payload = json.loads(data)
        if payload.get("format_version") != 1 or payload.get("user") != user:
            raise ValueError("Unsupported or mismatched academic state")
        return StoredAcademicState(data=AcademicState.model_validate(payload["data"]))
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise HistoryUnavailable("Academic state could not be read") from exc


def encode_academic(user: str, state: StoredAcademicState) -> dict:
    return {"format_version": 1, "user": user, "data": state.data.model_dump(mode="json")}


class AcademicStore(HistoryStore):
    decode = staticmethod(decode_academic)
    encode = staticmethod(encode_academic)
    empty = staticmethod(StoredAcademicState)

    def load(self, user):
        try:
            return super().load(user)
        except OSError as exc:
            raise HistoryUnavailable("Academic state could not be read") from exc

    def save(self, user, state):
        try:
            return super().save(user, state)
        except OSError as exc:
            raise HistoryUnavailable("Academic state could not be saved") from exc


class BlobAcademicStore(BlobHistoryStore):
    decode = staticmethod(decode_academic)
    encode = staticmethod(encode_academic)
    empty = staticmethod(StoredAcademicState)

    @staticmethod
    def _pathname(user):
        return BlobHistoryStore._pathname(user).replace("chat/", "academic/", 1)
