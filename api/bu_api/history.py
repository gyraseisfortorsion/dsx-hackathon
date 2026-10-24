import asyncio
import json
import os
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import TypeAdapter
from pydantic_ai import ModelMessage, ModelMessagesTypeAdapter

from .schemas import ChatMessage


@dataclass
class Conversation:
    messages: list[ChatMessage] = field(default_factory=list)
    agent_messages: list[ModelMessage] = field(default_factory=list)
    revision: str | None = None


class HistoryConflict(Exception):
    """Another function committed this user's history while a turn was running."""


class HistoryUnavailable(Exception):
    """The durable history service could not be read or written."""


def decode_conversation(user: str, data: bytes) -> Conversation:
    payload = json.loads(data)
    if not isinstance(payload, dict) or payload.get("version") != 1 or payload.get("user") != user:
        raise ValueError("Unsupported or mismatched conversation")
    return Conversation(
        messages=TypeAdapter(list[ChatMessage]).validate_python(payload["messages"]),
        agent_messages=ModelMessagesTypeAdapter.validate_python(payload["agent_messages"]),
    )


def encode_conversation(user: str, conversation: Conversation) -> dict:
    return {
        "version": 1,
        "user": user,
        "messages": [message.model_dump(mode="json") for message in conversation.messages],
        "agent_messages": json.loads(
            ModelMessagesTypeAdapter.dump_json(conversation.agent_messages)
        ),
    }


class HistoryStore:
    def __init__(self, root: Path):
        self.root = root
        self._locks: dict[str, asyncio.Lock] = {}

    def _path(self, user: str) -> Path:
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}", user):
            raise ValueError("Invalid history user")
        return self.root / f"{user}.json"

    def lock(self, user: str) -> asyncio.Lock:
        return self._locks.setdefault(user, asyncio.Lock())

    def load(self, user: str) -> Conversation:
        path = self._path(user)
        try:
            data = path.read_bytes()
        except FileNotFoundError:
            return Conversation()
        return decode_conversation(user, data)

    def save(self, user: str, conversation: Conversation) -> None:
        path = self._path(user)
        payload = encode_conversation(user, conversation)
        self.root.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", dir=self.root, prefix=f".{user}-", suffix=".tmp", delete=False
            ) as handle:
                temporary = Path(handle.name)
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
