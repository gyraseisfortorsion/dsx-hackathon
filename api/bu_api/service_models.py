"""Contracts for fictional campus services; independent of assistant conversations."""

import base64
import binascii
from datetime import date, datetime, time
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints, model_validator

from .schemas import Schema

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Category = Literal[
    "Plumbing",
    "Heating & Cooling",
    "Electrical",
    "Furniture / Appliance / Key",
    "Pest",
    "Cleaning / Common Area",
    "Roommate / Community",
    "Safety / Security",
    "Other",
]
HousingStatus = Literal[
    "Submitted",
    "Routed",
    "Assigned",
    "Scheduled / In progress",
    "Resolved",
]


class Snapshot[T](Schema):
    user: str
    as_of: datetime
    is_mock: Literal[True] = True
    version: int
    data: T


class Versioned(Schema):
    version: int = Field(ge=0)


class Enabled(Versioned):
    enabled: bool


class ProfileEdit(Versioned):
    full_name: Name


class ServiceSettings(Schema):
    vegetarian: bool = True
    step_free: bool = True
    class_reminders: bool = True
    saved_event_updates: bool = True
    club_activity: bool = False
    reduced_motion: bool = False
    larger_text: bool = False
    grades_hidden: bool = True
    face_id_enabled: bool = True
    pay_hidden: bool = True
    menu_hint_visible: bool = True


class SettingsEdit(Versioned):
    settings: ServiceSettings


class ThreadMessage(Schema):
    id: str
    author_id: str
    author: str
    body: Text
    created_at: AwareDatetime
    from_me: bool = False


class PinnedNotice(Schema):
    label: str
    title: str
    body: str


class Thread(Schema):
    id: str
    kind: Literal["class", "club", "dm", "study_group"]
    title: str
    avatar: str
    course_id: str | None = None
    club_id: str | None = None
    notice: str | None = None
    pinned: PinnedNotice | None = None
    messages: list[ThreadMessage] = Field(default_factory=list)
    preview: str = ""
    last_activity: AwareDatetime | None = None


class MessageCreate(Versioned):
    body: Text


class StudyGroupFields(Schema):
    title: Name
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    location: Name

    @model_validator(mode="after")
    def valid_interval(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must follow starts_at")
        return self


class StudyGroupCreate(StudyGroupFields, Versioned):
    pass


class StudyGroup(StudyGroupFields):
    id: str
    thread_id: str
    course_id: str


class OpenHouse(Schema):
    title: str
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    location: str


class Club(Schema):
    id: str
    initials: str
    name: str
    tagline: str
    about: str
    tags: list[str]
    member_count: int
    meeting_schedule: str
    welcome: str
    open_house: OpenHouse | None = None
    joined: bool = False
    open_house_planned: bool = False


class Residence(Schema):
    building: str
    room: str
    office: str


class Photo(Schema):
    """Small private JSON attachment. No device paths or arbitrary remote URLs."""

    name: Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_. -]{1,120}$")]
    media_type: Literal["image/jpeg", "image/png"]
    content_base64: str = Field(min_length=1, max_length=1_398_104)

    @model_validator(mode="after")
    def valid_image(self):
        try:
            raw = base64.b64decode(self.content_base64, validate=True)
        except (ValueError, binascii.Error):
            raise ValueError("Invalid base64 photo") from None
        if len(raw) > 1024 * 1024:
            raise ValueError("Photos must be at most 1 MiB")
        signature = b"\x89PNG\r\n\x1a\n" if self.media_type == "image/png" else b"\xff\xd8\xff"
        if not raw.startswith(signature):
            raise ValueError("Photo signature does not match media_type")
        return self


class HousingFields(Schema):
    description: Text
    category: Category
    urgency: Literal["Routine", "Urgent", "Emergency"] = "Routine"
    building: Name
    room: Name
    preferred_time: Literal["Weekday morning", "Weekday afternoon", "Any time"] = "Any time"
    photos: list[Photo] = Field(default_factory=list, max_length=3)


