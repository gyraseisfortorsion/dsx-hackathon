from collections import Counter
from datetime import timedelta
from pathlib import Path

from pydantic import TypeAdapter

from .calendar import assessment_events, class_events
from .schemas import (
    AttendanceResponse,
    CalendarResponse,
    Course,
    CourseAttendance,
    CourseCatalog,
    CourseGrades,
    CoursesResponse,
    GradesResponse,
    MealPlan,
    MealPlanResponse,
    Source,
    StudentRecord,
)


class Repository:
    """Read-only JSON fixtures. Validate cross-file references once at startup."""

    def __init__(self, data_dir: Path):
        self.catalog = CourseCatalog.model_validate_json((data_dir / "courses.json").read_bytes())
        plans = TypeAdapter(list[MealPlan]).validate_json(
            (data_dir / "meal_plans.json").read_bytes()
        )
        records = TypeAdapter(list[StudentRecord]).validate_json(
            (data_dir / "students.json").read_bytes()
        )
        self.sources = TypeAdapter(list[Source]).validate_json(
            (data_dir / "sources.json").read_bytes()
        )
        self.courses = {course.id: course for course in self.catalog.courses}
        self.plans = {plan.id: plan for plan in plans}
        self.students = {student.profile.user: student for student in records}
        if (
            len(self.courses) != len(self.catalog.courses)
            or len(self.plans) != len(plans)
            or len(self.students) != len(records)
        ):
            raise ValueError("Duplicate fixture identifiers")
        for student in records:
            self._validate_student(student)

    def registered_courses(self, student: StudentRecord) -> list[Course]:
        return [
            self.courses[e.course_id].model_copy(
                update={
                    "sections": [
                        s for s in self.courses[e.course_id].sections if s.id in e.section_ids
                    ],
                }
            )
            for e in student.enrollments
        ]

    def _validate_student(self, student: StudentRecord) -> None:
        if student.profile.term != self.catalog.term.id:
            raise ValueError("Student term does not match catalog")
        course_ids = {e.course_id for e in student.enrollments}
        if len(course_ids) != len(student.enrollments):
            raise ValueError("Duplicate enrollment")
        for enrollment in student.enrollments:
            course = self.courses[enrollment.course_id]
            selected = [s for s in course.sections if s.id in enrollment.section_ids]
            if len(selected) != len(enrollment.section_ids):
                raise ValueError("Unknown or duplicate section")
            if Counter(s.component for s in selected) != Counter(course.required_components):
                raise ValueError("Enroll in exactly one of each required course component")
            if any(
                s.paired_lecture and s.paired_lecture not in enrollment.section_ids
                for s in selected
            ):
                raise ValueError("Discussion/lab does not match lecture")
        balance = student.meal_balance
        if balance.plan_id:
            plan = self.plans[balance.plan_id]
            if plan.meal_period == "unlimited":
                if balance.meals_remaining is not None:
                    raise ValueError("Unlimited plans must use null meals_remaining")
            elif balance.meals_remaining is None or balance.meals_remaining > plan.meal_allowance:
                raise ValueError("Meal balance exceeds plan allowance")
            if balance.guest_meals_remaining > plan.guest_meal_allowance:
                raise ValueError("Guest meal balance exceeds allowance")
        elif (
            balance.meals_remaining != 0
            or balance.dining_points_balance_cents != 0
            or balance.guest_meals_remaining != 0
        ):
            raise ValueError("No-plan students can only have Convenience Points")
        events = {
            e.id: e for e in class_events(self.registered_courses(student), self.catalog.term)
        }
        attendance_ids = set()
        for record in student.attendance:
            event = events[record.event_id]
            if (
                record.course_id != event.course_id
                or record.starts_at != event.starts_at
                or event.ends_at > student.profile.as_of
                or record.event_id in attendance_ids
            ):
                raise ValueError("Attendance must reference a unique completed class")
            attendance_ids.add(record.event_id)
        assessment_ids = set()
        for assessment in student.assessments:
            if (
                assessment.id in assessment_ids
                or assessment.course_id not in course_ids
                or assessment.due_at.utcoffset() is None
                or (assessment.starts_at and assessment.starts_at >= assessment.due_at)
            ):
                raise ValueError("Invalid assessment reference or date")
            if assessment.due_at > student.profile.as_of and assessment.score is not None:
                raise ValueError("Future assessments cannot have scores")
            if assessment.kind == "final" and not (
                self.catalog.term.finals_start
                <= assessment.due_at.date()
                <= self.catalog.term.finals_end
            ):
                raise ValueError("Final exam outside the exam period")
            assessment_ids.add(assessment.id)

    def course_response(self, student: StudentRecord) -> CoursesResponse:
        return CoursesResponse(
            user=student.profile.user,
            as_of=student.profile.as_of,
            term=self.catalog.term,
            courses=self.registered_courses(student),
        )

    def calendar(self, student: StudentRecord) -> CalendarResponse:
        events = class_events(self.registered_courses(student), self.catalog.term)
        events += assessment_events(student.assessments)
        return CalendarResponse(
            user=student.profile.user,
            as_of=student.profile.as_of,
            timezone=self.catalog.term.timezone,
            term=self.catalog.term.id,
            events=sorted(events, key=lambda event: (event.starts_at, event.id)),
        )

    def meal_plan(self, student: StudentRecord) -> MealPlanResponse:
        balance = student.meal_balance
        plan = self.plans.get(balance.plan_id)
        period = plan.meal_period if plan else "none"
        start = end = reset = None
        if plan:
            start = self.catalog.term.starts_on.replace(month=8, day=28)
            end = self.catalog.term.finals_end
            if period == "weekly":
                today = student.profile.as_of.date()
                start = today - timedelta(days=(today.weekday() - 4) % 7)
                end, reset = start + timedelta(days=6), start + timedelta(days=7)
        return MealPlanResponse(
            user=student.profile.user,
            as_of=student.profile.as_of,
            plan=plan,
            balance=balance,
            unlimited_meals=period == "unlimited",
            meal_period=period,
            period_starts_on=start,
            period_ends_on=end,
            next_reset_on=reset,
            rules=[
                "Dining Points and Convenience Points are separate balances; 1 point = $1.",
                "Monetary amounts in this API are integer USD cents.",
                "Weekly meals reset before Friday breakfast; unused weekly meals do not roll over.",
                "Dining Points carry from fall to spring in the same academic year.",
                "Unused Campus Connector meals and Dining Points expire at academic-year end.",
                "Convenience Points carry between academic years while enrolled.",
                "Residential plans include 10 guest meals per semester; Connector plans include 0.",
                "Balances are a fixed demo snapshot; no purchases or resets are simulated.",
            ],
            sources=self.sources[:4],
        )

    def attendance(self, student: StudentRecord) -> AttendanceResponse:
        courses = []
        for enrollment in student.enrollments:
            records = [r for r in student.attendance if r.course_id == enrollment.course_id]
            counts = {
                status: sum(r.status == status for r in records)
                for status in ("present", "late", "absent", "excused")
            }
            courses.append(
                CourseAttendance(course_id=enrollment.course_id, counts=counts, records=records)
            )
        return AttendanceResponse(
            user=student.profile.user, as_of=student.profile.as_of, courses=courses
        )

    def grades(self, student: StudentRecord) -> GradesResponse:
        courses = []
        for enrollment in student.enrollments:
            items = sorted(
                [a for a in student.assessments if a.course_id == enrollment.course_id],
                key=lambda a: a.due_at,
            )
            graded = [a for a in items if a.score is not None]
            earned = sum(a.score for a in graded)
            possible = sum(a.max_score for a in graded)
            courses.append(
                CourseGrades(
                    course_id=enrollment.course_id,
                    earned_points=earned,
                    graded_possible_points=possible,
                    current_percentage=round(100 * earned / possible, 2) if possible else None,
                    assessments=items,
                )
            )
        return GradesResponse(
            user=student.profile.user, as_of=student.profile.as_of, courses=courses
        )

    def chat_context(self, student: StudentRecord) -> dict:
        return {
            "student": student.profile.model_dump(mode="json"),
            "meal_plan": self.meal_plan(student).model_dump(mode="json"),
            "courses": self.course_response(student).model_dump(mode="json"),
            "calendar": self.calendar(student).model_dump(mode="json"),
            "attendance": self.attendance(student).model_dump(mode="json"),
            "grades": self.grades(student).model_dump(mode="json"),
            "recommended_events": [],
        }
