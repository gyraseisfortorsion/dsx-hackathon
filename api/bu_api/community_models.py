"""Validated inputs and durable records for the student community prototype."""

from datetime import date, datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, StringConstraints, field_validator, model_validator

from .schemas import Schema

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Goal = Literal["exam_preparation", "weekly_review", "assignment_discussion"]
Category = Literal["books", "furniture", "supplies", "electronics", "other"]
Condition = Literal["new", "like_new", "good", "fair"]
ListingStatus = Literal["active", "reserved", "sold", "withdrawn", "deleted", "removed"]


class Window(Schema):
    weekday: int = Field(ge=0, le=6)
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    effective_from: date | None = None
    effective_until: date | None = None

    @model_validator(mode="after")
    def valid(self):
        if self.start >= self.end:
            raise ValueError("End time must be after start time; split overnight windows")
        if (
            self.effective_from
            and self.effective_until
            and self.effective_from > self.effective_until
        ):
            raise ValueError("Availability end date must follow start date")
        return self


class StudyProfile(Schema):
    discovery: bool = False
    term: Short
    course_ids: list[Short] = Field(default_factory=list, max_length=12)
    goals: list[Goal] = Field(default_factory=list, max_length=3)
    study_format: Literal["quiet", "collaborative"] | None = None
    meeting_mode: Literal["online", "in_person", "either"] | None = None
    interests: list[Literal["technology", "arts", "sports", "science", "community"]] = Field(
        default_factory=list, max_length=5
    )
    campus_area: Short | None = None
    timezone: str = Field(default="America/New_York", max_length=64)
    availability: list[Window] = Field(default_factory=list, max_length=28)
    notifications: bool = True
    updated_at: datetime | None = None

    @field_validator("timezone")
    @classmethod
    def timezone_exists(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Choose a valid IANA time zone") from None
        return value


class InviteInput(Schema):
    recipient: Short
    course_id: Short
    message: Text | None = None
    proposed_time: Short | None = None


class Invitation(InviteInput):
    id: str
    sender: str
    status: Literal["pending", "accepted", "declined", "cancelled"] = "pending"
    created_at: datetime
    updated_at: datetime
    conversation_id: str | None = None


class InviteAction(Schema):
    action: Literal["accept", "decline", "cancel"]


class FeedbackInput(Schema):
    useful: bool
    studied_together: bool | None = None


class ListingText(Schema):
    title: Short
    description: Text


class PhotoInput(Schema):
    data: str = Field(min_length=1, max_length=2_800_000)


class ListingInput(Schema):
    title: Short
    description: Text
    category: Category
    condition: Condition
    price_minor: int = Field(strict=True, ge=0, le=100_000_000)
    currency: Literal["USD"] = "USD"
    pickup_area: Short
    photo_ids: list[Short] = Field(min_length=1, max_length=3)
    isbn: str | None = Field(default=None, max_length=30)
    edition: Short | None = None
    author: Short | None = None
    course_id: Short | None = None

    @field_validator("category", mode="before")
    @classmethod
    def category_alias(cls, value):
        if isinstance(value, str):
            key = value.strip().casefold()
            return {
                "book": "books",
                "textbook": "books",
                "textbooks": "books",
                "school supplies": "supplies",
                "tech": "electronics",
            }.get(key, key)
        return value

    @field_validator("condition", mode="before")
    @classmethod
    def condition_alias(cls, value):
        if isinstance(value, str):
            key = value.strip().casefold().replace(" ", "_").replace("-", "_")
            return {"brand_new": "new", "excellent": "like_new", "used": "good"}.get(key, key)
        return value

    @model_validator(mode="after")
    def book_fields(self):
        if self.category != "books" and any([self.isbn, self.edition, self.author, self.course_id]):
            raise ValueError("Book details are only supported for books")
        if self.isbn:
            value = self.isbn.replace("-", "").replace(" ", "").upper()
            valid = False
            if len(value) == 13 and value.isdigit():
                valid = (
                    sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(value)) % 10 == 0
                )
            elif (
                len(value) == 10
                and value[:9].isdigit()
                and (value[-1].isdigit() or value[-1] == "X")
            ):
                valid = (
                    sum((10 - i) * (10 if c == "X" else int(c)) for i, c in enumerate(value)) % 11
                    == 0
                )
            if not valid:
                raise ValueError("ISBN checksum is invalid")
            self.isbn = value
        self.photo_ids = list(dict.fromkeys(self.photo_ids))
        return self


class Listing(ListingInput):
    id: str
    seller_id: str
    university_id: str = "bu"
    status: ListingStatus = "active"
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    model_review: dict | None = None


class StatusInput(Schema):
    status: Literal["active", "reserved", "sold", "withdrawn", "deleted"]
    renew: bool = False


class MessageInput(Schema):
    body: Text


class Message(MessageInput):
    id: str
    author_id: str
    created_at: datetime


class Conversation(Schema):
    id: str
    participants: list[str]
    listing_id: str | None = None
    invitation_id: str | None = None
    messages: list[Message] = Field(default_factory=list)
    created_at: datetime


class ReportInput(Schema):
    target_type: Literal["account", "listing"]
    target_id: Short
    reason: Text


class Report(ReportInput):
    id: str
    reporter: str
    status: Literal["pending", "reviewed"] = "pending"
    created_at: datetime


class ModerationInput(Schema):
    action: Literal["dismiss", "remove_listing", "suspend_account", "restore_account"]
    reason: Text


class EnabledInput(Schema):
    enabled: bool


class CommunityData(Schema):
    version: int = 0
    profiles: dict[str, StudyProfile] = Field(default_factory=dict)
    invitations: dict[str, Invitation] = Field(default_factory=dict)
    feedback: dict[str, dict] = Field(default_factory=dict)
    listings: dict[str, Listing] = Field(default_factory=dict)
    photos: dict[str, dict] = Field(default_factory=dict)
    saved: dict[str, list[str]] = Field(default_factory=dict)
    conversations: dict[str, Conversation] = Field(default_factory=dict)
    blocks: dict[str, list[str]] = Field(default_factory=dict)
    reports: dict[str, Report] = Field(default_factory=dict)
    suspended: list[str] = Field(default_factory=list)
    deleted_accounts: list[str] = Field(default_factory=list)
    audit: list[dict] = Field(default_factory=list)
    rates: dict[str, list[datetime]] = Field(default_factory=dict)
    deletion_requests: dict[str, datetime] = Field(default_factory=dict)
