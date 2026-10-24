"""Tests for event auto-tagging: suggest, organizer correction, card override."""

from .conftest import AUTH


def _first_event_id(client):
    r = client.get("/events", params={"user": "alex", "limit": 1}, headers=AUTH)
    assert r.status_code == 200, r.text
    return r.json()["items"][0]["id"]


def test_artifact_events_carry_tag_fields(client):
    r = client.get("/events", params={"user": "alex", "limit": 5}, headers=AUTH)
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert "tags" in item
        assert item["taxonomy_version"] == "1"
        assert item["tag_source"] in {"baseline", "model", "organizer"}


def test_suggest_tags_requires_auth(client):
    eid = _first_event_id(client)
    assert client.get(f"/events/{eid}/tags/suggest", params={"user": "alex"}).status_code == 401


def test_suggest_tags_returns_contract(client):
    eid = _first_event_id(client)
    r = client.get(f"/events/{eid}/tags/suggest", params={"user": "alex"}, headers=AUTH)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["taxonomy_version"] == "1"
    assert data["status"] in {"ok", "no_confident_tag", "insufficient_text"}
    for item in data["suggestions"]:
        assert set(item) == {"tag_id", "score", "source"}
        assert item["source"] == "baseline"


def test_correction_overrides_auto_tags(client):
    eid = _first_event_id(client)
    # Correct to an explicit set.
    r = client.put(
        f"/events/{eid}/tags",
        params={"user": "alex"},
        headers=AUTH,
        json={"prediction_id": "p1", "final_tag_ids": ["tech", "free-food"]},
    )
    assert r.status_code == 200, r.text
    card = r.json()
    assert card["tag_source"] == "organizer"
    assert set(card["tags"]) == {"tech", "free-food"}
    assert all(v is None for v in card["tags"].values())  # organizer tags have no score
    # The detail card reflects the correction too.
    detail = client.get(f"/events/{eid}", params={"user": "alex"}, headers=AUTH).json()
    assert detail["tag_source"] == "organizer"
    assert set(detail["tags"]) == {"tech", "free-food"}


def test_empty_correction_is_a_real_override(client):
    eid = _first_event_id(client)
    r = client.put(
        f"/events/{eid}/tags",
        params={"user": "alex"},
        headers=AUTH,
        json={"final_tag_ids": []},
    )
    assert r.status_code == 200, r.text
    card = r.json()
    assert card["tag_source"] == "organizer"
    assert card["tags"] == {}  # "reviewed, no tag applies" -- not the auto set


def test_correction_rejects_unknown_tag(client):
    eid = _first_event_id(client)
    r = client.put(
        f"/events/{eid}/tags",
        params={"user": "alex"},
        headers=AUTH,
        json={"final_tag_ids": ["not-a-real-tag"]},
    )
    assert r.status_code == 422


def test_correction_unknown_event_is_404(client):
    r = client.put(
        "/events/nope/tags", params={"user": "alex"}, headers=AUTH, json={"final_tag_ids": []}
    )
    assert r.status_code == 404
