import asyncio
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.test import TestModel

from bu_api.main import create_app
from bu_api.public_api import BUPublicAPI, BUPublicError
from bu_api.public_models import BUBusRoutes, BUCampusRequest

from .conftest import AUTH

NOW = "2026-10-25T14:00:00Z"
FRESH = {"fetched_at": NOW, "stale": False, "source": "BU test source"}
LOCATION = {
    "id": "marciano",
    "name": "Marciano Commons",
    "short_name": "Marciano",
    "campus": "Charles River",
    "address": "Test address",
    "source_url": "https://www.bu.edu/dining/",
}
ITEM = {"id": "L123", "name": "Test lunch", "vegetarian": True, "calories": None}
PAYLOADS = {
    "transit/bus/routes": FRESH
    | {
        "routes": [
            {
                "id": 1,
                "name": "Test shuttle",
                "encoded_polyline": "",
                "is_running": True,
                "color": None,
                "show_route_arrows": False,
                "stops": [
                    {
                        "id": 10,
                        "physical_stop_id": 20,
                        "name": "Test stop",
                        "latitude": 42.35,
                        "longitude": -71.1,
                        "order": 1,
                    }
                ],
            }
        ]
    },
    "transit/bus/vehicles": FRESH | {"vehicles": []},
    "transit/bus/stops/10/arrivals": FRESH
    | {
        "stop_id": 10,
        "groups": [
            {
                "route_id": 1,
                "route_name": "Test shuttle",
                "route_stop_id": 10,
                "physical_stop_id": 20,
                "stop_name": "Test stop",
                "arrivals": [
                    {
                        "estimate_at": None,
                        "scheduled_at": None,
                        "seconds": None,
                        "is_arriving": False,
                        "is_departed": False,
                        "vehicle_id": None,
                        "on_time_status": None,
                        "status_text": None,
                        "is_live": False,
                    }
                ],
            }
        ],
    },
    "transit/bus/notices": FRESH
    | {
        "notices": [],
        "partial": True,
        "warnings": ["One provider unavailable"],
    },
    "dining/locations": {"locations": [LOCATION]},
    "dining/locations/marciano/menu": FRESH
    | {
        "location": LOCATION,
        "date": "2026-10-25",
        "schedules": [],
        "meals": [
            {
                "name": "Lunch",
                "item_count": 1,
                "stations": [{"name": "Test station", "items": [ITEM]}],
            }
        ],
        "open_now": True,
        "status": "Open",
        "current_meal": "Lunch",
        "source_url": "https://www.bu.edu/dining/",
    },
    "dining/locations/marciano/menu/items/L123": FRESH
    | ITEM
    | {
        "location": LOCATION,
        "date": "2026-10-25",
        "meal": "Lunch",
        "station": "Test station",
        "ingredients": None,
        "source_url": "https://www.bu.edu/dining/",
    },
}
ROUTES = tuple("/" + path for path in PAYLOADS)


@pytest.fixture
def public_settings(settings):
    settings.bu_public_api_key = SecretStr("test-bu-server-key")
    return settings


@pytest.fixture
def public_transport():
    requests = []

    def respond(request):
        assert request.url.host == "public.api-nonprod.bu.edu"
        assert request.headers["x-api-key"] == "test-bu-server-key"
        assert "authorization" not in request.headers
        assert request.method == "GET"
        requests.append(request)
        path = request.url.path.removeprefix("/api/v1/")
        return httpx.Response(200, json=PAYLOADS[path])

    return httpx.MockTransport(respond), requests


def public_app(settings, fake_transport, transport, model=None):
    return create_app(
        settings,
        model=model or TestModel(call_tools=[]),
        search_transport=fake_transport,
        bu_transport=transport,
    )


@pytest.mark.parametrize("route", ROUTES)
def test_public_routes_use_existing_auth_and_validate_users(
    public_settings, fake_transport, public_transport, route
):
    transport, requests = public_transport
    with TestClient(public_app(public_settings, fake_transport, transport)) as client:
        for headers in ({}, {"Authorization": "Bearer wrong"}):
            assert client.get(route + "?user=alex", headers=headers).status_code == 401
        assert client.get(route, headers=AUTH).status_code == 422
        assert client.get(route + "?user=unknown", headers=AUTH).status_code == 404
        assert requests == []
        response = client.get(route + "?user=alex", headers=AUTH)
        assert response.status_code == 200, response.text
        assert "test-bu-server-key" not in response.text
        # The campus data is public across demo users; only one upstream fetch is needed.
        assert client.get(route + "?user=maya", headers=AUTH).status_code == 200
        assert len(requests) == 1


@pytest.mark.parametrize(
    "path",
    [
        "/dining/locations/unknown/menu",
        "/dining/locations/marciano/menu?day=bad",
        "/transit/bus/stops/0/arrivals",
        "/transit/bus/stops/-1/arrivals",
    ],
)
def test_invalid_public_parameters_never_reach_bu(
    public_settings, fake_transport, public_transport, path
):
    transport, requests = public_transport
    with TestClient(public_app(public_settings, fake_transport, transport)) as client:
        separator = "&" if "?" in path else "?"
        assert client.get(path + separator + "user=alex", headers=AUTH).status_code == 422
    assert requests == []


