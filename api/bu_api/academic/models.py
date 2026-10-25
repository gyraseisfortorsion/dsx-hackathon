from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator

from ..schemas import Schema

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class Versioned(Schema):
    version: int = Field(ge=0)


class Passage(Schema):
    id: str
    syllabus_id: str
    revision: int
    page: int | None = Field(default=None, ge=1)
    ordinal: int = Field(ge=0)
    text: str


class Candidate(Schema):
    id: str
    kind: Literal["assessment", "grading", "attendance", "late_policy", "prerequisite"]
    title: str
    value: dict
    passage_ids: list[str]
    confidence: float = Field(ge=0, le=1)
    status: Literal["pending", "accepted", "rejected"] = "pending"
    ambiguity: str | None = None
    change: Literal["new", "changed", "unchanged"] = "new"
    replaces_candidate_id: str | None = None


class Syllabus(Schema):
    id: str
    course_id: str
    filename: str
    media_type: Literal["text/plain", "application/pdf"]
    content_sha256: str
    revision: int = Field(ge=1)
    status: Literal["review", "committed", "superseded"] = "review"
    created_at: datetime
    passages: list[Passage] = Field(default_factory=list)
    candidates: list[Candidate] = Field(default_factory=list)


class SyllabusUpload(Versioned):
    filename: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    media_type: Literal["text/plain", "application/pdf"] = "text/plain"
    text: str | None = Field(default=None, max_length=500_000)
    content_base64: str | None = None

    @model_validator(mode="after")
    def exactly_one_content(self):
        if (self.text is None) == (self.content_base64 is None):
            raise ValueError("Provide exactly one of text or content_base64")
        if self.media_type == "text/plain" and self.text is None:
            raise ValueError("Plain text uploads require text")
        return self


class ReviewDecision(Schema):
    candidate_id: str
    status: Literal["accepted", "rejected"]
    value: dict | None = None


class SyllabusReview(Versioned):
    decisions: list[ReviewDecision]


class Assessment(Schema):
    id: str
    course_id: str
    title: str
    kind: Literal["assignment", "quiz", "midterm", "project", "final", "other"]
    due_at: datetime | None = None
    due_on: date | None = None
    starts_at: datetime | None = None
    points_possible: Decimal | None = Field(default=None, gt=0)
    category: str | None = None
    status: Literal["upcoming", "submitted", "graded", "missing"] = "upcoming"
    score: Decimal | None = Field(default=None, ge=0)
    syllabus_id: str | None = None
    passage_ids: list[str] = Field(default_factory=list)


class CoursePolicy(Schema):
    id: str
    course_id: str
    kind: Literal["attendance", "late_policy"]
    text: str
    syllabus_id: str
    passage_ids: list[str]


class GradeCategory(Schema):
    name: str
    weight: Decimal = Field(gt=0, le=100)
    drop_lowest: int = Field(default=0, ge=0)


class GradeThreshold(Schema):
    letter: str
    minimum: Decimal = Field(ge=0, le=100)


class GradingScheme(Schema):
    mode: Literal["points", "weighted"]
    categories: list[GradeCategory] = Field(default_factory=list)
    thresholds: list[GradeThreshold] = Field(default_factory=list)
    syllabus_id: str | None = None
    passage_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def valid_weights(self):
        if self.mode == "weighted":
            total = sum((row.weight for row in self.categories), Decimal(0))
            if abs(total - Decimal(100)) > Decimal("0.01"):
                raise ValueError("Weighted categories must total 100")
        return self


class GradingSchemeUpdate(Versioned):
    scheme: GradingScheme


class ScoreUpdate(Versioned):
    score: Decimal | None = Field(default=None, ge=0)
    status: Literal["upcoming", "submitted", "graded", "missing"]
    points_possible: Decimal | None = Field(default=None, gt=0)
    category: str | None = None

    @model_validator(mode="after")
    def coherent_score(self):
        if self.status in {"graded", "missing"} and self.score is None:
            raise ValueError("Graded and missing assessments require a score")
        if self.status == "missing" and self.score != 0:
            raise ValueError("Missing assessments require a zero score")
        return self


