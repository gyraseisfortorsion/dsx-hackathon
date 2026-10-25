"""Behavioral contract for persistent, isolated prototype campus services."""

import base64
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from bu_api.history import HistoryConflict
from bu_api.main import create_app
from bu_api.service_data import initial_employment
from bu_api.service_store import BlobServiceStore, CampusState

from .conftest import AUTH, USERS

READS = [
    "/chats",
    "/clubs",
    "/calendar/extras",
    "/housing",
    "/housing/contacts",
    "/housing/requests",
    "/dining/transactions",
    "/work",
    "/work/job",
    "/work/pay",
    "/work/direct-deposit",
    "/work/checklist",
    "/work/timesheets",
    "/settings/preferences",
    "/resources",
    "/resources/external-links",
]


def get(client, path, user="alex"):
    response = client.get(path, params={"user": user}, headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def write(client, path, body, method="put", user="alex", status=200):
    response = client.request(method, path, params={"user": user}, headers=AUTH, json=body)
    assert response.status_code == status, response.text
    return response.json()


@pytest.mark.parametrize("user", USERS)
def test_service_reads(client, user):
    for route in READS:
        result = get(client, route, user)
        assert result["user"] == user
        assert result["version"] == 0
        assert result["is_mock"] is True
        assert result["as_of"] == "2026-10-24T12:00:00-04:00"
    threads = get(client, "/chats", user)["data"]
    enrolled = {row["id"] for row in get(client, "/courses", user)["courses"]}
    assert {row["course_id"] for row in threads if row["kind"] == "class"} == enrolled
    assert get(client, "/work/direct-deposit", user)["data"]["account_last_four"] == "4821"


def test_all_service_routes_authenticate_and_validate_user(client):
    schema = get(client, "/openapi.json")
    paths = [path for path in schema["paths"] if path.startswith(tuple(READS))]
    for path in paths + ["/student"]:
        sample = path
        for placeholder in [
            "thread_id",
            "club_id",
            "request_id",
            "sheet_id",
            "shift_id",
            "course_id",
            "item_id",
            "link_id",
            "page_id",
        ]:
            sample = sample.replace("{" + placeholder + "}", "unknown")
        for method in schema["paths"][path]:
            assert client.request(method, sample + "?user=alex").status_code == 401
            assert client.request(method, sample, headers=AUTH).status_code == 422
            assert client.request(method, sample + "?user=unknown", headers=AUTH).status_code == 404


def test_clubs_deadlines_and_bookmarks_are_separate(client):
    base_calendar = get(client, "/calendar")
    club = "/clubs/data-science-association"
    result = write(client, club + "/membership", {"version": 0, "enabled": True})
    assert result["data"]["joined"]
    assert get(client, "/calendar/extras")["data"] == []
    write(client, club + "/open-house", {"version": 1, "enabled": True})
    extras = get(client, "/calendar/extras")["data"]
    assert len(extras) == 1 and extras[0]["starts_at"] == "2026-10-24T18:00:00-04:00"
    write(client, club + "/open-house", {"version": 2, "enabled": True})
    assert len(get(client, "/calendar/extras")["data"]) == 1
    course = get(client, "/courses")["courses"][0]["id"]
    write(client, f"/calendar/deadlines/{course}", {"version": 3, "enabled": True})
    assert len(get(client, "/calendar/extras")["data"]) == 2
    write(client, f"/calendar/deadlines/{course}", {"version": 4, "enabled": False})
    eid = get(client, "/events/recommended")[0]["id"]
    write(client, f"/events/{eid}/feedback", {"saved": True})
    assert len(get(client, "/calendar/extras")["data"]) == 1
    assert get(client, "/calendar") == base_calendar
    assert get(client, "/calendar/extras", "maya")["data"] == []
    write(client, club + "/open-house", {"version": 5, "enabled": False})
    assert get(client, "/calendar/extras")["data"] == []


def test_messages_and_study_groups(client):
    thread = next(row for row in get(client, "/chats")["data"] if row["kind"] == "class")
    path = f"/chats/{thread['id']}"
    message = write(
        client, path + "/messages", {"version": 0, "body": "Let's study"}, method="post", status=201
    )
    assert message["data"]["author"] == "Alex Morgan"
    assert message["data"]["from_me"]
    assert get(client, path)["data"]["preview"] == "Let's study"
    assert all(row["preview"] != "Let's study" for row in get(client, "/chats", "maya")["data"])
    group = write(
        client,
        path + "/study-groups",
        {
            "version": 1,
            "title": "Midterm study",
            "starts_at": "2026-10-24T13:00:00-04:00",
            "ends_at": "2026-10-24T14:00:00-04:00",
            "location": "Mugar fourth floor",
        },
        method="post",
        status=201,
    )["data"]
    assert get(client, f"/chats/{group['thread_id']}")["data"]["kind"] == "study_group"
    assert get(client, "/calendar/extras")["data"][0]["id"] == group["id"]
    write(
        client,
        "/chats/jamie-lee/study-groups",
        {
            "version": 2,
            "title": "Study",
            "starts_at": "2026-10-24T13:00:00-04:00",
            "ends_at": "2026-10-24T14:00:00-04:00",
            "location": "Mugar",
        },
        method="post",
        status=422,
    )
    write(client, path + "/messages", {"version": 2, "body": "  "}, method="post", status=422)
    assert get(client, "/messages") == []  # Peer chat never enters assistant history.


def test_housing_photos_timeline_and_isolation(client):
    photo = {
        "name": "radiator.png",
        "media_type": "image/png",
        "content_base64": base64.b64encode(b"\x89PNG\r\n\x1a\nfixture").decode(),
    }
    body = {
        "version": 0,
        "description": "Radiator is noisy",
        "category": "Heating & Cooling",
        "urgency": "Urgent",
        "building": "Warren Towers A",
        "room": "814",
        "photos": [photo],
    }
    result = write(client, "/housing/requests", body, method="post", status=201)
    path = f"/housing/requests/{result['data']['id']}"
    assert result["data"]["photos"] == [photo]
    updated = write(client, path, {"version": 1, "status": "Assigned", "text": "Visit tomorrow"})
    assert [row["status"] for row in updated["data"]["updates"]] == ["Submitted", "Assigned"]
    assert client.get(path + "?user=maya", headers=AUTH).status_code == 404
    write(
        client,
        "/housing/requests",
        body
        | {
            "version": 2,
            "photos": [
                photo
                | {
                    "content_base64": "not-base64",
                }
            ],
        },
        method="post",
        status=422,
    )
    assert get(client, path)["version"] == 2


def test_timesheet_computation_overlap_release_and_immutability(client):
    path = "/work/timesheets/2026-10-19"
    shift = {
        "version": 0,
        "date": "2026-10-24",
        "start": "10:00",
        "end": "12:00",
        "break_minutes": 30,
        "note": "Library shift",
    }
    result = write(client, path + "/shifts", shift, method="post", status=201)
    assert result["data"]["hours"] == 10
    assert result["data"]["gross_cents"] == 17500
    sid = result["data"]["shifts"][-1]["id"]
    write(client, path + "/shifts", shift | {"version": 1}, method="post", status=422)
    write(
        client,
        path + "/shifts",
        shift | {"version": 1, "date": "2026-11-01"},
        method="post",
        status=422,
    )
    write(client, path + "/shifts", shift | {"version": 1, "hours": 100}, method="post", status=422)
    result = write(client, path + f"/shifts/{sid}", shift | {"version": 1, "end": "13:00"})
    assert result["data"]["hours"] == 11
    response = client.delete(path + f"/shifts/{sid}?user=alex&version=2", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["data"]["hours"] == 8.5
    assert write(client, path + "/release", {"version": 3}, method="post")["data"]["status"] == (
        "Awaiting supervisor"
    )
    write(client, path + "/shifts", shift | {"version": 4}, method="post", status=409)
    write(client, path + "/release", {"version": 4}, method="post", status=409)
    assert get(client, path, "maya")["data"]["status"] == "Draft"


def test_settings_profile_and_restart(client, settings):
    original_events = get(client, "/preferences")
    prefs = get(client, "/settings/preferences")["data"] | {"vegetarian": False}
    write(client, "/settings/preferences", {"version": 0, "settings": prefs})
    write(client, "/student", {"version": 1, "full_name": "Alex Example"})
    write(client, "/work/checklist/tax", {"version": 2, "enabled": True})
    write(client, "/student", {"version": 1, "full_name": "Stale"}, status=409)
    assert get(client, "/student")["full_name"] == "Alex Example"
    assert get(client, "/resources/edit-profile")["data"]["rows"][0] == "Alex Example"
    assert get(client, "/preferences") == original_events
    with TestClient(create_app(settings)) as restarted:
        assert get(restarted, "/settings/preferences")["data"]["vegetarian"] is False
        assert get(restarted, "/student")["full_name"] == "Alex Example"
        assert get(restarted, "/student", "maya")["full_name"] == "Maya Patel"
        tax = next(row for row in get(restarted, "/work/checklist")["data"] if row["id"] == "tax")
        assert tax["complete"] is True


def test_concurrent_updates_do_not_lose_writes(client):
    body = {"version": 0, "enabled": True}
    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(
            pool.map(
                lambda _: (
                    client.put(
                        "/clubs/data-science-association/membership?user=alex",
                        json=body,
                        headers=AUTH,
                    ).status_code
                ),
                range(2),
            )
        )
    assert sorted(codes) == [200, 409]


def test_corruption_and_failed_save_return_503(client, monkeypatch):
    store = client.app.state.services
    store.root.mkdir(parents=True)
    store._path("alex").write_text('{"format_version": 1, "user": "maya"}')
    assert client.get("/chats?user=alex", headers=AUTH).status_code == 503
    store._path("alex").unlink()

    def fail_save(user, state):
        raise OSError("disk full")

    # Exercise the local adapter's error conversion, not a replacement of save itself.
    monkeypatch.setattr("bu_api.history.os.replace", fail_save)
    write(
        client,
        "/clubs/data-science-association/membership",
        {
            "version": 0,
            "enabled": True,
        },
        status=503,
    )
    assert not get(client, "/clubs/data-science-association")["data"]["joined"]


def test_service_blob_conditional_writes_and_separate_namespace(blob_transport):
    transport, blobs = blob_transport
    with httpx.Client(transport=transport) as http:
        store = BlobServiceStore("store_test123", http, "fixture-token")
        first, stale = store.load("alex"), store.load("alex")
        first.data = CampusState(profile_name="Alex Example", employment=initial_employment())
        stale.data = CampusState(profile_name="Stale", employment=initial_employment())
        store.save("alex", first)
        with pytest.raises(HistoryConflict):
            store.save("alex", stale)
        first, stale = store.load("alex"), store.load("alex")
        store.save("alex", first)
        with pytest.raises(HistoryConflict):
            store.save("alex", stale)
        assert store.load("alex").data.profile_name == "Alex Example"
        assert set(blobs) == {"services/alex.json"}


def test_blob_api_restart_and_outage(settings, blob_transport):
    transport, blobs = blob_transport
    settings.history_backend = "blob"
    settings.blob_store_id = "store_test123"
    settings.blob_read_write_token = SecretStr("fixture-token")
    with TestClient(create_app(settings, history_transport=transport)) as client:
        write(client, "/clubs/data-science-association/membership", {"version": 0, "enabled": True})
    with TestClient(create_app(settings, history_transport=transport)) as client:
        assert get(client, "/clubs/data-science-association")["data"]["joined"]
    assert "services/alex.json" in blobs
    failure = httpx.MockTransport(lambda _: httpx.Response(503))
    with TestClient(create_app(settings, history_transport=failure)) as client:
        assert client.get("/clubs?user=alex", headers=AUTH).status_code == 503
