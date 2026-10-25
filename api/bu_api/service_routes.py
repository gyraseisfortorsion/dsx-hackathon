"""Authenticated campus-service endpoints. Mutations require the last envelope version."""

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import uuid4

from fastapi import Depends, HTTPException, Query

from .history import HistoryConflict
from .schemas import StudentProfile
from .service_data import (
    CLUBS,
    CONTACTS,
    LINKS,
    PAGES,
    initial_employment,
    initial_requests,
    initial_threads,
    transactions,
)
from .service_models import (
    ChecklistItem,
    Club,
    DiningTransaction,
    DirectDeposit,
    Employment,
    Enabled,
    HousingContacts,
    HousingCreate,
    HousingEntry,
    HousingRequest,
    HousingUpdate,
    Job,
    MessageCreate,
    Pay,
    PlannerEvent,
    ProfileEdit,
    Residence,
    ResourceLink,
    ResourcePage,
    ServiceSettings,
    SettingsEdit,
    Shift,
    ShiftInput,
    Snapshot,
    StudyGroup,
    StudyGroupCreate,
    Thread,
    ThreadMessage,
    Timesheet,
    Versioned,
)
from .service_store import CampusState


def load_state(app, student):
    state = app.state.services.load(student.profile.user)
    if state.data is None:
        state.data = CampusState(
            threads=initial_threads(student, app.state.repository),
            housing_requests=initial_requests(student),
            employment=initial_employment(),
        )
    return state


def planner_events(student, state):
    rows = []
    for club in CLUBS:
        if club.id in state.planned_club_ids and club.open_house:
            house = club.open_house
            rows.append(
                PlannerEvent(
                    id=f"open-house-{club.id}",
                    kind="club_open_house",
                    title=house.title,
                    starts_at=house.starts_at,
                    ends_at=house.ends_at,
                    location=house.location,
                    club_id=club.id,
                )
            )
    # Explicit prototype syllabus deadline, not an AI extraction or an official assessment.
    for course_id in state.deadline_course_ids:
        rows.append(
            PlannerEvent(
                id=f"syllabus-{course_id}",
                kind="extracted_deadline",
                course_id=course_id,
                title="Prototype syllabus deadline",
                starts_at=(student.profile.as_of + timedelta(days=3)).replace(
                    hour=23, minute=59, second=0, microsecond=0
                ),
            )
        )
    for group in state.study_groups.values():
        rows.append(
            PlannerEvent(
                id=group.id,
                kind="study_group",
                title=group.title,
                starts_at=group.starts_at,
                ends_at=group.ends_at,
                location=group.location,
                course_id=group.course_id,
                thread_id=group.thread_id,
            )
        )
    return sorted(rows, key=lambda row: (row.starts_at, row.id))


