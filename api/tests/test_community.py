"""Cross-account acceptance checks for both community features, without live services."""

import base64
import io
from datetime import UTC, datetime, timedelta

import pytest
from PIL import Image
from pydantic import ValidationError

from bu_api.community_logic import intervals, merge_intervals, overlap, rank_match
from bu_api.community_models import StudyProfile
from bu_api.community_store import BlobCommunityStore, CommunityStore

AUTH = {"Authorization": "Bearer test-password"}


@pytest.fixture(autouse=True)
def fixed_community_clock(monkeypatch):
    from bu_api import community_routes

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 10, 24, 12, tzinfo=UTC)

    monkeypatch.setattr(community_routes, "datetime", Clock)


def get(client, path, user="alex", **params):
    return client.get(path, params={"user": user, **params}, headers=AUTH)


def post(client, path, body=None, user="alex", **headers):
    return client.post(path, params={"user": user}, json=body, headers={**AUTH, **headers})


def put(client, path, body, user="alex"):
    return client.put(path, params={"user": user}, json=body, headers=AUTH)


def study(**changes):
    return {
        "term": "fall-2026",
        "course_ids": ["CAS CS 111"],
        "discovery": True,
        "goals": ["exam_preparation"],
        "study_format": "quiet",
        "meeting_mode": "online",
        "availability": [{"weekday": i, "start": "16:00", "end": "18:00"} for i in range(7)],
        **changes,
    }


def setup_matches(client):
    assert put(client, "/study/profile", study()).status_code == 200
    assert put(client, "/study/profile", study(), "maya").status_code == 200
    return get(client, "/study/matches").json()["items"]


def photo_data():
    image = Image.new("RGB", (16, 16), "red")
    output = io.BytesIO()
    image.save(output, "JPEG", exif=Image.Exif())
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode()


def listing(client, user="alex", **changes):
    uploaded = post(client, "/marketplace/photos", {"data": photo_data()}, user)
    assert uploaded.status_code == 201, uploaded.text
    return {
        "title": "Algorithms textbook",
        "description": "A clean copy for next semester.",
        "category": "books",
        "condition": "good",
        "price_minor": 1200,
        "currency": "USD",
        "pickup_area": "Mugar Library",
        "photo_ids": [uploaded.json()["id"]],
        "isbn": "978-0-306-40615-7",
        **changes,
    }


def test_study_matching_explanations_privacy_and_determinism(client):
    rows = setup_matches(client)
    assert len(rows) == 1
    assert rows[0]["student_id"] == "maya"
    assert rows[0]["score"] == 100
    assert rows[0]["course_ids"] == ["cas-cs-111"]
    assert rows[0]["shared_goals"] == ["exam_preparation"]
    assert rows[0]["overlap_minutes"] >= 30
    assert "availability" not in rows[0] and "email" not in rows[0]
    assert get(client, "/study/matches").json()["items"] == rows
    put(client, "/study/profile", study(discovery=False), "maya")
    assert get(client, "/study/matches").json()["items"] == []


def test_profile_cleaning_stale_terms_and_empty_results(client):
    body = study(
        course_ids=["CASCS111", "cas-cs-111"],
        availability=[
            {"weekday": 0, "start": "16:00", "end": "18:00"},
            {"weekday": 0, "start": "17:00", "end": "19:00"},
        ],
    )
    saved = put(client, "/study/profile", body).json()
    assert saved["course_ids"] == ["cas-cs-111"]
    assert saved["availability"][0]["end"] == "19:00"
    assert len(saved["availability"]) == 1
    assert get(client, "/study/matches").json()["explanation"]
    assert put(client, "/study/profile", study(term="spring-2026")).status_code == 422
    assert put(client, "/study/profile", study(course_ids=["fake-course"])).status_code == 422
    assert put(client, "/study/profile", study(timezone="Not/AZone")).status_code == 422
    assert (
        put(
            client,
            "/study/profile",
            study(availability=[{"weekday": 0, "start": "18:00", "end": "16:00"}]),
        ).status_code
        == 422
    )
    assert put(client, "/study/profile", study(discovery=True, goals=[])).status_code == 422


