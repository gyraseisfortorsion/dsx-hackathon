import gzip

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic_ai import models
from pydantic_ai.models.test import TestModel

from bu_api.config import Settings
from bu_api.main import create_app

AUTH = {"Authorization": "Bearer test-password"}
USERS = ("alex", "maya", "jordan", "sam", "taylor")
GET_ROUTES = (
    "/student",
    "/meal-plan",
    "/courses",
    "/calendar",
    "/attendance",
    "/grades",
    "/events/recommended",
    "/messages",
    "/openapi.json",
)


@pytest.fixture(autouse=True)
def no_live_model_requests(monkeypatch):
    monkeypatch.setattr(models, "ALLOW_MODEL_REQUESTS", False)


@pytest.fixture
def settings(tmp_path):
    return Settings(
        api_password="test-password",
        history_dir=tmp_path / "messages",
        _env_file=None,
        bu_public_api_key=None,
        bu_public_api_expires_at=None,
    )


@pytest.fixture
def fake_transport():
    def respond(request):
        return httpx.Response(
            200,
            text="""<main><h1>BU Meal Plan Guide</h1>
            <p>Dining points: one point equals one dollar. Kosher includes $410 in 2026–2027.</p>
            <p>Weekly meal swipes reset on Friday.</p></main>""",
            headers={"content-type": "text/html"},
        )

    return httpx.MockTransport(respond)


@pytest.fixture
def client(settings, fake_transport):
    app = create_app(
        settings,
        model=TestModel(call_tools=[], custom_output_text="Mock reply"),
        search_transport=fake_transport,
    )
    with TestClient(app) as client:
        yield client


@pytest.fixture
def blob_transport():
    blobs = {}

    def handler(request):
        assert request.headers["authorization"] == "Bearer fixture-token"
        assert request.headers["x-vercel-blob-store-id"] == "store_test123"
        if request.method == "GET":
            assert request.url.params["cache"] == "0"
            blob = blobs.get(request.url.path.removeprefix("/"))
            if not blob:
                return httpx.Response(404)
            # Match Blob's real HTTP behavior: compressed responses carry weak ETags,
            # which cannot satisfy the strong revision required by a conditional PUT.
            content, revision = blob
            if "gzip" in request.headers.get("accept-encoding", ""):
                return httpx.Response(
                    200,
                    content=gzip.compress(content),
                    headers={"etag": f"W/{revision}", "content-encoding": "gzip"},
                )
            return httpx.Response(200, content=content, headers={"etag": revision})
        assert request.method == "PUT"
        assert request.headers["x-vercel-blob-access"] == "private"
        assert request.headers["x-add-random-suffix"] == "0"
        path = request.url.params["pathname"]
        old = blobs.get(path)
        if old and request.headers.get("x-if-match") != old[1]:
            return httpx.Response(412)
        assert request.headers["x-allow-overwrite"] == ("1" if old else "0")
        version = int(old[1].strip('"')) + 1 if old else 1
        blobs[path] = (request.content, f'"{version}"')
        return httpx.Response(200, json={"etag": f'"{version}"'})

    return httpx.MockTransport(handler), blobs
