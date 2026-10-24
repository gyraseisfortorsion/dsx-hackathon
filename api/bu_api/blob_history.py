"""Private JSON history using Vercel Blob's conditional-write HTTP API.

The Python Blob SDK currently lacks if_match and uncached private reads. The
headers below follow the official @vercel/blob SDK's put-helpers.ts/api.ts/get.ts:
https://github.com/vercel/storage/tree/main/packages/blob/src
"""

import re

import httpx
from vercel.oidc import get_vercel_oidc_token

from .history import (
    Conversation,
    HistoryConflict,
    HistoryStore,
    HistoryUnavailable,
    decode_conversation,
    encode_conversation,
)


class BlobHistoryStore(HistoryStore):
    def __init__(self, store_id: str, client: httpx.Client, token: str | None = None):
        if not re.fullmatch(r"store_[a-zA-Z0-9]+", store_id):
            raise ValueError("BLOB_STORE_ID must identify a private Vercel Blob store")
        self.store_id, self.client, self.token = store_id, client, token
        self._locks = {}

    @staticmethod
    def _pathname(user: str) -> str:
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}", user):
            raise ValueError("Invalid history user")
        return f"chat/{user}.json"

    def _headers(self) -> dict[str, str]:
        try:
            token = self.token or get_vercel_oidc_token()
        except Exception as exc:
            raise HistoryUnavailable("Blob authentication is unavailable") from exc
        return {
            "Authorization": f"Bearer {token}",
            "x-vercel-blob-store-id": self.store_id,
            "x-api-version": "13",
        }

    def load(self, user: str) -> Conversation:
        pathname = self._pathname(user)
        store = self.store_id.removeprefix("store_").lower()
        url = f"https://{store}.private.blob.vercel-storage.com/{pathname}"
        try:
            # Origin reads avoid stale cached JSON after a previous turn's overwrite.
            response = self.client.get(url, params={"cache": "0"}, headers=self._headers())
            if response.status_code == 404:
                return Conversation()
            response.raise_for_status()
            result = decode_conversation(user, response.content)
            result.revision = response.headers.get("etag")
            if not result.revision:
                raise HistoryUnavailable("Blob did not return a history revision")
            return result
        except httpx.HTTPError as exc:
            raise HistoryUnavailable("Could not read durable history") from exc

    def save(self, user: str, conversation: Conversation) -> None:
        pathname = self._pathname(user)
        headers = self._headers() | {
            "x-vercel-blob-access": "private",
            "x-content-type": "application/json",
            "x-add-random-suffix": "0",
            "x-cache-control-max-age": "60",
            "x-allow-overwrite": "1" if conversation.revision else "0",
        }
        if conversation.revision:
            headers["x-if-match"] = conversation.revision
        try:
            response = self.client.put(
                "https://vercel.com/api/blob/",
                params={"pathname": pathname},
                headers=headers,
                json=encode_conversation(user, conversation),
            )
            if response.status_code in {409, 412}:
                raise HistoryConflict("Conversation changed during this turn")
            # Existing-blob errors can use the API's structured error code with HTTP 400.
            if response.status_code == 400:
                error = response.json().get("error", {})
                if error.get("code") in {"blob_already_exists", "precondition_failed"}:
                    raise HistoryConflict("Conversation changed during this turn")
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise HistoryUnavailable("Could not save durable history") from exc