def test_invitation_lifecycle_duplicate_feedback_and_conversation_access(client):
    setup_matches(client)
    body = {"recipient": "maya", "course_id": "cas-cs-111", "message": "Review together?"}
    invitation = post(client, "/study/invitations", body).json()
    iid = invitation["id"]
    assert post(client, "/study/invitations", body).status_code == 409
    reverse = {"recipient": "alex", "course_id": "cas-cs-111"}
    assert post(client, "/study/invitations", reverse, "maya").status_code == 409
    assert (
        post(client, f"/study/invitations/{iid}/action", {"action": "accept"}, "jordan").status_code
        == 403
    )
    assert post(client, f"/study/invitations/{iid}/action", {"action": "accept"}).status_code == 403
    accepted = post(client, f"/study/invitations/{iid}/action", {"action": "accept"}, "maya").json()
    cid = accepted["conversation_id"]
    assert get(client, f"/community/conversations/{cid}", "jordan").status_code == 404
    assert (
        post(
            client, f"/community/conversations/{cid}/messages", {"body": "Hi"}, "jordan"
        ).status_code
        == 404
    )
    assert (
        post(client, f"/community/conversations/{cid}/messages", {"body": "Hi"}).status_code == 201
    )
    assert (
        get(client, f"/community/conversations/{cid}", "maya").json()["messages"][0]["body"] == "Hi"
    )
    assert (
        put(
            client, f"/study/invitations/{iid}/feedback", {"useful": True, "studied_together": True}
        ).status_code
        == 200
    )
    assert (
        put(client, f"/study/invitations/{iid}/feedback", {"useful": True}, "jordan").status_code
        == 403
    )
    assert "feedback" not in get(client, "/study/invitations", "maya").json()[0]


@pytest.mark.parametrize("action,actor", [("decline", "maya"), ("cancel", "alex")])
def test_decline_cancel_never_open_conversation(client, action, actor):
    setup_matches(client)
    invitation = post(
        client, "/study/invitations", {"recipient": "maya", "course_id": "cas-cs-111"}
    ).json()
    result = post(
        client, f"/study/invitations/{invitation['id']}/action", {"action": action}, actor
    )
    assert result.status_code == 200 and result.json()["conversation_id"] is None
    assert get(client, "/community/conversations").json() == []


def test_bidirectional_blocks_prevent_discovery_invitations_and_messages(client):
    setup_matches(client)
    invitation = post(
        client, "/study/invitations", {"recipient": "maya", "course_id": "cas-cs-111"}
    ).json()
    cid = post(
        client, f"/study/invitations/{invitation['id']}/action", {"action": "accept"}, "maya"
    ).json()["conversation_id"]
    assert put(client, "/community/blocks/maya", {"enabled": True}).status_code == 200
    assert get(client, "/study/matches").json()["items"] == []
    assert get(client, "/study/matches", "maya").json()["items"] == []
    assert (
        post(client, f"/community/conversations/{cid}/messages", {"body": "Hi"}, "maya").status_code
        == 403
    )
    assert get(client, f"/community/conversations/{cid}").status_code == 200
    assert put(client, "/community/blocks/maya", {"enabled": False}).status_code == 200
    assert len(get(client, "/study/matches").json()["items"]) == 1


def test_unverified_account_cannot_discover_or_contact(client, settings):
    settings.community_verified_users = "alex"
    assert put(client, "/study/profile", study(), "maya").status_code == 403
    assert get(client, "/study/matches", "maya").json()["items"] == []
    assert post(client, "/marketplace/photos", {"data": photo_data()}, "maya").status_code == 403
    assert get(client, "/community/conversations", "maya").status_code == 403
    assert put(client, "/study/profile", study(discovery=False), "maya").status_code == 200


