import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import FunctionModel
from sklearn.feature_extraction.text import TfidfVectorizer

from bu_api.main import create_app

from .conftest import AUTH


def test_offline_runtime_vector_parity(client):
    service = client.app.state.events
    texts = [
        e["title"] + " " + e["description"] + " " + e["source_category"] for e in service.events
    ]
    reference = TfidfVectorizer(stop_words="english", sublinear_tf=True).fit(texts)
    for text in ["robotics science music music", "JAZZ concert and friends", "zzzxxyy"]:
        row = reference.transform([text]).getrow(0)
        expected = {
            reference.get_feature_names_out()[j]: v
            for j, v in zip(row.indices, row.data, strict=True)
        }
        assert service.vectorize(text) == pytest.approx(expected)
    assert len(service.events) == 247


def test_preferences_rank_and_persist(settings, fake_transport, client):
    service = client.app.state.events
    all_events = client.get("/events?user=alex&limit=100", headers=AUTH).json()
    assert all_events["mode"] == "general"
    assert all_events["total"] > 0
    original = client.get("/preferences?user=alex", headers=AUTH).json()
    update = original | {"interests_text": "jazz music concert"}
    response = client.put("/preferences?user=alex", headers=AUTH, json=update)
    assert response.status_code == 200
    assert response.json()["version"] == 1
    assert client.put("/preferences?user=alex", headers=AUTH, json=update).status_code == 409
    personalized = client.post("/events/search?user=alex", headers=AUTH, json={}).json()
    assert personalized["mode"] == "personalized"
    assert personalized["items"][0]["score"] > 0
    assert client.get("/preferences?user=maya", headers=AUTH).json()["interests_text"] == ""
    assert client.app.state.events is service  # requests reuse the same loaded artifacts
    with TestClient(create_app(settings, search_transport=fake_transport)) as other:
        assert other.get("/preferences?user=alex", headers=AUTH).json()["version"] == 1
        # Discovery does not require a configured model or any model call.
        assert other.post("/events/search?user=alex", headers=AUTH, json={}).status_code == 200


def test_feedback_saved_hidden_and_idempotency(client):
    event = client.get("/events?user=alex", headers=AUTH).json()["items"][0]
    path = f"/events/{event['id']}/feedback?user=alex"
    first = client.put(path, headers=AUTH, json={"saved": True}).json()
    assert first == client.put(path, headers=AUTH, json={"saved": True}).json()
    assert client.get("/events/saved?user=alex", headers=AUTH).json()[0]["id"] == event["id"]
    assert client.get("/events/saved?user=maya", headers=AUTH).json() == []
    client.put(path, headers=AUTH, json={"not_interested": True})
    ids = [e["id"] for e in client.get("/events?user=alex&limit=100", headers=AUTH).json()["items"]]
    assert event["id"] not in ids
    assert client.get("/events/saved?user=alex", headers=AUTH).json() == []
    assert (
        client.put(path, headers=AUTH, json={"saved": True, "not_interested": True}).status_code
        == 422
    )


def test_filters_conflicts_and_no_match(client):
    app = client.app
    student = app.state.repository.students["alex"]
    busy = next(
        e
        for e in app.state.repository.calendar(student).events
        if e.ends_at and e.starts_at > student.profile.as_of
    )
    event = app.state.events.events[0].copy()
    event.update(starts_at=busy.starts_at.isoformat(), ends_at=busy.ends_at.isoformat())
    app.state.events.events = [event]
    # A known conflicting event is excluded unless the toggle is disabled.
    assert client.post("/events/search?user=alex", headers=AUTH, json={}).json()["total"] == 0
    unfiltered = {"filters": {"avoid_schedule_conflicts": False}}
    response = client.post("/events/search?user=alex", headers=AUTH, json=unfiltered).json()
    assert response["items"][0]["conflict_ids"]
    window = {
        "starts_at": busy.starts_at.isoformat(),
        "ends_at": (busy.ends_at - timedelta(minutes=1)).isoformat(),
    }
    unfiltered["filters"]["available_windows"] = [window]
    assert (
        client.post("/events/search?user=alex", headers=AUTH, json=unfiltered).json()["total"] == 0
    )
    result = client.post("/events/search?user=alex", headers=AUTH, json={"query": "zzzxxyy"}).json()
    assert result["mode"] == "no_match" and result["items"] == []
    assert (
        client.post(
            "/events/search?user=alex",
            headers=AUTH,
            json={"filters": {"starts_from": "2026-10-25T00:00:00"}},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/events/search?user=alex",
            headers=AUTH,
            json={"filters": {"category_ids": ["nonexistent"]}},
        ).status_code
        == 422
    )


@pytest.mark.parametrize(
    "route",
    [
        "/preferences",
        "/events",
        "/events/options",
        "/events/clusters",
        "/events/saved",
        "/events/unknown",
    ],
)
def test_new_routes_require_user_and_auth(client, route):
    assert client.get(route + "?user=alex").status_code == 401
    assert client.get(route + "?user=unknown", headers=AUTH).status_code == 404


def test_chat_event_cards_are_canonical_and_persist(settings, fake_transport):
    def respond(messages, info):
        if len(messages) == 1:
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        "search_events",
                        {"request": {"query": "music", "limit": 3}},
                        tool_call_id="events",
                    )
                ]
            )
        return ModelResponse(parts=[TextPart(content="Here are campus music events.")])

    with TestClient(
        create_app(settings, model=FunctionModel(respond), search_transport=fake_transport)
    ) as client:
        response = client.post(
            "/chat?user=alex", headers=AUTH, json={"message": "Find music events"}
        )
        assert response.status_code == 200, response.text
        cards = response.json()["event_cards"]
        assert cards
        for card in cards:
            assert card["title"] == client.app.state.events.by_id[card["id"]]["title"]
        assert client.get("/messages?user=alex", headers=AUTH).json()[-1]["event_cards"] == cards
    payload = json.loads((settings.history_path() / "alex.json").read_text())
    assert payload["messages"][-1]["event_cards"] == cards
