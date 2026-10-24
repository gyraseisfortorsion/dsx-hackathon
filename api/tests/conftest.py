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
    return Settings(api_password="test-password", history_dir=tmp_path / "messages", _env_file=None)


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