class HousingCreate(HousingFields, Versioned):
    pass


class HousingUpdate(Versioned):
    status: HousingStatus | None = None
    text: Text | None = None

    @model_validator(mode="after")
    def has_update(self):
        if self.status is None and self.text is None:
            raise ValueError("Provide status or text")
        return self


class HousingEntry(Schema):
    status: HousingStatus
    text: str
    created_at: AwareDatetime


class HousingRequest(HousingFields):
    id: str
    title: str
    status: HousingStatus
    destination: str
    created_at: AwareDatetime
    updates: list[HousingEntry]


class ShiftFields(Schema):
    date: date
    start: time
    end: time
    break_minutes: int = Field(default=0, ge=0, le=1440)
    note: Annotated[str, StringConstraints(max_length=2000)] = ""

    @model_validator(mode="after")
    def valid_shift(self):
        if (
            self.start.tzinfo
            or self.end.tzinfo
            or self.start.second
            or self.end.second
            or self.start.microsecond
            or self.end.microsecond
        ):
            raise ValueError("Use local HH:MM times in America/New_York")
        duration = (self.end.hour * 60 + self.end.minute) - (
            self.start.hour * 60 + self.start.minute
        )
        if duration <= 0 or self.break_minutes >= duration:
            raise ValueError("Shift must end the same day and have positive paid minutes")
        return self

    @property
    def paid_minutes(self):
        return (
            (self.end.hour * 60 + self.end.minute)
            - (self.start.hour * 60 + self.start.minute)
            - self.break_minutes
        )


class ShiftInput(ShiftFields, Versioned):
    pass


class Shift(ShiftFields):
    id: str
    hours: float


class Timesheet(Schema):
    id: str
    starts_on: date
    ends_on: date
    due_at: AwareDatetime
    status: Literal["Draft", "Awaiting supervisor", "Approved", "Paid"] = "Draft"
    shifts: list[Shift] = Field(default_factory=list)
    hours: float = 0
    gross_cents: int = 0


class ChecklistItem(Schema):
    id: str
    title: str
    complete: bool
    description: str


class Job(Schema):
    id: str
    title: str
    department: str
    supervisor: str
    status: Literal["active"] = "active"
    hourly_rate_cents: int
    currency: Literal["USD"] = "USD"


class Pay(Schema):
    currency: Literal["USD"] = "USD"
    next_payday: date
    last_payment_on: date
    last_payment_cents: int
    ytd_gross_cents: int
    ytd_net_cents: int


class DirectDeposit(Schema):
    status: Literal["Authorized", "Not configured"]
    account_last_four: str | None = Field(default=None, pattern=r"^\d{4}$")
    manage_url: str


class Employment(Schema):
    job: Job
    timesheets: list[Timesheet]
    checklist: list[ChecklistItem]
    pay: Pay
    direct_deposit: DirectDeposit


class DiningTransaction(Schema):
    id: str
    merchant: str
    occurred_at: AwareDatetime
    account: Literal["dining_points", "convenience_points"]
    amount_cents: int
    currency: Literal["USD"] = "USD"


class PlannerEvent(Schema):
    id: str
    kind: Literal["club_open_house", "extracted_deadline", "study_group"]
    title: str
    starts_at: AwareDatetime
    ends_at: AwareDatetime | None = None
    location: str | None = None
    club_id: str | None = None
    course_id: str | None = None
    thread_id: str | None = None


class ResourceLink(Schema):
    id: str
    title: str
    description: str
    url: str


class ResourcePage(Schema):
    id: str
    title: str
    intro: str
    rows: list[str]
    links: list[ResourceLink] = Field(default_factory=list)


class Contact(Schema):
    label: str
    value: str
    href: str


class HousingContacts(Schema):
    residences: list[Contact]
    real_estate: list[Contact]
    emergency: list[Contact]
    routing_is_mock: Literal[True] = True
