from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .schemas import Assessment, CalendarEvent, Course, Term


def class_events(courses: list[Course], term: Term) -> list[CalendarEvent]:
    zone = ZoneInfo(term.timezone)
    events: list[CalendarEvent] = []
    day = term.starts_on
    while day <= term.ends_on:
        if day not in term.suspended_dates:
            weekday = term.substitute_days.get(day, day.weekday())
            for course in courses:
                for section in course.sections:
                    for index, meeting in enumerate(section.meetings):
                        if weekday in meeting.weekdays:
                            events.append(
                                CalendarEvent(
                                    id=f"{course.id}:{section.id}:{day}:{index}",
                                    course_id=course.id,
                                    section_id=section.id,
                                    title=f"{course.code} — {course.title} ({section.component})",
                                    kind="class",
                                    starts_at=datetime.combine(day, meeting.start_time, zone),
                                    ends_at=datetime.combine(day, meeting.end_time, zone),
                                    location=meeting.room,
                                )
                            )
        day += timedelta(days=1)
    return sorted(events, key=lambda event: (event.starts_at, event.id))


def assessment_events(assessments: list[Assessment]) -> list[CalendarEvent]:
    return [
        CalendarEvent(
            id=f"assessment:{item.id}",
            course_id=item.course_id,
            assessment_id=item.id,
            title=item.title,
            kind=item.kind,
            starts_at=item.starts_at or item.due_at,
            ends_at=item.due_at if item.starts_at else None,
            location=item.location,
        )
        for item in assessments
    ]