def test_marketplace_create_search_save_inquire_and_ownership(client):
    body = listing(client, price_minor=0)
    result = post(client, "/marketplace/listings", body)
    assert result.status_code == 201, result.text
    item = result.json()
    lid = item["id"]
    assert item["price_label"] == "Free" and item["isbn"] == "9780306406157"
    assert item["photos"] and item["expectations"]
    assert get(client, "/marketplace/listings", "maya", q="978-0-306-40615-7").json()["total"] == 1
    assert get(client, "/marketplace/listings", category="furniture").json()["total"] == 0
    assert get(client, "/marketplace/listings", min_price=1).json()["total"] == 0
    assert put(client, f"/marketplace/listings/{lid}", body, "maya").status_code == 403
    assert (
        put(client, f"/marketplace/listings/{lid}/status", {"status": "sold"}, "maya").status_code
        == 403
    )
    assert (
        put(client, f"/marketplace/listings/{lid}/saved", {"enabled": True}, "maya").status_code
        == 200
    )
    assert get(client, "/marketplace/listings", "maya", scope="saved").json()["total"] == 1
    cid = post(client, f"/marketplace/listings/{lid}/inquire", user="maya").json()["id"]
    assert post(client, f"/marketplace/listings/{lid}/inquire", user="maya").json()["id"] == cid
    assert get(client, f"/community/conversations/{cid}", "jordan").status_code == 404
    assert (
        post(
            client, f"/community/conversations/{cid}/messages", {"body": "Available?"}, "maya"
        ).status_code
        == 201
    )
    assert (
        get(client, f"/community/conversations/{cid}").json()["messages"][0]["body"] == "Available?"
    )
    assert put(client, f"/marketplace/listings/{lid}/status", {"status": "sold"}).status_code == 200
    assert get(client, "/marketplace/listings").json()["total"] == 0
    assert (
        get(client, "/marketplace/listings", "maya", scope="saved").json()["items"][0]["status"]
        == "sold"
    )
    assert post(client, f"/marketplace/listings/{lid}/inquire", user="jordan").status_code == 422


@pytest.mark.parametrize(
    "changes",
    [
        {"price_minor": -1},
        {"price_minor": 1.5},
        {"price_minor": "100"},
        {"price_minor": True},
        {"currency": "EUR"},
        {"photo_ids": []},
        {"isbn": "9780306406158"},
        {"category": "furniture", "isbn": "9780306406157"},
        {"title": "   "},
    ],
)
def test_invalid_listing_inputs_rejected(client, changes):
    assert post(client, "/marketplace/listings", listing(client, **changes)).status_code == 422


def test_duplicate_and_foreign_photo_rejected(client):
    body = listing(client)
    assert post(client, "/marketplace/listings", body).status_code == 201
    assert post(client, "/marketplace/listings", body).status_code == 409
    assert post(client, "/marketplace/listings", body, "maya").status_code == 403
    # Identical books from another seller are legitimate when using their own photo.
    assert post(client, "/marketplace/listings", listing(client, "maya"), "maya").status_code == 201


def test_photo_content_validation_and_metadata_removal(client):
    assert (
        post(
            client, "/marketplace/photos", {"data": "data:image/jpeg;base64,bm90IGltYWdl"}
        ).status_code
        == 422
    )
    assert (
        post(client, "/marketplace/photos", {"data": "https://example.com/photo.jpg"}).status_code
        == 422
    )
    image = Image.new("RGB", (16, 16), "blue")
    exif = Image.Exif()
    exif[270] = "Private camera metadata"
    output = io.BytesIO()
    image.save(output, "JPEG", exif=exif)
    data = "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode()
    result = post(client, "/marketplace/photos", {"data": data}).json()
    cleaned = Image.open(io.BytesIO(base64.b64decode(result["data"].split(",")[1])))
    assert len(cleaned.getexif()) == 0


