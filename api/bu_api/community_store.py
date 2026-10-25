"""One shared community document: atomic local writes or conditional private Blob writes."""

import json
from dataclasses import dataclass, field

from .blob_history import BlobHistoryStore
from .community_models import CommunityData
from .history import HistoryStore, HistoryUnavailable


@dataclass
class CommunityState:
    data: CommunityData = field(default_factory=CommunityData)
    revision: str | None = None


def decode(user, data):
    try:
        payload = json.loads(data)
        if payload["format_version"] != 1 or payload["user"] != user:
            raise ValueError("Unsupported community state")
        return CommunityState(data=CommunityData.model_validate(payload["data"]))
    except (ValueError, TypeError, KeyError) as exc:
        raise HistoryUnavailable("Community storage unavailable") from exc


def encode(user, state):
    return {"format_version": 1, "user": user, "data": state.data.model_dump(mode="json")}


class CommunityStore(HistoryStore):
    decode = staticmethod(decode)
    encode = staticmethod(encode)
    empty = staticmethod(CommunityState)

    def load(self, user):
        try:
            return super().load(user)
        except OSError as exc:
            raise HistoryUnavailable("Community storage unavailable") from exc

    def save(self, user, state):
        try:
            return super().save(user, state)
        except OSError as exc:
            raise HistoryUnavailable("Community storage unavailable") from exc


class BlobCommunityStore(BlobHistoryStore):
    decode = staticmethod(decode)
    encode = staticmethod(encode)
    empty = staticmethod(CommunityState)

    @staticmethod
    def _pathname(user):
        return BlobHistoryStore._pathname(user).replace("chat/", "community/", 1)
