"""Versioned per-user campus state on the existing atomic JSON/private Blob adapters."""

import json
from dataclasses import dataclass

from pydantic import Field

from .blob_history import BlobHistoryStore
from .history import HistoryStore, HistoryUnavailable
from .schemas import Schema
from .service_models import (
    Employment,
    HousingRequest,
    ServiceSettings,
    StudyGroup,
    Thread,
)


class CampusState(Schema):
    version: int = Field(default=0, ge=0)
    profile_name: str | None = None
    settings: ServiceSettings = Field(default_factory=ServiceSettings)
    threads: dict[str, Thread] = Field(default_factory=dict)
    joined_club_ids: list[str] = Field(default_factory=list)
    planned_club_ids: list[str] = Field(default_factory=list)
    deadline_course_ids: list[str] = Field(default_factory=list)
    study_groups: dict[str, StudyGroup] = Field(default_factory=dict)
    housing_requests: dict[str, HousingRequest] = Field(default_factory=dict)
    employment: Employment


@dataclass
class ServiceState:
    data: CampusState | None = None
    revision: str | None = None


def decode_services(user, data):
    try:
        payload = json.loads(data)
        if payload.get("format_version") != 1 or payload.get("user") != user:
            raise ValueError("Unsupported or mismatched campus state")
        return ServiceState(data=CampusState.model_validate(payload["data"]))
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise HistoryUnavailable("Campus state could not be read") from exc


def encode_services(user, state):
    return {"format_version": 1, "user": user, "data": state.data.model_dump(mode="json")}


class ServiceStore(HistoryStore):
    decode = staticmethod(decode_services)
    encode = staticmethod(encode_services)
    empty = staticmethod(ServiceState)

    def load(self, user):
        try:
            return super().load(user)
        except OSError as exc:
            raise HistoryUnavailable("Campus state could not be read") from exc

    def save(self, user, state):
        try:
            return super().save(user, state)
        except OSError as exc:
            raise HistoryUnavailable("Campus state could not be saved") from exc


class BlobServiceStore(BlobHistoryStore):
    decode = staticmethod(decode_services)
    encode = staticmethod(encode_services)
    empty = staticmethod(ServiceState)

    @staticmethod
    def _pathname(user):
        return BlobHistoryStore._pathname(user).replace("chat/", "services/", 1)