class GradeScenario(Schema):
    target_percentage: Decimal = Field(gt=0, le=100)
    assumed_scores: dict[str, Decimal] = Field(default_factory=dict)


class Task(Schema):
    id: str
    assessment_id: str
    title: str
    estimated_minutes: int = Field(gt=0, le=10_000)
    remaining_minutes: int = Field(ge=0, le=10_000)
    dependencies: list[str] = Field(default_factory=list)
    status: Literal["todo", "doing", "done"] = "todo"
    suggested: bool = True


class BreakdownRequest(Versioned):
    total_minutes: int | None = Field(default=None, ge=15, le=10_000)


class TaskUpdate(Versioned):
    title: Text | None = None
    remaining_minutes: int | None = Field(default=None, ge=0, le=10_000)
    status: Literal["todo", "doing", "done"] | None = None


class AvailabilityWindow(Schema):
    weekday: int = Field(ge=0, le=6)
    starts_at: time
    ends_at: time

    @model_validator(mode="after")
    def ordered(self):
        if self.starts_at >= self.ends_at:
            raise ValueError("Availability start must precede end")
        return self


class AvailabilityUpdate(Versioned):
    windows: list[AvailabilityWindow]
    max_daily_minutes: int = Field(default=240, ge=15, le=1440)


class StudyBlock(Schema):
    id: str
    task_id: str
    starts_at: datetime
    ends_at: datetime
    locked: bool = False
    completed: bool = False

    @model_validator(mode="after")
    def valid_interval(self):
        if self.starts_at.utcoffset() is None or self.ends_at.utcoffset() is None:
            raise ValueError("Study blocks require timezone-aware timestamps")
        if self.starts_at >= self.ends_at:
            raise ValueError("Study block start must precede end")
        return self


class PlanRequest(Schema):
    starts_on: date
    ends_on: date
    block_minutes: int = Field(default=60, ge=15, le=240)

    @model_validator(mode="after")
    def valid_range(self):
        if self.starts_on > self.ends_on or (self.ends_on - self.starts_on).days > 31:
            raise ValueError("Plan range must be ordered and at most 31 days")
        return self


class PlanCommit(Versioned):
    input_version: int = Field(ge=0)
    blocks: list[StudyBlock]


class CompletedCourse(Schema):
    course_code: str
    grade: str | None = None
    credits: Decimal | None = Field(default=None, gt=0)


class CompletedCoursesUpdate(Versioned):
    courses: list[CompletedCourse]


class PrerequisiteRule(Schema):
    course_id: str
    all_of: list[str] = Field(default_factory=list)
    any_of: list[str] = Field(default_factory=list)
    minimum_grade: str | None = None
    syllabus_id: str | None = None
    passage_ids: list[str] = Field(default_factory=list)


class PrerequisiteUpdate(Versioned):
    rule: PrerequisiteRule


class AcademicState(Schema):
    version: int = Field(default=0, ge=0)
    syllabi: dict[str, Syllabus] = Field(default_factory=dict)
    assessments: dict[str, Assessment] = Field(default_factory=dict)
    policies: dict[str, CoursePolicy] = Field(default_factory=dict)
    grading_schemes: dict[str, GradingScheme] = Field(default_factory=dict)
    tasks: dict[str, Task] = Field(default_factory=dict)
    availability: list[AvailabilityWindow] = Field(default_factory=list)
    max_daily_minutes: int = 240
    study_blocks: dict[str, StudyBlock] = Field(default_factory=dict)
    completed_courses: list[CompletedCourse] = Field(default_factory=list)
    prerequisites: dict[str, PrerequisiteRule] = Field(default_factory=dict)