def test_preserves_freshness_missing_data_and_explicit_menu_date(
    public_settings, fake_transport, public_transport
):
    transport, requests = public_transport
    with TestClient(public_app(public_settings, fake_transport, transport)) as client:
        menu = client.get(
            "/dining/locations/marciano/menu?user=alex&day=2026-10-25", headers=AUTH
        ).json()
        assert requests[-1].url.params["day"] == "2026-10-25"
        assert menu["fetched_at"].startswith("2026-10-25T14:00:00")
        assert menu["meals"][0]["stations"][0]["items"][0]["calories"] is None
        arrivals = client.get("/transit/bus/stops/10/arrivals?user=alex", headers=AUTH).json()
        assert arrivals["groups"][0]["arrivals"][0]["estimate_at"] is None
        notices = client.get("/transit/bus/notices?user=alex", headers=AUTH).json()
        assert notices["partial"] is True and notices["warnings"]
        assert client.get("/transit/bus/vehicles?user=alex", headers=AUTH).json()["vehicles"] == []


async def test_cache_coalesces_and_serves_only_bounded_stale_fallback(public_settings, monkeypatch):
    clock = [0.0]
    monkeypatch.setattr("bu_api.public_api.time.monotonic", lambda: clock[0])
    calls = []

    async def respond(request):
        calls.append(request)
        await asyncio.sleep(0)
        return (
            httpx.Response(200, json=PAYLOADS["transit/bus/routes"])
            if len(calls) == 1
            else httpx.Response(500)
        )

    async with httpx.AsyncClient(
        base_url="https://public.api-nonprod.bu.edu/api/v1/",
        transport=httpx.MockTransport(respond),
    ) as client:
        service = BUPublicAPI(client, public_settings)
        values = await asyncio.gather(
            *(service.get("transit/bus/routes", BUBusRoutes, ttl=1, max_age=3) for _ in range(4))
        )
        assert len(calls) == 1
        values[0].routes.clear()
        assert values[1].routes
        clock[0] = 2
        fallback = await service.get("transit/bus/routes", BUBusRoutes, ttl=1, max_age=3)
        assert fallback.stale and fallback.fetched_at == values[1].fetched_at
        clock[0] = 4
        with pytest.raises(BUPublicError):
            await service.get("transit/bus/routes", BUBusRoutes, ttl=1, max_age=3)


@pytest.mark.parametrize(
    "status,expected", [(401, 503), (403, 503), (404, 404), (422, 422), (429, 503), (500, 503)]
)
def test_upstream_errors_are_sanitized(public_settings, fake_transport, status, expected):
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            status,
            json={"detail": "sensitive-upstream-body"},
            headers={"location": "https://example.com"},
        )
    )
    with TestClient(public_app(public_settings, fake_transport, transport)) as client:
        response = client.get("/transit/bus/routes?user=alex", headers=AUTH)
        assert response.status_code == expected
        assert "sensitive-upstream-body" not in response.text
        assert response.headers["cache-control"] == "no-store"
        if status == 429:
            assert response.headers["retry-after"] == "60"


@pytest.mark.parametrize("problem", ["missing", "expired", "timeout", "malformed", "redirect"])
def test_unavailable_upstream_does_not_break_existing_api(public_settings, fake_transport, problem):
    if problem == "missing":
        public_settings.bu_public_api_key = None
    if problem == "expired":
        public_settings.bu_public_api_expires_at = datetime(2000, 1, 1, tzinfo=UTC)

    def respond(request):
        if problem in {"missing", "expired"}:
            pytest.fail("Disabled or expired credentials must never be sent")
        if problem == "timeout":
            raise httpx.ReadTimeout("simulated", request=request)
        if problem == "redirect":
            return httpx.Response(302, headers={"location": "https://example.com"})
        return httpx.Response(200, json={"wrong": "shape"})

    with TestClient(
        public_app(public_settings, fake_transport, httpx.MockTransport(respond))
    ) as client:
        assert client.get("/transit/bus/routes?user=alex", headers=AUTH).status_code == 503
        response = client.get("/meal-plan?user=alex", headers=AUTH)
        assert response.status_code == 200 and response.json()["is_mock"] is True


def test_assistant_uses_same_public_client_and_cites_source(
    public_settings, fake_transport, public_transport
):
    transport, requests = public_transport

    def respond(messages, info):
        if len(messages) == 1:
            assert any(t.name == "campus_services" for t in info.function_tools)
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        "campus_services",
                        {"request": {"resource": "locations"}},
                        tool_call_id="locations",
                    )
                ]
            )
        return ModelResponse(parts=[TextPart("See [BU Dining](https://www.bu.edu/dining/).")])

    with TestClient(
        public_app(public_settings, fake_transport, transport, FunctionModel(respond))
    ) as client:
        response = client.post(
            "/chat?user=alex", headers=AUTH, json={"message": "Where can I eat?"}
        )
        assert response.status_code == 200, response.text
        assert any(s["url"] == "https://www.bu.edu/dining/" for s in response.json()["sources"])
        assert len(requests) == 1


def test_required_tool_resource_parameters():
    from pydantic import ValidationError

    for resource in ("arrivals", "menu", "item"):
        with pytest.raises(ValidationError):
            BUCampusRequest(resource=resource)


@pytest.mark.parametrize("failure", [401, 429])
async def test_auth_rejection_and_rate_limits_back_off_without_retry_loops(
    public_settings, failure
):
    calls = []

    def respond(request):
        calls.append(request)
        return httpx.Response(failure)

    async with httpx.AsyncClient(
        base_url="https://public.api-nonprod.bu.edu/api/v1/",
        transport=httpx.MockTransport(respond),
    ) as client:
        service = BUPublicAPI(client, public_settings)
        for _ in range(3):
            with pytest.raises(BUPublicError):
                await service.fetch(BUCampusRequest(resource="routes"))
        assert len(calls) == 1
