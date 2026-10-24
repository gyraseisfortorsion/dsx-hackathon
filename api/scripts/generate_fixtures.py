"""Rebuild deterministic, fictional records from the verified BU catalog snapshot.

Run from api/: uv run python scripts/generate_fixtures.py
No network requests are made. See data/SOURCES.md for source interpretation.
"""

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bu_api.calendar import class_events  # noqa: E402
from bu_api.schemas import Course, Term  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "data"
ZONE = ZoneInfo("America/New_York")
AS_OF = datetime(2026, 10, 24, 12, tzinfo=ZONE)
RESEARCH_DATE = "2026-10-24"
DAY_CODES = {"M": 0, "T": 1, "W": 2, "R": 3, "F": 4}


def source(title, url):
    return {"title": title, "url": url, "retrieved_on": RESEARCH_DATE}


def meeting(days, start, end, room):
    return dict(weekdays=[DAY_CODES[d] for d in days], start_time=start, end_time=end, room=room)


def section(
    section_id,
    component,
    instructors,
    days,
    start,
    end,
    room,
    *,
    paired_lecture=None,
    notes="",
    reservation=None,
):
    return dict(
        id=section_id,
        component=component,
        instructors=instructors.split(", "),
        meetings=[meeting(days, start, end, room)],
        notes=notes,
        paired_lecture=paired_lecture,
        exam_reservations=[reservation] if reservation else [],
    )


def course(code, title, sections):
    course_id = code.lower().replace(" ", "-")
    school = course_id.split("-")[0]
    return dict(
        id=course_id,
        code=code,
        title=title,
        credits=4,
        sections=sections,
        required_components=list(dict.fromkeys(s["component"] for s in sections)),
        source=source(
            f"{code}: {title} — Fall 2026",
            f"https://www.bu.edu/academics/{school}/courses/{course_id}/",
        ),
    )