def test_expiry_renewal_reserved_and_stable_pagination(client):
    lids = []
    for i in range(3):
        lids.append(
            post(client, "/marketplace/listings", listing(client, title=f"Book {i}")).json()["id"]
        )
    first = get(client, "/marketplace/listings", limit=2, sort="price_asc").json()
    second = get(client, "/marketplace/listings", limit=2, sort="price_asc", offset=2).json()
    assert len({i["id"] for i in first["items"] + second["items"]}) == 3
    lid = lids[0]
    put(client, f"/marketplace/listings/{lid}/status", {"status": "reserved"})
    assert get(client, f"/marketplace/listings/{lid}").json()["status"] == "reserved"
    assert post(client, f"/marketplace/listings/{lid}/inquire", user="maya").status_code == 422
    store = client.app.state.community
    state = store.load("campus")
    state.data.listings[lid].expires_at = datetime(2026, 10, 24, 11, tzinfo=UTC)
    store.save("campus", state)
    assert get(client, f"/marketplace/listings/{lid}").json()["status"] == "expired"
    assert get(client, "/marketplace/listings").json()["total"] == 2
    assert (
        put(client, f"/marketplace/listings/{lid}/status", {"status": "active"}).status_code == 422
    )
    assert (
        put(
            client, f"/marketplace/listings/{lid}/status", {"status": "active", "renew": True}
        ).status_code
        == 200
    )
    assert get(client, "/marketplace/listings").json()["total"] == 3


def test_reports_moderation_and_audit_require_separate_credential(client, settings):
    from pydantic import SecretStr

    settings.community_moderator_token = SecretStr("moderator-secret")
    lid = post(client, "/marketplace/listings", listing(client)).json()["id"]
    report = post(
        client,
        "/community/reports",
        {"target_type": "listing", "target_id": lid, "reason": "Suspicious description"},
        "maya",
    ).json()
    assert get(client, "/community/moderation").status_code == 403
    path = f"/community/moderation/{report['id']}"
    assert (
        post(client, path, {"action": "remove_listing", "reason": "Reviewed abuse"}).status_code
        == 403
    )
    result = post(
        client,
        path,
        {"action": "remove_listing", "reason": "Reviewed abuse"},
        **{"X-Moderator-Token": "moderator-secret"},
    )
    assert result.status_code == 200
    assert get(client, "/marketplace/listings").json()["total"] == 0
    assert (
        get(client, f"/marketplace/listings/{lid}", "maya").json()["title"] == "Listing unavailable"
    )
    assert (
        put(client, f"/marketplace/listings/{lid}/status", {"status": "active"}).status_code == 403
    )
    queue = client.get(
        "/community/moderation?user=alex", headers={**AUTH, "X-Moderator-Token": "moderator-secret"}
    ).json()
    assert queue["audit"][0]["reason"] == "Reviewed abuse"


def test_rate_limit_and_deletion_disable_contact(client, settings):
    settings.community_invitations_per_hour = 1
    setup_matches(client)
    invitation = post(
        client, "/study/invitations", {"recipient": "maya", "course_id": "cas-cs-111"}
    ).json()
    post(client, f"/study/invitations/{invitation['id']}/action", {"action": "cancel"})
    assert (
        post(
            client, "/study/invitations", {"recipient": "maya", "course_id": "cas-cs-111"}
        ).status_code
        == 429
    )
    assert post(client, "/community/deletion-request").status_code == 200
    assert get(client, "/community/config").json()["verified"] is False
    assert get(client, "/study/matches", "maya").json()["items"] == []
    assert put(client, "/study/profile", study()).status_code == 403


def test_matching_dst_and_missing_preferences(client):
    # UTC intervals correctly change across the Nov 1 fall-back boundary.
    a = StudyProfile(
        **study(
            timezone="America/New_York",
            availability=[{"weekday": 6, "start": "01:00", "end": "03:00"}],
        )
    )
    dates = intervals(a, datetime(2026, 11, 1).date(), datetime(2026, 11, 1).date())
    assert dates[0][1] - dates[0][0] == timedelta(hours=3)
    # A 02:30 endpoint does not exist on spring-forward Sunday.
    a.availability[0].start = "02:30"
    assert intervals(a, datetime(2026, 3, 8).date(), datetime(2026, 3, 8).date()) == []
    own = StudyProfile(**study(study_format=None, meeting_mode=None))
    other = StudyProfile(**study(study_format=None, meeting_mode=None))
    windows = [(datetime(2026, 10, 26, 16, tzinfo=UTC), datetime(2026, 10, 26, 19, tzinfo=UTC))]
    assert rank_match(own, other, windows) == 100
    assert merge_intervals([(1, 3), (2, 4), (4, 5)]) == [(1, 5)]
    assert (
        overlap(
            own, other, client.app.state.repository.catalog.term, datetime(2027, 1, 1, tzinfo=UTC)
        )
        == []
    )
    with pytest.raises(ValidationError):
        StudyProfile(**study(timezone="Invalid/Zone"))


