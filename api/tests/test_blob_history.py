import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic_ai.models.test import TestModel

from bu_api.academic.models import AcademicState
from bu_api.academic.store import BlobAcademicStore, StoredAcademicState
from bu_api.blob_history import BlobHistoryStore
from bu_api.events import Preferences
from bu_api.history import Conversation, HistoryConflict, HistoryUnavailable
from bu_api.main import create_app
from bu_api.preferences import BlobPreferenceStore

from .conftest import AUTH


def test_private_history_persists_and_rejects_racing_writes(blob_transport):
    transport, blobs = blob_transport
    with httpx.Client(transport=transport) as client:
        first = BlobHistoryStore("store_test123", client, "fixture-token")
        second = BlobHistoryStore("store_test123", client, "fixture-token")
        original = first.load("alex")
        racing = second.load("alex")
        assert original.messages == [] and original.revision is None
        first.save("alex", original)
        with pytest.raises(HistoryConflict):
            second.save("alex", racing)
        original = first.load("alex")
        racing = second.load("alex")
        assert original.revision == '"1"'
        first.save("alex", original)
        with pytest.raises(HistoryConflict):
            second.save("alex", racing)
        assert json.loads(blobs["chat/alex.json"][0])["user"] == "alex"
        assert first.load("alex").revision == '"2"'
        assert second.load("maya").messages == []
        with pytest.raises(ValueError):
            first.load("../alex")


def test_preferences_blob_is_separate_and_conditional(blob_transport):
    transport, blobs = blob_transport
    with httpx.Client(transport=transport) as client:
        store = BlobPreferenceStore("store_test123", client, "fixture-token")
        first, racing = store.load("alex"), store.load("alex")
        first.preferences = Preferences(version=1, interest_ids=["music"])
        store.save("alex", first)
        with pytest.raises(HistoryConflict):
            store.save("alex", racing)
        assert store.load("alex").preferences.interest_ids == ["music"]
        assert store.load("maya").preferences.version == 0
        assert "preferences/alex.json" in blobs
        assert "chat/alex.json" not in blobs


def test_academic_blob_is_separate_and_conditional(blob_transport):
    transport, blobs = blob_transport
    with httpx.Client(transport=transport) as client:
        store = BlobAcademicStore("store_test123", client, "fixture-token")
        first, racing = store.load("alex"), store.load("alex")
        first.data = AcademicState(version=1)
        store.save("alex", first)
        racing.data = AcademicState(version=1)
        with pytest.raises(HistoryConflict):
            store.save("alex", racing)
        restored = store.load("alex")
        assert isinstance(restored, StoredAcademicState)
        assert restored.data.version == 1
        assert "academic/alex.json" in blobs
        assert "chat/alex.json" not in blobs


def test_deployed_chat_and_messages_use_blob(settings, fake_transport, blob_transport, monkeypatch):
    transport, blobs = blob_transport
    settings.history_backend = "blob"
    settings.blob_store_id = "store_test123"
    from pydantic import SecretStr

    settings.blob_read_write_token = SecretStr("fixture-token")
    monkeypatch.setenv("VERCEL", "1")
    for index in range(2):
        app = create_app(
            settings,
            model=TestModel(call_tools=[], custom_output_text="Saved in Blob"),
            search_transport=fake_transport,
            history_transport=transport,
        )
        with TestClient(app) as client:
            response = client.post("/chat?user=alex", headers=AUTH, json={"message": "Hello"})
            assert response.status_code == 200, response.text
            assert len(client.get("/messages?user=alex", headers=AUTH).json()) == (index + 1) * 2
            assert client.get("/messages?user=maya", headers=AUTH).json() == []
    assert blobs and not settings.history_path().exists()


def test_vercel_cannot_silently_use_local_history(settings, monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    with pytest.raises(RuntimeError, match="HISTORY_BACKEND=blob"):
        with TestClient(create_app(settings)):
            pass


@pytest.mark.parametrize("status", [401, 403, 500])
def test_storage_errors_are_not_empty_history(status):
    with httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(status))
    ) as client:
        store = BlobHistoryStore("store_test123", client, "fixture-token")
        with pytest.raises(HistoryUnavailable):
            store.load("alex")
        with pytest.raises(HistoryUnavailable):
            store.save("alex", Conversation())


def test_blob_failure_returns_503(settings, fake_transport):
    from pydantic import SecretStr

    settings.history_backend = "blob"
    settings.blob_store_id = "store_test123"
    settings.blob_read_write_token = SecretStr("fixture-token")
    app = create_app(
        settings,
        model=TestModel(call_tools=[]),
        search_transport=fake_transport,
        history_transport=httpx.MockTransport(lambda request: httpx.Response(503)),
    )
    with TestClient(app) as client:
        assert client.get("/messages?user=alex", headers=AUTH).status_code == 503
        assert (
            client.post("/chat?user=alex", headers=AUTH, json={"message": "Hi"}).status_code == 503
        )
