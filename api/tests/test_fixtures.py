from datetime import date, timedelta

import pytest

from bu_api.repository import Repository

from .conftest import USERS


@pytest.fixture
def repo(settings):
    return Repository(settings.data_dir)


def test_five_distinct_profiles(repo):
    assert set(repo.students) == set(USERS)
    profiles = [s.profile for s in repo.students.values()]
    assert len({p.buid for p in profiles}) == 5
    assert len({p.program for p in profiles}) == 5
    assert {p.degree_level for p in profiles} == {"undergraduate", "graduate", "phd"}
    assert all(p.email.endswith(".example.test") for p in profiles)
    assert all(p.program_source.url.startswith("https://www.bu.edu/") for p in profiles)


def test_meal_plan_definitions_and_balances(repo):
    assert len(repo.plans) == 7
    expected = {
        "open-access": (None, 29500, 10),
        "open-access-plus": (None, 58000, 10),
        "weekly-10-plus": (10, 108500, 10),
        "kosher": (11, 41000, 10),
        "connector-50": (50, 25000, 0),
        "connector-50-plus": (50, 50000, 0),
        "connector-75-plus": (75, 50000, 0),
    }
    for pid, (meals, points, guests) in expected.items():
        plan = repo.plans[pid]
        assert (
            plan.meal_allowance,
            plan.dining_points_included_cents,
            plan.guest_meal_allowance,
        ) == (meals, points, guests)
    unlimited = repo.meal_plan(repo.students["alex"])
    assert unlimited.unlimited_meals and unlimited.balance.meals_remaining is None
    for user in ("maya", "jordan"):
        weekly = repo.meal_plan(repo.students[user])
        assert weekly.period_starts_on == date(2026, 10, 23)
        assert weekly.period_ends_on == date(2026, 10, 29)
        assert weekly.next_reset_on == date(2026, 10, 30)
    connector = repo.meal_plan(repo.students["sam"])
    assert connector.meal_period == "semester" and connector.next_reset_on is None
    no_plan = repo.meal_plan(repo.students["taylor"])
    assert no_plan.plan is None and no_plan.meal_period == "none"
    assert no_plan.balance.convenience_points_balance_cents > 0


@pytest.mark.parametrize("user", USERS)
def test_calendar_academic_rules_and_nonoverlapping_sections(repo, user):
    student = repo.students[user]
    events = repo.calendar(student).events
    classes = [e for e in events if e.kind == "class"]
    assert classes
    assert events == sorted(events, key=lambda e: (e.starts_at, e.id))
    assert len({event.id for event in events}) == len(events)
    for current, following in zip(classes, classes[1:]):
        assert current.ends_at <= following.starts_at
    assert not any(e.starts_at.date() in repo.catalog.term.suspended_dates for e in classes)
    substitute = [e for e in classes if e.starts_at.date() == date(2026, 10, 13)]
    monday = [e for e in classes if e.starts_at.date() == date(2026, 10, 19)]
    assert {(e.course_id, e.section_id, e.starts_at.time()) for e in substitute} == {
        (e.course_id, e.section_id, e.starts_at.time()) for e in monday
    }
    # The clock time stays fixed while the UTC offset changes at the DST boundary.
    before = next(e for e in classes if e.starts_at.date() == date(2026, 10, 30))
    after = next(
        e
        for e in classes
        if e.course_id == before.course_id
        and e.section_id == before.section_id
        and e.starts_at.date() == date(2026, 11, 6)
    )
    assert before.starts_at.time() == after.starts_at.time()
    assert before.starts_at.utcoffset() == timedelta(hours=-4)
    assert after.starts_at.utcoffset() == timedelta(hours=-5)
    assert max(e.starts_at.date() for e in classes) <= date(2026, 12, 10)


@pytest.mark.parametrize("user", USERS)
def test_attendance_and_assessments_share_calendar_records(repo, user):
    student = repo.students[user]
    events = {e.id: e for e in repo.calendar(student).events}
    attendance = repo.attendance(student)
    for group in attendance.courses:
        assert sum(group.counts.values()) == len(group.records)
        for record in group.records:
            assert events[record.event_id].ends_at <= student.profile.as_of
            assert events[record.event_id].course_id == group.course_id
    completed_ids = {
        e.id for e in events.values() if e.kind == "class" and e.ends_at <= student.profile.as_of
    }
    assert {r.event_id for r in student.attendance} == completed_ids
    grades = repo.grades(student)
    for group in grades.courses:
        graded = [a for a in group.assessments if a.score is not None]
        assert group.earned_points == sum(a.score for a in graded)
        assert group.graded_possible_points == sum(a.max_score for a in graded)
        for assessment in group.assessments:
            event = events[f"assessment:{assessment.id}"]
            assert event.assessment_id == assessment.id
            assert event.starts_at == (assessment.starts_at or assessment.due_at)
            if assessment.due_at > student.profile.as_of:
                assert assessment.score is None
            if assessment.kind == "final":
                assert date(2026, 12, 14) <= assessment.due_at.date() <= date(2026, 12, 18)


def test_reserved_exam_times_are_not_weekly_classes(repo):
    student = repo.students["alex"]
    events = repo.calendar(student).events
    assert not any(e.kind == "class" and e.starts_at.hour == 18 for e in events)
    midterms = [e for e in events if e.kind == "midterm"]
    assert next(e for e in midterms if e.course_id == "cas-cs-111").starts_at.weekday() == 2
    assert next(e for e in midterms if e.course_id == "cas-ma-123").starts_at.weekday() == 3
