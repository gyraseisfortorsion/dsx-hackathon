import httpx
import pytest
from fastapi.testclient import TestClient

from bu_api.config import Settings
from bu_api.main import create_app

from .conftest import AUTH, GET_ROUTES, USERS


@pytest.mark.parametrize("route", GET_ROUTES + ("/chat",))
@pytest.mark.parametrize("header", [None, "Bearer wrong", "Basic test-password", "Bearer"])
def test_every_route_requires_password(client, route, header):
    headers = {"Authorization": header} if header else {}
    if route == "/chat":
        response = client.post(
            route, params={"user": "alex"}, json={"message": "Hi"}, headers=headers
        )
    else:
        response = client.get(route, params={"user": "alex"}, headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("route", GET_ROUTES + ("/chat",))
@pytest.mark.parametrize(
    "query,expected", [(None, 422), ("", 422), ("../alex", 422), ("unknown", 404)]
)
def test_user_validation(client, route, query, expected):
    params = {} if query is None else {"user": query}
    method = client.post if route == "/chat" else client.get
    kwargs = {"json": {"message": "Hi"}} if route == "/chat" else {}
    assert method(route, params=params, headers=AUTH, **kwargs).status_code == expected


@pytest.mark.parametrize("user", USERS)
def test_all_read_endpoints(client, user):
    for route in GET_ROUTES:
        response = client.get(route, params={"user": user}, headers=AUTH)
        assert response.status_code == 200, response.text
        if route == "/events/recommended":
            assert response.json() and all(e["source_url"] for e in response.json())
        elif route == "/messages":
            assert response.json() == []
        elif route != "/openapi.json":
            assert response.json()["user"] == user
            assert response.json()["is_mock"] is True
            assert response.json()["as_of"] == "2026-10-24T12:00:00-04:00"


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"message": " "},
        {"message": "x" * 8001},
        {"message": 12},
        {"message": "hi", "user": "maya"},
    ],
)
def test_chat_body_validation(client, body):
    response = client.post("/chat?user=alex", headers=AUTH, json=body)
    assert response.status_code == 422


def test_schema_and_docs(client):
    response = client.get("/openapi.json?user=alex", headers=AUTH)
    assert response.headers["cache-control"] == "no-store"
    schema = response.json()
    assert set(schema["paths"]) == set(GET_ROUTES[:-1]) | {
        "/chat", "/preferences", "/events", "/events/options", "/events/search",
        "/events/clusters", "/events/saved", "/events/{event_id}",
        "/events/{event_id}/feedback",
        "/events/{event_id}/tags/suggest", "/events/{event_id}/tags",
    }
    for operations in schema["paths"].values():
        for operation in operations.values():
            assert operation["security"] == [{"HTTPBearer": []}]
            assert any(p["name"] == "user" and p["required"] for p in operation["parameters"])
    docs = client.get("/docs")
    assert docs.status_code == 200
    assert docs.headers["content-type"].startswith("text/html")
    assert docs.headers["cache-control"] == "no-store"
    assert "SwaggerUIBundle" in docs.text
    assert "test-password" not in docs.text
    assert "Alex Morgan" not in docs.text
    assert client.get("/redoc").status_code == 404


def test_cors_preflight(client):
    response = client.options(
        "/student?user=alex",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_requires_configured_password(tmp_path):
    with pytest.raises(RuntimeError, match="API_PASSWORD"):
        with TestClient(
            create_app(Settings(api_password="", _env_file=None, history_dir=tmp_path))
        ):
            pass


def test_without_gemini_key_data_still_works(settings, monkeypatch):
    for name in ("GOOGLE_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    with TestClient(
        create_app(
            settings, search_transport=httpx.MockTransport(lambda request: httpx.Response(503))
        )
    ) as client:
        assert client.get("/student?user=alex", headers=AUTH).status_code == 200
        response = client.post("/chat?user=alex", headers=AUTH, json={"message": "Hi"})
        assert response.status_code == 503
        assert client.get("/messages?user=alex", headers=AUTH).json() == []
