from datetime import date, datetime, time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .request_routing import RoutingResult

NonNegativeInt = Annotated[int, Field(ge=0)]
Component = Literal["lecture", "lab", "discussion"]
AssessmentKind = Literal["assignment", "quiz", "midterm", "project", "final"]
AttendanceStatus = Literal["present", "late", "absent", "excused"]


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(Schema):
    title: str
    url: str
    retrieved_on: date


class Term(Schema):
    id: str
    timezone: str
    starts_on: date
    ends_on: date
    finals_start: date
    finals_end: date
    suspended_dates: list[date]
    substitute_days: dict[date, Annotated[int, Field(ge=0, le=6)]]
    source: Source


class Meeting(Schema):
    weekdays: list[Annotated[int, Field(ge=0, le=6)]]
    start_time: time
    end_time: time
    room: str | None


class Section(Schema):
    id: str
    component: Component
    instructors: list[str]
    meetings: list[Meeting]
    exam_reservations: list[Meeting] = Field(default_factory=list)
    paired_lecture: str | None = None
    notes: str = ""


class Course(Schema):
    id: str
    code: str
    title: str
    credits: int = Field(gt=0)
    required_components: list[Component]
    sections: list[Section]
    source: Source


class CourseCatalog(Schema):
    term: Term
    courses: list[Course]


class MealPlan(Schema):
    id: str
    name: str
    academic_year: str
    meal_period: Literal["unlimited", "weekly", "semester"]
    meal_allowance: NonNegativeInt | None
    dining_points_included_cents: NonNegativeInt
    semester_cost_cents: NonNegativeInt
    guest_meal_allowance: NonNegativeInt
    weekly_reset_day: Literal["Friday"] | None = None
    source: Source


class StudentProfile(Schema):
    user: str
    buid: str = Field(pattern=r"^U\d{8}$")
    full_name: str
    email: str
    school: str
    program: str
    major: str
    degree_level: Literal["undergraduate", "graduate", "phd"]
    year: int = Field(ge=1)
    term: str
    is_mock: Literal[True] = True
    as_of: datetime
    program_source: Source


class MealBalance(Schema):
    plan_id: str | None
    meals_remaining: NonNegativeInt | None
    dining_points_balance_cents: NonNegativeInt
    convenience_points_balance_cents: NonNegativeInt
    guest_meals_remaining: NonNegativeInt


class MealPlanResponse(Schema):
    user: str
    as_of: datetime
    is_mock: Literal[True] = True
    currency: Literal["USD"] = "USD"
    plan: MealPlan | None
    balance: MealBalance
    unlimited_meals: bool
    meal_period: Literal["unlimited", "weekly", "semester", "none"]
    period_starts_on: date | None
    period_ends_on: date | None
    next_reset_on: date | None
    rules: list[str]
    sources: list[Source]


class Enrollment(Schema):
    course_id: str
    section_ids: list[str]


class Assessment(Schema):
    id: str
    course_id: str
    title: str
    kind: AssessmentKind
    due_at: datetime
    starts_at: datetime | None = None
    location: str | None = None
    max_score: float = Field(gt=0)
    score: float | None = Field(default=None, ge=0)
    status: Literal["graded", "missing", "submitted", "upcoming"]
    is_mock: Literal[True] = True

    @model_validator(mode="after")
    def valid_score(self) -> "Assessment":
        if self.score is not None and self.score > self.max_score:
            raise ValueError("Score exceeds maximum")
        if (self.status in {"graded", "missing"}) != (self.score is not None):
            raise ValueError("Only graded/missing assessments have scores")
        if self.status == "missing" and self.score != 0:
            raise ValueError("Missing assessments have a zero score")
        return self


class AttendanceRecord(Schema):
    course_id: str
    event_id: str
    starts_at: datetime
    status: AttendanceStatus


class StudentRecord(Schema):
    profile: StudentProfile
    meal_balance: MealBalance
    enrollments: list[Enrollment]
    assessments: list[Assessment]
    attendance: list[AttendanceRecord]


class CoursesResponse(Schema):
    user: str
    as_of: datetime
    is_mock: Literal[True] = True
    term: Term
    courses: list[Course]


class CalendarEvent(Schema):
    id: str
    course_id: str
    title: str
    kind: Literal["class", "assignment", "quiz", "midterm", "project", "final"]
    starts_at: datetime
    ends_at: datetime | None
    location: str | None
    section_id: str | None = None
    assessment_id: str | None = None
    is_mock: Literal[True] = True


class CalendarResponse(Schema):
    user: str
    as_of: datetime
    timezone: str
    term: str
    is_mock: Literal[True] = True
    events: list[CalendarEvent]


class CourseAttendance(Schema):
    course_id: str
    counts: dict[AttendanceStatus, NonNegativeInt]
    records: list[AttendanceRecord]


class AttendanceResponse(Schema):
    user: str
    as_of: datetime
    is_mock: Literal[True] = True
    courses: list[CourseAttendance]


class CourseGrades(Schema):
    course_id: str
    earned_points: float
    graded_possible_points: float
    current_percentage: float | None
    assessments: list[Assessment]


class GradesResponse(Schema):
    user: str
    as_of: datetime
    is_mock: Literal[True] = True
    courses: list[CourseGrades]


class RecommendedEvent(Schema):
    id: str
    title: str
    starts_at: datetime
    location: str | None = None


class EventCard(RecommendedEvent):
    description: str
    ends_at: datetime | None = None
    source_url: str
    source_category: str
    cluster_id: str
    # Fixed-taxonomy tags. `tag_source`: "baseline" (auto), "model" (learned), or
    # "organizer" = a PER-STUDENT override (prototype has no shared organizer id);
    # it overrides the auto set for that user only, even when empty.
    tags: dict[str, float | None] = Field(default_factory=dict)
    tag_source: Literal["baseline", "model", "organizer"] = "baseline"
    taxonomy_version: str | None = None
    saved: bool = False
    not_interested: bool = False
    conflict_ids: list[str] = Field(default_factory=list)
    conflict_check_complete: bool
    score: float | None = None
    reasons: list[str] = Field(default_factory=list)


class ChatRequest(Schema):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]


class Citation(Schema):
    title: str
    url: str


class ChatMessage(Schema):
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime
    sources: list[Citation] = Field(default_factory=list)
    event_cards: list[EventCard] = Field(default_factory=list)
    routing: RoutingResult | None = None