def write(name, value):
    (DATA / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def main():
    DATA.mkdir(exist_ok=True)
    term = dict(
        id="fall-2026",
        timezone="America/New_York",
        starts_on="2026-09-02",
        ends_on="2026-12-10",
        finals_start="2026-12-14",
        finals_end="2026-12-18",
        suspended_dates=["2026-09-07", "2026-10-12"] + [f"2026-11-{day}" for day in range(25, 30)],
        substitute_days={"2026-10-13": 0},
        source=source("BU Registrar: Semester Dates", "https://www.bu.edu/reg/calendars/semester/"),
    )
    courses = [
        course(
            "CAS CS 111",
            "Introduction to Computer Science 1",
            [
                section(
                    "A1",
                    "lecture",
                    "Sullivan, Januario",
                    "MWF",
                    "10:10",
                    "11:00",
                    "SCI 113",
                    notes="Register for a lecture and a lab. Reserve Wednesday "
                    "18:30–19:45 for exams; this is not a weekly class.",
                    reservation=meeting("W", "18:30", "19:45", None),
                ),
                section("B7", "lab", "Sullivan, Januario", "T", "09:30", "10:20", "CDS 364"),
            ],
        ),
        course(
            "CAS MA 123",
            "Calculus 1",
            [
                section(
                    "A1",
                    "lecture",
                    "Srinivasan",
                    "MWF",
                    "09:05",
                    "09:55",
                    "STO B50",
                    notes="Register for a discussion B1–BC. Reserve Thursday 18:30–20:30 "
                    "for exams; this is not a weekly class.",
                    reservation=meeting("R", "18:30", "20:30", None),
                ),
                section("B1", "discussion", "Kaper, Enkosky", "M", "16:30", "17:45", "CAS 216"),
            ],
        ),
        course(
            "CAS EC 101",
            "Introductory Microeconomic Analysis",
            [
                section(
                    "AA",
                    "lecture",
                    "Idson",
                    "MWF",
                    "10:10",
                    "11:00",
                    "MOR 101",
                    notes="Register for one A0–A9 discussion.",
                ),
                section(
                    "A2",
                    "discussion",
                    "Idson, Stamm",
                    "T",
                    "11:15",
                    "12:05",
                    "CAS B06B",
                    paired_lecture="AA",
                ),
                section(
                    "BB",
                    "lecture",
                    "Celik",
                    "MWF",
                    "11:15",
                    "12:05",
                    "MOR 101",
                    notes="Register for one B0–B9 discussion.",
                ),
                section(
                    "B1",
                    "discussion",
                    "Celik, Shah",
                    "M",
                    "12:20",
                    "13:10",
                    "CAS 214",
                    paired_lecture="BB",
                ),
            ],
        ),
        course(
            "CAS EC 102",
            "Introductory Macroeconomic Analysis",
            [
                section(
                    "AA",
                    "lecture",
                    "Watson",
                    "MWF",
                    "13:25",
                    "14:15",
                    "MOR 101",
                    notes="Register for one A0–A9 discussion.",
                ),
                section(
                    "A2",
                    "discussion",
                    "Watson, Zecca",
                    "T",
                    "08:00",
                    "08:50",
                    "PRB 150",
                    paired_lecture="AA",
                ),
            ],
        ),
        course(
            "CDS DS 110",
            "Introduction to Data Science with Python",
            [
                section("A1", "lecture", "Ladenheim", "MWF", "12:20", "13:10", "CGS 511"),
                section(
                    "A2", "lab", "Ladenheim", "W", "13:25", "14:15", "CDS 164", paired_lecture="A1"
                ),
            ],
        ),
        course(
            "CDS DS 120",
            "Foundations of Data Science",
            [
                section("A1", "lecture", "Chatterjee", "MWF", "11:15", "12:05", "PHO 211"),
                section(
                    "A3",
                    "discussion",
                    "Chatterjee",
                    "M",
                    "13:25",
                    "14:15",
                    "CDS 164",
                    paired_lecture="A1",
                ),
            ],
        ),
        course(
            "CAS CS 611",
            "Object-oriented Software Principles and Design",
            [
                section(
                    "A1",
                    "lecture",
                    "Papadakis-Kanaris, Gao",
                    "T",
                    "16:00",
                    "18:45",
                    "CAS 326",
                    notes="Catalog heading says CAS CS 611; section notes say "
                    "GRS CS611. Reserved for GRS CS master's students. Lecture and discussion "
                    "are required.",
                ),
                section(
                    "A2",
                    "discussion",
                    "Papadakis-Kanaris, Gao",
                    "W",
                    "15:35",
                    "16:25",
                    "MCS B29",
                    paired_lecture="A1",
                ),
            ],
        ),
        course(
            "CAS CS 630",
            "Graduate Algorithms",
            [
                section(
                    "A1",
                    "lecture",
                    "Erdos, Januario",
                    "TR",
                    "09:30",
                    "10:45",
                    "CAS 326",
                    notes="Catalog heading says CAS CS 630; section notes say GRS CS630. "
                    "Reserved for GRS CS master's students. Lecture and discussion are required.",
                ),
                section(
                    "A2",
                    "discussion",
                    "Erdos, Jalali Farahani",
                    "W",
                    "09:05",
                    "09:55",
                    "CAS B06B",
                    paired_lecture="A1",
                ),
            ],
        ),
        course(
            "CAS CS 640",
            "Artificial Intelligence",
            [
                section(
                    "A1",
                    "lecture",
                    "Considine, Kim",
                    "TR",
                    "11:00",
                    "12:15",
                    "CAS 224",
                    notes="Masters Students: AI CORE Requirement.",
                ),
                section(
                    "A2",
                    "discussion",
                    "Considine, Kim",
                    "F",
                    "09:05",
                    "09:55",
                    "CGS 421",
                    paired_lecture="A1",
                ),
            ],
        ),
        course(
            "CAS CS 651",
            "Distributed Systems",
            [
                section(
                    "A1",
                    "lecture",
                    "Liagouris",
                    "MW",
                    "14:30",
                    "15:45",
                    "PSY B53",
                    notes="Masters Students: Systems Requirement.",
                ),
                section(
                    "A2",
                    "discussion",
                    "Liagouris",
                    "F",
                    "14:30",
                    "15:20",
                    "CDS 364",
                    paired_lecture="A1",
                ),
            ],
        ),
    ]
    write("courses.json", dict(term=term, courses=courses))
    plan_source = source(
        "BU Dining: 2026–2027 Meal Plan Comparison", "https://www.bu.edu/dining/plans-points/"
    )
    plan_rows = [
        ("open-access", "Open Access", "unlimited", None, 29500, 378500, 10),
        ("open-access-plus", "Open Access+", "unlimited", None, 58000, 401500, 10),
        ("weekly-10-plus", "Weekly 10+", "weekly", 10, 108500, 401500, 10),
        ("kosher", "Kosher", "weekly", 11, 41000, 378500, 10),
        ("connector-50", "Campus Connector 50", "semester", 50, 25000, 94000, 0),
        ("connector-50-plus", "Campus Connector 50+", "semester", 50, 50000, 119000, 0),
        ("connector-75-plus", "Campus Connector 75+", "semester", 75, 50000, 153500, 0),
    ]
    plans = [
        dict(
            id=pid,
            name=name,
            academic_year="2026-2027",
            meal_period=period,
            meal_allowance=allowance,
            dining_points_included_cents=points,
            semester_cost_cents=cost,
            guest_meal_allowance=guests,
            weekly_reset_day="Friday" if period == "weekly" else None,
            source=plan_source,
        )
        for pid, name, period, allowance, points, cost, guests in plan_rows
    ]
    write("meal_plans.json", plans)
    people = [
        (
            "alex",
            "Alex Morgan",
            "College of Arts & Sciences",
            "BA in Computer Science",
            "Computer Science",
            "undergraduate",
            1,
            "cas/programs/computer-science/ba/",
            "open-access",
            None,
            18742,
            6045,
            8,
            [
                ("cas-cs-111", ["A1", "B7"]),
                ("cas-ma-123", ["A1", "B1"]),
                ("cas-ec-101", ["BB", "B1"]),
            ],
        ),
        (
            "maya",
            "Maya Patel",
            "College of Arts & Sciences",
            "BA in Economics",
            "Economics",
            "undergraduate",
            1,
            "cas/programs/economics/ba/",
            "weekly-10-plus",
            6,
            61234,
            3190,
            7,
            [
                ("cas-ec-101", ["AA", "A2"]),
                ("cas-ec-102", ["AA", "A2"]),
                ("cas-ma-123", ["A1", "B1"]),
            ],
        ),
        (
            "jordan",
            "Jordan Rivera",
            "Faculty of Computing & Data Sciences",
            "BS in Data Science",
            "Data Science",
            "undergraduate",
            1,
            "cds/programs/bs-in-data-science/",
            "kosher",
            8,
            21150,
            1325,
            9,
            [
                ("cds-ds-110", ["A1", "A2"]),
                ("cds-ds-120", ["A1", "A3"]),
                ("cas-ec-101", ["AA", "A2"]),
            ],
        ),
        (
            "sam",
            "Sam Chen",
            "Graduate School of Arts & Sciences",
            "MS in Computer Science",
            "Computer Science",
            "graduate",
            1,
            "grs/programs/computer-science/ms/",
            "connector-50-plus",
            34,
            28765,
            8500,
            0,
            [
                ("cas-cs-611", ["A1", "A2"]),
                ("cas-cs-630", ["A1", "A2"]),
                ("cas-cs-640", ["A1", "A2"]),
            ],
        ),
        (
            "taylor",
            "Taylor Brooks",
            "Graduate School of Arts & Sciences",
            "PhD in Computer Science",
            "Computer Science",
            "phd",
            2,
            "grs/programs/computer-science/phd/",
            None,
            0,
            0,
            9425,
            0,
            [("cas-cs-640", ["A1", "A2"]), ("cas-cs-651", ["A1", "A2"])],
        ),
    ]
    student_records = []
    for person_index, person in enumerate(people):
        (
            user,
            name,
            school,
            program,
            major,
            level,
            year,
            program_path,
            plan_id,
            meals,
            points,
            convenience,
            guests,
            selections,
        ) = person
        profile = dict(
            user=user,
            full_name=name,
            buid=f"U9900000{person_index + 1}",
            email=f"{user}@students.example.test",
            school=school,
            program=program,
            major=major,
            degree_level=level,
            year=year,
            term="fall-2026",
            is_mock=True,
            as_of=AS_OF.isoformat(),
            program_source=source(program, f"https://www.bu.edu/academics/{program_path}"),
        )
        enrolled = []
        for cid, sections in selections:
            selected = next(c for c in courses if c["id"] == cid).copy()
            selected["sections"] = [s for s in selected["sections"] if s["id"] in sections]
            enrolled.append(Course.model_validate(selected))
        meetings = class_events(enrolled, Term.model_validate(term))
        attendance = [
            dict(
                course_id=event.course_id,
                event_id=event.id,
                starts_at=event.starts_at.isoformat(),
                status={7: "absent", 14: "late", 21: "excused"}.get(
                    (i + person_index) % 29, "present"
                ),
            )
            for i, event in enumerate(meetings)
            if event.ends_at < AS_OF
        ]
        assessments = []
        for ci, selected in enumerate(enrolled):
            lecture = next(s for s in selected.sections if s.component == "lecture")
            if lecture.exam_reservations:
                reserve = lecture.exam_reservations[0]
                day = date(2026, 10, 14)
                while day.weekday() not in reserve.weekdays:
                    day += timedelta(days=1)
                mid_start = datetime.combine(day, reserve.start_time, ZONE)
                mid_end = datetime.combine(day, reserve.end_time, ZONE)
                mid_room = None  # Reserved exam slots do not publish a room.
            else:
                event = next(
                    e
                    for e in meetings
                    if e.course_id == selected.id
                    and e.section_id == lecture.id
                    and e.starts_at.date() >= date(2026, 10, 14)
                )
                mid_start, mid_end, mid_room = event.starts_at, event.ends_at, event.location
            final_start = datetime(2026, 12, 14 + ci, 9 if ci % 2 == 0 else 13, tzinfo=ZONE)
            items = [
                (
                    "hw1",
                    "Assignment 1",
                    "assignment",
                    datetime(2026, 9, 18, 23, 59, tzinfo=ZONE),
                    None,
                    None,
                    100,
                    88 + person_index + ci,
                    "graded",
                ),
                (
                    "quiz1",
                    "Quiz 1",
                    "quiz",
                    datetime(2026, 10, 2, 23, 59, tzinfo=ZONE),
                    None,
                    None,
                    20,
                    0 if user == "maya" and ci == 1 else 16 + ci,
                    "missing" if user == "maya" and ci == 1 else "graded",
                ),
                (
                    "midterm",
                    "Midterm",
                    "midterm",
                    mid_end,
                    mid_start,
                    mid_room,
                    100,
                    81 + person_index + ci,
                    "graded",
                ),
                (
                    "project",
                    "Project proposal",
                    "project",
                    datetime(2026, 10, 22, 23, 59, tzinfo=ZONE),
                    None,
                    None,
                    100,
                    None,
                    "submitted",
                ),
                (
                    "hw2",
                    "Assignment 2",
                    "assignment",
                    datetime(2026, 10, 30, 23, 59, tzinfo=ZONE),
                    None,
                    None,
                    100,
                    None,
                    "upcoming",
                ),
                (
                    "final",
                    "Final exam",
                    "final",
                    final_start + timedelta(hours=2),
                    final_start,
                    None,
                    100,
                    None,
                    "upcoming",
                ),
            ]
            for suffix, title, kind, due, start, room, maximum, score, status in items:
                assessments.append(
                    dict(
                        id=f"{user}:{selected.id}:{suffix}",
                        course_id=selected.id,
                        title=f"{selected.code}: {title}",
                        kind=kind,
                        due_at=due.isoformat(),
                        starts_at=start.isoformat() if start else None,
                        location=room,
                        max_score=maximum,
                        score=score,
                        status=status,
                        is_mock=True,
                    )
                )
        student_records.append(
            dict(
                profile=profile,
                meal_balance=dict(
                    plan_id=plan_id,
                    meals_remaining=meals,
                    dining_points_balance_cents=points,
                    convenience_points_balance_cents=convenience,
                    guest_meals_remaining=guests,
                ),
                enrollments=[
                    dict(course_id=cid, section_ids=sections) for cid, sections in selections
                ],
                attendance=attendance,
                assessments=assessments,
            )
        )
    write("students.json", student_records)
    sources = [
        plan_source,
        source("BU Dining: Meal Plan FAQ", "https://www.bu.edu/dining/plans-points/faqs/"),
        source(
            "BU Housing: Convenience Points",
            "https://www.bu.edu/housing/living/dining/convenience/",
        ),
        source(
            "BU Housing: Campus Connector terms",
            "https://www.bu.edu/housing/living/dining/meal-plan-terms-conditions/"
            "tc-campus-connector-plan-agreement/",
        ),
        term["source"],
        *[p["profile"]["program_source"] for p in student_records],
        *[c["source"] for c in courses],
    ]
    write("sources.json", sources)
    print(
        f"Wrote {len(courses)} courses, {len(plans)} plans, {len(people)} students, "
        f"and {len(sources)} curated sources to {DATA}"
    )


if __name__ == "__main__":
    main()
