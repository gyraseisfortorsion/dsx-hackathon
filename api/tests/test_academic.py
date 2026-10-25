from datetime import datetime
from decimal import Decimal

from bu_api.academic.grading import scenario
from bu_api.academic.models import Assessment, GradeCategory, GradingScheme

from .conftest import AUTH


def get(client, path):
    separator = "&" if "?" in path else "?"
    response = client.get(f"{path}{separator}user=alex", headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def request(client, method, path, body, status=200):
    response = client.request(method, path, params={"user": "alex"}, headers=AUTH, json=body)
    assert response.status_code == status, response.text
    return response.json()


def test_syllabus_review_commit_and_hybrid_search(client):
    course_id = get(client, "/academic/courses")["data"][0]["id"]
    text = """Course policies

Midterm exam: November 15, 2026. The midterm is worth 100 points.
Late work is accepted within 48 hours with a 10% deduction. Contact the instructor for an extension.
Attendance is required; two unexcused absences are allowed.
Homework 40%\nMidterm 25%\nProject 35%
"""
    uploaded = request(
        client,
        "post",
        f"/academic/courses/{course_id}/syllabi",
        {"version": 0, "filename": "course.txt", "text": text},
        201,
    )
    syllabus = uploaded["data"]
    assert syllabus["candidates"]
    decisions = [
        {"candidate_id": row["id"], "status": "accepted"} for row in syllabus["candidates"]
    ]
    request(
        client,
        "put",
        f"/academic/syllabi/{syllabus['id']}/review",
        {"version": 1, "decisions": decisions},
    )
    committed = request(
        client,
        "post",
        f"/academic/syllabi/{syllabus['id']}/commit",
        {"version": 2},
    )
    assert committed["data"]["assessments"] == 1
    assert committed["data"]["policies"] >= 1
    results = get(
        client,
        f"/academic/search?q=penalty+after+the+deadline&course_id={course_id}",
    )["data"]
    assert results
    assert results[0]["passage"]["syllabus_id"] == syllabus["id"]
    assert results[0]["retrieval"] == "hybrid_vector_keyword"
    dashboard = get(client, "/academic/dashboard")["data"]
    assert any(row["title"].startswith("Midterm") for row in dashboard["upcoming_assessments"])

    revision = request(
        client,
        "post",
        f"/academic/courses/{course_id}/syllabi",
        {
            "version": 3,
            "filename": "course-v2.txt",
            "text": text.replace("November 15", "November 20"),
        },
        201,
    )["data"]
    changed = [row for row in revision["candidates"] if row["kind"] == "assessment"]
    assert changed[0]["change"] == "changed"
    assert changed[0]["replaces_candidate_id"]


def test_breakdown_forecast_and_plan_avoid_classes(client):
    dashboard = get(client, "/academic/dashboard")["data"]
    assessment_id = dashboard["upcoming_assessments"][0]["id"]
    tasks = request(
        client,
        "post",
        f"/academic/assessments/{assessment_id}/breakdown",
        {"version": 0, "total_minutes": 180},
        201,
    )["data"]
    assert sum(row["estimated_minutes"] for row in tasks) == 180
    request(
        client,
        "put",
        "/academic/availability",
        {
            "version": 1,
            "windows": [
                {"weekday": weekday, "starts_at": "09:00", "ends_at": "17:00"}
                for weekday in range(5)
            ],
            "max_daily_minutes": 240,
        },
    )
    preview = request(
        client,
        "post",
        "/academic/plans/preview",
        {"starts_on": "2026-10-26", "ends_on": "2026-10-30", "block_minutes": 60},
    )["data"]
    assert preview["blocks"]
    calendar = get(
        client,
        "/academic/calendar?from=2026-10-26&to=2026-10-30",
    )["data"]
    for block in preview["blocks"]:
        start, end = (
            datetime.fromisoformat(block["starts_at"]),
            datetime.fromisoformat(block["ends_at"]),
        )
        assert all(
            not (
                start < datetime.fromisoformat(course["ends_at"])
                and end > datetime.fromisoformat(course["starts_at"])
            )
            for course in calendar["classes"]
        )
    forecast = get(
        client,
        "/academic/workload?from=2026-10-26&to=2026-11-30",
    )["data"]
    assert any(day["required_minutes"] for day in forecast["days"])


def test_grades_and_prerequisite_evidence(client):
    course_id = get(client, "/academic/courses")["data"][0]["id"]
    grades = get(client, f"/academic/courses/{course_id}/grades")["data"]
    assert grades["current_percentage"] is not None
    remaining = [row for row in grades["assessments"] if row["score"] is None]
    if len(remaining) == 1:
        scenario = request(
            client,
            "post",
            f"/academic/courses/{course_id}/grade-scenarios",
            {"target_percentage": "80", "assumed_scores": {}},
        )["data"]
        assert "required_on_single_remaining" in scenario

    target = "cas-cs-999"
    request(
        client,
        "put",
        f"/academic/courses/{target}/prerequisites",
        {
            "version": 0,
            "rule": {
                "course_id": target,
                "all_of": ["CAS CS 111"],
                "minimum_grade": "C",
            },
        },
    )
    unknown = get(client, f"/academic/courses/{target}/prerequisite-check")["data"]
    assert unknown["status"] == "not_met"
    request(
        client,
        "put",
        "/academic/completed-courses",
        {
            "version": 1,
            "courses": [{"course_code": "CAS CS 111", "grade": "B"}],
        },
    )
    assert get(client, f"/academic/courses/{target}/prerequisite-check")["data"]["status"] == "met"


def test_academic_state_is_versioned_and_user_isolated(client):
    course_id = get(client, "/academic/courses")["data"][0]["id"]
    body = {"version": 0, "filename": "one.txt", "text": "Final exam December 16, 2026"}
    request(client, "post", f"/academic/courses/{course_id}/syllabi", body, 201)
    assert (
        client.post(
            f"/academic/courses/{course_id}/syllabi?user=alex", headers=AUTH, json=body
        ).status_code
        == 409
    )
    assert get(client, "/academic/syllabi")["data"]
    maya = client.get("/academic/syllabi?user=maya", headers=AUTH)
    assert maya.status_code == 200 and maya.json()["data"] == []


def test_weighted_grade_scenario_solves_single_remaining_assessment():
    items = [
        Assessment(
            id="midterm",
            course_id="course",
            title="Midterm",
            kind="midterm",
            points_possible=Decimal(100),
            score=Decimal(80),
            status="graded",
            category="Exams",
        ),
        Assessment(
            id="final",
            course_id="course",
            title="Final",
            kind="final",
            points_possible=Decimal(100),
            category="Exams",
        ),
    ]
    scheme = GradingScheme(
        mode="weighted", categories=[GradeCategory(name="Exams", weight=Decimal(100))]
    )
    result = scenario(items, scheme, Decimal(90), {})
    required = result["required_on_single_remaining"]
    assert required["achievable"] is True
    assert required["points"] == "100.00"


def test_recovery_mode_can_schedule_overdue_work(client):
    course_id = get(client, "/academic/courses")["data"][0]["id"]
    uploaded = request(
        client,
        "post",
        f"/academic/courses/{course_id}/syllabi",
        {
            "version": 0,
            "filename": "overdue.txt",
            "text": "Assignment due October 20, 2026",
        },
        201,
    )["data"]
    candidate = next(row for row in uploaded["candidates"] if row["kind"] == "assessment")
    request(
        client,
        "put",
        f"/academic/syllabi/{uploaded['id']}/review",
        {
            "version": 1,
            "decisions": [{"candidate_id": candidate["id"], "status": "accepted"}],
        },
    )
    request(
        client,
        "post",
        f"/academic/syllabi/{uploaded['id']}/commit",
        {"version": 2},
    )
    overdue = get(client, "/academic/dashboard")["data"]["overdue_assessments"][0]
    request(
        client,
        "post",
        f"/academic/assessments/{overdue['id']}/breakdown",
        {"version": 3, "total_minutes": 60},
        201,
    )
    request(
        client,
        "put",
        "/academic/availability",
        {
            "version": 4,
            "windows": [{"weekday": 0, "starts_at": "13:00", "ends_at": "17:00"}],
            "max_daily_minutes": 120,
        },
    )
    request_body = {
        "starts_on": "2026-10-26",
        "ends_on": "2026-10-26",
        "block_minutes": 60,
    }
    normal = request(client, "post", "/academic/plans/preview", request_body)["data"]
    recovery = request(client, "post", "/academic/recovery/preview", request_body)["data"]
    assert normal["blocks"] == []
    assert recovery["blocks"]