def test_local_and_blob_persistence(tmp_path, blob_transport):
    store = CommunityStore(tmp_path)
    state = store.load("campus")
    state.data.profiles["alex"] = StudyProfile(**study())
    store.save("campus", state)
    assert CommunityStore(tmp_path).load("campus").data.profiles["alex"].discovery
    import httpx

    transport, blobs = blob_transport
    with httpx.Client(transport=transport) as client:
        blob = BlobCommunityStore("store_test123", client, "fixture-token")
        original = blob.load("campus")
        original.data = state.data
        blob.save("campus", original)
        assert "community/campus.json" in blobs
        assert blob.load("campus").data.profiles["alex"].discovery


def test_overlap_threshold_timezones_and_stale_candidate(client):
    term = client.app.state.repository.catalog.term
    a = StudyProfile(**study(availability=[{"weekday": 0, "start": "16:00", "end": "17:00"}]))
    b = StudyProfile(
        **study(timezone="UTC", availability=[{"weekday": 0, "start": "20:30", "end": "21:00"}])
    )
    at = datetime(2026, 10, 24, 12, tzinfo=UTC)
    assert len(overlap(a, b, term, at, minimum=30)) == 1
    b.availability[0].start = "20:31"
    assert overlap(a, b, term, at, minimum=30) == []
    setup_matches(client)
    put(client, "/study/profile", study(), "jordan")
    rows = get(client, "/study/matches").json()["items"]
    assert [r["student_id"] for r in rows] == ["jordan", "maya"]
    store = client.app.state.community
    stored = store.load("campus")
    stored.data.profiles["maya"].term = "spring-2026"
    store.save("campus", stored)
    assert [r["student_id"] for r in get(client, "/study/matches").json()["items"]] == ["jordan"]


def test_suspension_blocks_contact_and_aggregate_metrics_are_private(client, settings):
    from pydantic import SecretStr

    settings.community_moderator_token = SecretStr("moderator-secret")
    setup_matches(client)
    report = post(
        client,
        "/community/reports",
        {"target_type": "account", "target_id": "maya", "reason": "Test report"},
    ).json()
    result = post(
        client,
        f"/community/moderation/{report['id']}",
        {"action": "suspend_account", "reason": "Reviewed test case"},
        **{"X-Moderator-Token": "moderator-secret"},
    )
    assert result.status_code == 200
    assert get(client, "/study/matches").json()["items"] == []
    assert put(client, "/study/profile", study(), "maya").status_code == 403
    assert get(client, "/community/metrics").status_code == 403
    metrics = client.get(
        "/community/metrics?user=alex", headers={**AUTH, "X-Moderator-Token": "moderator-secret"}
    ).json()
    assert metrics["opted_in_students"] == 1
    assert "feedback" not in metrics and "messages" not in metrics


def test_category_aliases_and_removed_saved_results(client, settings):
    from pydantic import SecretStr

    settings.community_moderator_token = SecretStr("moderator-secret")
    body = listing(client, category="Textbooks", condition="Like New")
    created = post(client, "/marketplace/listings", body).json()
    assert created["category"] == "books" and created["condition"] == "like_new"
    lid = created["id"]
    put(client, f"/marketplace/listings/{lid}/saved", {"enabled": True}, "maya")
    report = post(
        client,
        "/community/reports",
        {"target_type": "listing", "target_id": lid, "reason": "Test report"},
        "maya",
    ).json()
    post(
        client,
        f"/community/moderation/{report['id']}",
        {"action": "remove_listing", "reason": "Reviewed test case"},
        **{"X-Moderator-Token": "moderator-secret"},
    )
    saved = get(client, "/marketplace/listings", "maya", scope="saved").json()["items"][0]
    assert saved["title"] == "Listing unavailable"
    assert saved["thumbnail"] is None and saved["photos"] == []
    assert get(client, "/marketplace/listings", min_price=100, max_price=99).status_code == 422