def install_service_routes(app, selected_student):
    def envelope(student, state, value):
        return {
            "user": student.profile.user,
            "as_of": student.profile.as_of,
            "is_mock": True,
            "version": state.version,
            "data": value,
        }

    def read(student):
        return load_state(app, student).data

    async def mutate(student, body, change):
        store, user = app.state.services, student.profile.user
        async with store.lock(user):
            stored = await asyncio.to_thread(load_state, app, student)
            if body.version != stored.data.version:
                raise HistoryConflict("Campus state changed; reload and retry")
            result = change(stored.data)
            stored.data.version += 1
            await asyncio.to_thread(store.save, user, stored)
            return envelope(student, stored.data, result)

    def find(mapping, key, name):
        item = mapping.get(key)
        if item is None:
            raise HTTPException(404, f"Unknown {name}")
        return item

    def club_by_id(club_id):
        return find({club.id: club for club in CLUBS}, club_id, "club")

    def course_by_id(student, course_id):
        if course_id not in {e.course_id for e in student.enrollments}:
            raise HTTPException(404, "Unknown enrolled course")

    def club_card(state, club):
        return club.model_copy(
            update={
                "joined": club.id in state.joined_club_ids,
                "open_house_planned": club.id in state.planned_club_ids,
            }
        )

    def thread_card(student, thread):
        messages = [
            message.model_copy(
                update={
                    "from_me": message.author_id == student.profile.user,
                }
            )
            for message in thread.messages
        ]
        return thread.model_copy(
            update={
                "messages": messages,
                "preview": messages[-1].body if messages else "",
                "last_activity": messages[-1].created_at if messages else None,
            }
        )

    @app.put("/student", response_model=Snapshot[StudentProfile])
    async def edit_profile(body: ProfileEdit, student=Depends(selected_student)):
        def change(state):
            state.profile_name = body.full_name
            return student.profile.model_copy(update={"full_name": body.full_name})

        return await mutate(student, body, change)

    @app.get("/settings/preferences", response_model=Snapshot[ServiceSettings])
    def settings(student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, state.settings)

    @app.put("/settings/preferences", response_model=Snapshot[ServiceSettings])
    async def save_settings(body: SettingsEdit, student=Depends(selected_student)):
        def change(state):
            state.settings = body.settings
            return state.settings

        return await mutate(student, body, change)

    @app.get("/chats", response_model=Snapshot[list[Thread]])
    def threads(
        kind: str | None = Query(None, pattern=r"^(class|club|dm|study_group)$"),
        student=Depends(selected_student),
    ):
        state = read(student)
        rows = [
            thread_card(student, thread)
            for thread in state.threads.values()
            if kind is None or thread.kind == kind
        ]
        rows.sort(key=lambda row: row.last_activity or student.profile.as_of, reverse=True)
        return envelope(student, state, rows)

    @app.get("/chats/{thread_id}", response_model=Snapshot[Thread])
    def thread(thread_id: str, student=Depends(selected_student)):
        state = read(student)
        return envelope(
            student,
            state,
            thread_card(
                student,
                find(state.threads, thread_id, "thread"),
            ),
        )

    @app.post(
        "/chats/{thread_id}/messages", response_model=Snapshot[ThreadMessage], status_code=201
    )
    async def send_message(thread_id: str, body: MessageCreate, student=Depends(selected_student)):
        def change(state):
            target = find(state.threads, thread_id, "thread")
            message = ThreadMessage(
                id=uuid4().hex,
                author_id=student.profile.user,
                author=state.profile_name or student.profile.full_name,
                body=body.body,
                created_at=datetime.now(UTC),
                from_me=True,
            )
            target.messages.append(message)
            return message

        return await mutate(student, body, change)

    @app.post(
        "/chats/{thread_id}/study-groups", response_model=Snapshot[StudyGroup], status_code=201
    )
    async def study_group(
        thread_id: str,
        body: StudyGroupCreate,
        student=Depends(selected_student),
    ):
        def change(state):
            source = find(state.threads, thread_id, "thread")
            if source.kind != "class":
                raise HTTPException(422, "Study groups require an enrolled class thread")
            group_id = f"study-{uuid4().hex}"
            group = StudyGroup(
                **body.model_dump(exclude={"version"}),
                id=group_id,
                thread_id=group_id,
                course_id=source.course_id,
            )
            state.study_groups[group_id] = group
            state.threads[group_id] = Thread(
                id=group_id,
                kind="study_group",
                title=body.title,
                avatar="SG",
                course_id=source.course_id,
                notice="Prototype study group",
            )
            return group

        return await mutate(student, body, change)

    @app.get("/clubs", response_model=Snapshot[list[Club]])
    def clubs(student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, [club_card(state, club) for club in CLUBS])

    @app.get("/clubs/{club_id}", response_model=Snapshot[Club])
    def club(club_id: str, student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, club_card(state, club_by_id(club_id)))

    @app.put("/clubs/{club_id}/membership", response_model=Snapshot[Club])
    async def membership(club_id: str, body: Enabled, student=Depends(selected_student)):
        target = club_by_id(club_id)

        def change(state):
            state.joined_club_ids = [key for key in state.joined_club_ids if key != club_id]
            if body.enabled:
                state.joined_club_ids.append(club_id)
            return club_card(state, target)

        return await mutate(student, body, change)

    @app.put("/clubs/{club_id}/open-house", response_model=Snapshot[Club])
    async def open_house(club_id: str, body: Enabled, student=Depends(selected_student)):
        target = club_by_id(club_id)
        if not target.open_house:
            raise HTTPException(404, "Club has no open house")

        def change(state):
            state.planned_club_ids = [key for key in state.planned_club_ids if key != club_id]
            if body.enabled:
                state.planned_club_ids.append(club_id)
            return club_card(state, target)

        return await mutate(student, body, change)

    @app.get("/calendar/extras", response_model=Snapshot[list[PlannerEvent]])
    def extras(student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, planner_events(student, state))

    @app.put("/calendar/deadlines/{course_id}", response_model=Snapshot[list[PlannerEvent]])
    async def deadline(course_id: str, body: Enabled, student=Depends(selected_student)):
        course_by_id(student, course_id)

        def change(state):
            state.deadline_course_ids = [
                key for key in state.deadline_course_ids if key != course_id
            ]
            if body.enabled:
                state.deadline_course_ids.append(course_id)
            return planner_events(student, state)

        return await mutate(student, body, change)

    @app.get("/housing", response_model=Snapshot[Residence])
    def housing(student=Depends(selected_student)):
        state = read(student)
        return envelope(
            student,
            state,
            Residence(
                building="Warren Towers A",
                room="814",
                office="Residence Life Office",
            ),
        )

    @app.get("/housing/contacts", response_model=Snapshot[HousingContacts])
    def contacts(student=Depends(selected_student)):
        return envelope(student, read(student), CONTACTS)

    @app.get("/housing/requests", response_model=Snapshot[list[HousingRequest]])
    def requests(student=Depends(selected_student)):
        state = read(student)
        rows = sorted(state.housing_requests.values(), key=lambda row: row.created_at, reverse=True)
        return envelope(student, state, rows)

    @app.post("/housing/requests", response_model=Snapshot[HousingRequest], status_code=201)
    async def submit_request(body: HousingCreate, student=Depends(selected_student)):
        def change(state):
            at = datetime.now(UTC)
            destination = (
                "Emergency guidance: contact 911 / BUPD; prototype request only"
                if body.urgency == "Emergency"
                else "Residence Life"
                if body.category == "Roommate / Community"
                else "Residence Life / Facilities"
            )
            request = HousingRequest(
                **body.model_dump(exclude={"version"}),
                id=f"H-{uuid4().hex[:12]}",
                title=body.description[:120],
                status="Submitted",
                destination=destination,
                created_at=at,
                updates=[
                    HousingEntry(
                        status="Submitted", text="Prototype request submitted", created_at=at
                    )
                ],
            )
            state.housing_requests[request.id] = request
            return request

        return await mutate(student, body, change)

    @app.get("/housing/requests/{request_id}", response_model=Snapshot[HousingRequest])
    def request_detail(request_id: str, student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, find(state.housing_requests, request_id, "housing request"))

    @app.put("/housing/requests/{request_id}", response_model=Snapshot[HousingRequest])
    async def update_request(
        request_id: str,
        body: HousingUpdate,
        student=Depends(selected_student),
    ):
        def change(state):
            request = find(state.housing_requests, request_id, "housing request")
            if body.status:
                request.status = body.status
            request.updates.append(
                HousingEntry(
                    status=request.status,
                    text=body.text or f"Marked {request.status}",
                    created_at=datetime.now(UTC),
                )
            )
            return request

        return await mutate(student, body, change)

    @app.get("/dining/transactions", response_model=Snapshot[list[DiningTransaction]])
    def dining_transactions(
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0),
        student=Depends(selected_student),
    ):
        return envelope(student, read(student), transactions(student)[offset : offset + limit])

    def sheet(state, sheet_id):
        return find({row.id: row for row in state.employment.timesheets}, sheet_id, "timesheet")

    @app.get("/work", response_model=Snapshot[Employment])
    def work(student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, state.employment)

    @app.get("/work/job", response_model=Snapshot[Job])
    def job(student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, state.employment.job)

    @app.get("/work/pay", response_model=Snapshot[Pay])
    def pay(student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, state.employment.pay)

    @app.get("/work/direct-deposit", response_model=Snapshot[DirectDeposit])
    def direct_deposit(student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, state.employment.direct_deposit)

    @app.get("/work/checklist", response_model=Snapshot[list[ChecklistItem]])
    def checklist(student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, state.employment.checklist)

    @app.put("/work/checklist/{item_id}", response_model=Snapshot[ChecklistItem])
    async def checklist_update(item_id: str, body: Enabled, student=Depends(selected_student)):
        def change(state):
            item = find(
                {row.id: row for row in state.employment.checklist}, item_id, "checklist item"
            )
            item.complete = body.enabled
            return item

        return await mutate(student, body, change)

    @app.get("/work/timesheets", response_model=Snapshot[list[Timesheet]])
    def timesheets(student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, state.employment.timesheets)

    @app.get("/work/timesheets/{sheet_id}", response_model=Snapshot[Timesheet])
    def timesheet(sheet_id: str, student=Depends(selected_student)):
        state = read(student)
        return envelope(student, state, sheet(state, sheet_id))

    def save_shift(state, sheet_id, body, shift_id=None):
        target = sheet(state, sheet_id)
        if target.status != "Draft":
            raise HTTPException(409, "Only draft timesheets can be edited")
        if shift_id:
            find({row.id: row for row in target.shifts}, shift_id, "shift")
        if not target.starts_on <= body.date <= target.ends_on:
            raise HTTPException(422, "Shift date must fall within the timesheet week")
        for row in target.shifts:
            if (
                row.id != shift_id
                and row.date == body.date
                and (body.start < row.end and row.start < body.end)
            ):
                raise HTTPException(422, "Shift overlaps another shift")
        entry = Shift(
            **body.model_dump(exclude={"version"}),
            id=shift_id or uuid4().hex,
            hours=round(body.paid_minutes / 60, 4),
        )
        target.shifts = [row for row in target.shifts if row.id != entry.id] + [entry]
        recalculate(state, target)
        return target

    def recalculate(state, target):
        minutes = sum(row.paid_minutes for row in target.shifts)
        target.hours = round(minutes / 60, 4)
        target.gross_cents = int(
            (Decimal(minutes) * state.employment.job.hourly_rate_cents / 60).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )
        )

    @app.post(
        "/work/timesheets/{sheet_id}/shifts", response_model=Snapshot[Timesheet], status_code=201
    )
    async def add_shift(sheet_id: str, body: ShiftInput, student=Depends(selected_student)):
        return await mutate(student, body, lambda state: save_shift(state, sheet_id, body))

    @app.put("/work/timesheets/{sheet_id}/shifts/{shift_id}", response_model=Snapshot[Timesheet])
    async def edit_shift(
        sheet_id: str,
        shift_id: str,
        body: ShiftInput,
        student=Depends(selected_student),
    ):
        return await mutate(
            student, body, lambda state: save_shift(state, sheet_id, body, shift_id)
        )

    @app.delete("/work/timesheets/{sheet_id}/shifts/{shift_id}", response_model=Snapshot[Timesheet])
    async def delete_shift(
        sheet_id: str,
        shift_id: str,
        version: int = Query(ge=0),
        student=Depends(selected_student),
    ):
        def change(state):
            target = sheet(state, sheet_id)
            if target.status != "Draft":
                raise HTTPException(409, "Only draft timesheets can be edited")
            find({row.id: row for row in target.shifts}, shift_id, "shift")
            target.shifts = [row for row in target.shifts if row.id != shift_id]
            recalculate(state, target)
            return target

        return await mutate(student, Versioned(version=version), change)

    @app.post("/work/timesheets/{sheet_id}/release", response_model=Snapshot[Timesheet])
    async def release(sheet_id: str, body: Versioned, student=Depends(selected_student)):
        def change(state):
            target = sheet(state, sheet_id)
            if target.status != "Draft":
                raise HTTPException(409, "Timesheet already released")
            if not target.shifts:
                raise HTTPException(422, "Add at least one shift before releasing")
            target.status = "Awaiting supervisor"
            return target

        return await mutate(student, body, change)

    @app.get("/resources", response_model=Snapshot[list[ResourcePage]])
    def resources(student=Depends(selected_student)):
        state = read(student)
        profile = ResourcePage(
            id="edit-profile",
            title="Edit Profile",
            intro="Edit the selected prototype profile.",
            rows=[
                state.profile_name or student.profile.full_name,
                student.profile.school,
                student.profile.major,
            ],
        )
        return envelope(student, state, [*PAGES, profile])

    @app.get("/resources/external-links", response_model=Snapshot[list[ResourceLink]])
    def external_links(student=Depends(selected_student)):
        return envelope(student, read(student), LINKS)

    @app.get("/resources/external-links/{link_id}", response_model=Snapshot[ResourceLink])
    def external_link(link_id: str, student=Depends(selected_student)):
        return envelope(
            student, read(student), find({row.id: row for row in LINKS}, link_id, "link")
        )

    @app.get("/resources/{page_id}", response_model=Snapshot[ResourcePage])
    def resource(page_id: str, student=Depends(selected_student)):
        response = resources(student)
        page = find({row.id: row for row in response["data"]}, page_id, "resource page")
        return response | {"data": page}
