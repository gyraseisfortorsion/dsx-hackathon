from datetime import date
from uuid import uuid4

from fastapi import Depends, HTTPException, Query

from .models import (
    AvailabilityUpdate,
    BreakdownRequest,
    CompletedCoursesUpdate,
    GradeScenario,
    GradingSchemeUpdate,
    PlanCommit,
    PlanRequest,
    PrerequisiteUpdate,
    ScoreUpdate,
    SyllabusReview,
    SyllabusUpload,
    TaskUpdate,
)


def install_academic_routes(app, selected_student):
    def fail_missing(exc):
        raise HTTPException(404, str(exc).strip("'")) from None

    @app.get("/academic/dashboard")
    async def dashboard(on: date | None = None, student=Depends(selected_student)):
        state = await app.state.academic.read(student)
        return app.state.academic.envelope(
            student, state, app.state.academic.dashboard(student, state, on)
        )

    @app.get("/academic/courses")
    async def courses(student=Depends(selected_student)):
        state = await app.state.academic.read(student)
        rows = app.state.repository.course_response(student).courses
        return app.state.academic.envelope(student, state, rows)

    @app.get("/academic/calendar")
    async def calendar(
        from_date: date = Query(alias="from"),
        to: date = Query(alias="to"),
        student=Depends(selected_student),
    ):
        if from_date > to or (to - from_date).days > 370:
            raise HTTPException(422, "Calendar range must be ordered and at most 370 days")
        state = await app.state.academic.read(student)
        classes = [
            row.model_dump(mode="json")
            for row in app.state.repository.calendar(student).events
            if from_date <= row.starts_at.date() <= to and row.kind == "class"
        ]
        assessments = [
            row.model_dump(mode="json")
            for row in state.assessments.values()
            if (row.due_at and from_date <= row.due_at.date() <= to)
            or (row.due_on and from_date <= row.due_on <= to)
        ]
        blocks = [
            row.model_dump(mode="json")
            for row in state.study_blocks.values()
            if from_date <= row.starts_at.date() <= to
        ]
        return app.state.academic.envelope(
            student, state, {"classes": classes, "assessments": assessments, "study_blocks": blocks}
        )

    @app.post("/academic/courses/{course_id}/syllabi", status_code=201)
    async def upload_syllabus(
        course_id: str, body: SyllabusUpload, student=Depends(selected_student)
    ):
        try:
            state, result = await app.state.academic.mutate(
                student,
                body.version,
                lambda data: app.state.academic.upload_syllabus(student, data, course_id, body),
            )
        except KeyError as exc:
            fail_missing(exc)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return app.state.academic.envelope(student, state, result)

    @app.get("/academic/syllabi")
    async def syllabi(course_id: str | None = None, student=Depends(selected_student)):
        state = await app.state.academic.read(student)
        rows = [
            row for row in state.syllabi.values() if not course_id or row.course_id == course_id
        ]
        return app.state.academic.envelope(student, state, rows)

    @app.get("/academic/syllabi/{syllabus_id}")
    async def syllabus(syllabus_id: str, student=Depends(selected_student)):
        state = await app.state.academic.read(student)
        row = state.syllabi.get(syllabus_id)
        if not row:
            raise HTTPException(404, "Unknown syllabus")
        return app.state.academic.envelope(student, state, row)

    @app.put("/academic/syllabi/{syllabus_id}/review")
    async def review(syllabus_id: str, body: SyllabusReview, student=Depends(selected_student)):
        try:
            state, result = await app.state.academic.mutate(
                student,
                body.version,
                lambda data: app.state.academic.review(data, syllabus_id, body.decisions),
            )
        except KeyError as exc:
            fail_missing(exc)
        return app.state.academic.envelope(student, state, result)

    @app.post("/academic/syllabi/{syllabus_id}/commit")
    async def commit(syllabus_id: str, body: dict, student=Depends(selected_student)):
        version = body.get("version")
        if not isinstance(version, int) or version < 0 or set(body) != {"version"}:
            raise HTTPException(422, "Body must contain only a non-negative version")
        try:
            state, result = await app.state.academic.mutate(
                student, version, lambda data: app.state.academic.commit(data, syllabus_id)
            )
        except KeyError as exc:
            fail_missing(exc)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return app.state.academic.envelope(student, state, result)

    @app.get("/academic/search")
    async def search(
        q: str = Query(min_length=1, max_length=500),
        course_id: str | None = None,
        limit: int = Query(5, ge=1, le=10),
        student=Depends(selected_student),
    ):
        state = await app.state.academic.read(student)
        return app.state.academic.envelope(
            student, state, app.state.academic.search(state, q, course_id, limit)
        )

    @app.get("/academic/passages/{passage_id}")
    async def passage(passage_id: str, student=Depends(selected_student)):
        state = await app.state.academic.read(student)
        for syllabus in state.syllabi.values():
            row = next((item for item in syllabus.passages if item.id == passage_id), None)
            if row:
                return app.state.academic.envelope(
                    student,
                    state,
                    {"course_id": syllabus.course_id, "passage": row},
                )
        raise HTTPException(404, "Unknown passage")

    @app.post("/academic/assessments/{assessment_id}/breakdown", status_code=201)
    async def breakdown(
        assessment_id: str, body: BreakdownRequest, student=Depends(selected_student)
    ):
        try:
            state, result = await app.state.academic.mutate(
                student,
                body.version,
                lambda data: app.state.academic.breakdown(data, assessment_id, body.total_minutes),
            )
        except KeyError as exc:
            fail_missing(exc)
        return app.state.academic.envelope(student, state, result)

    @app.put("/academic/tasks/{task_id}")
    async def update_task(task_id: str, body: TaskUpdate, student=Depends(selected_student)):
        def change(data):
            task = data.tasks.get(task_id)
            if not task:
                raise KeyError("Unknown task")
            updates = body.model_dump(exclude={"version"}, exclude_none=True)
            if updates.get("status") == "done":
                updates["remaining_minutes"] = 0
            data.tasks[task_id] = task.model_copy(update=updates)
            return data.tasks[task_id]

        try:
            state, result = await app.state.academic.mutate(student, body.version, change)
        except KeyError as exc:
            fail_missing(exc)
        return app.state.academic.envelope(student, state, result)

    @app.put("/academic/availability")
    async def availability(body: AvailabilityUpdate, student=Depends(selected_student)):
        def change(data):
            data.availability, data.max_daily_minutes = body.windows, body.max_daily_minutes
            return {"windows": body.windows, "max_daily_minutes": body.max_daily_minutes}

        state, result = await app.state.academic.mutate(student, body.version, change)
        return app.state.academic.envelope(student, state, result)

    @app.get("/academic/workload")
    async def get_workload(
        from_date: date = Query(alias="from"),
        to: date = Query(alias="to"),
        student=Depends(selected_student),
    ):
        if from_date > to or (to - from_date).days > 90:
            raise HTTPException(422, "Workload range must be ordered and at most 90 days")
        state = await app.state.academic.read(student)
        return app.state.academic.envelope(
            student, state, app.state.academic.workload_for(student, state, from_date, to)
        )

    async def plan(body: PlanRequest, student, recovery=False):
        state = await app.state.academic.read(student)
        result = app.state.academic.plan_for(student, state, body, recovery)
        return app.state.academic.envelope(student, state, result)

    @app.post("/academic/plans/preview")
    async def preview(body: PlanRequest, student=Depends(selected_student)):
        return await plan(body, student)

    @app.post("/academic/recovery/preview")
    async def recovery(body: PlanRequest, student=Depends(selected_student)):
        return await plan(body, student, True)

    @app.post("/academic/plans/commit")
    async def commit_plan(body: PlanCommit, student=Depends(selected_student)):
        if body.input_version != body.version:
            raise HTTPException(409, "Plan preview is stale; regenerate it")

        def change(data):
            classes = [
                row for row in app.state.repository.calendar(student).events if row.kind == "class"
            ]
            combined = [*data.study_blocks.values(), *body.blocks]
            for index, block in enumerate(combined):
                conflicts = [*classes, *combined[:index], *combined[index + 1 :]]
                if any(
                    block.starts_at < (row.ends_at or row.starts_at)
                    and block.ends_at > row.starts_at
                    for row in conflicts
                ):
                    raise ValueError("Study blocks cannot overlap classes or other study blocks")
            for block in body.blocks:
                if block.task_id not in data.tasks:
                    raise KeyError(f"Unknown task {block.task_id}")
                block = block.model_copy(update={"id": f"block-{uuid4().hex}"})
                data.study_blocks[block.id] = block
            return list(data.study_blocks.values())

        try:
            state, result = await app.state.academic.mutate(student, body.version, change)
        except KeyError as exc:
            fail_missing(exc)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return app.state.academic.envelope(student, state, result)

    @app.put("/academic/courses/{course_id}/grading-scheme")
    async def grading_scheme(
        course_id: str, body: GradingSchemeUpdate, student=Depends(selected_student)
    ):
        def change(data):
            data.grading_schemes[course_id] = body.scheme
            return body.scheme

        if course_id not in app.state.academic.course_ids(student):
            raise HTTPException(404, "Unknown enrolled course")
        state, result = await app.state.academic.mutate(student, body.version, change)
        return app.state.academic.envelope(student, state, result)

    @app.put("/academic/assessments/{assessment_id}/score")
    async def score(assessment_id: str, body: ScoreUpdate, student=Depends(selected_student)):
        def change(data):
            row = data.assessments.get(assessment_id)
            if not row:
                raise KeyError("Unknown assessment")
            possible = body.points_possible or row.points_possible
            if body.score is not None and possible and body.score > possible:
                raise ValueError("Score exceeds points possible")
            update = body.model_dump(exclude={"version"})
            if body.points_possible is None:
                update.pop("points_possible")
            if body.category is None:
                update.pop("category")
            data.assessments[assessment_id] = row.model_copy(update=update)
            return data.assessments[assessment_id]

        try:
            state, result = await app.state.academic.mutate(student, body.version, change)
        except KeyError as exc:
            fail_missing(exc)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return app.state.academic.envelope(student, state, result)

    @app.get("/academic/courses/{course_id}/grades")
    async def grades(course_id: str, student=Depends(selected_student)):
        state = await app.state.academic.read(student)
        if course_id not in app.state.academic.course_ids(student):
            raise HTTPException(404, "Unknown enrolled course")
        return app.state.academic.envelope(
            student, state, app.state.academic.grades(state, course_id)
        )

    @app.post("/academic/courses/{course_id}/grade-scenarios")
    async def grade_scenario(
        course_id: str, body: GradeScenario, student=Depends(selected_student)
    ):
        state = await app.state.academic.read(student)
        try:
            result = app.state.academic.grade_scenario(
                state, course_id, body.target_percentage, body.assumed_scores
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return app.state.academic.envelope(student, state, result)

    @app.put("/academic/completed-courses")
    async def completed(body: CompletedCoursesUpdate, student=Depends(selected_student)):
        def change(data):
            data.completed_courses = body.courses
            return body.courses

        state, result = await app.state.academic.mutate(student, body.version, change)
        return app.state.academic.envelope(student, state, result)

    @app.put("/academic/courses/{course_id}/prerequisites")
    async def prerequisites(
        course_id: str, body: PrerequisiteUpdate, student=Depends(selected_student)
    ):
        if body.rule.course_id != course_id:
            raise HTTPException(422, "Rule course_id must match the path")

        def change(data):
            data.prerequisites[course_id] = body.rule
            return body.rule

        state, result = await app.state.academic.mutate(student, body.version, change)
        return app.state.academic.envelope(student, state, result)

    @app.get("/academic/courses/{course_id}/prerequisite-check")
    async def prerequisite_check(course_id: str, student=Depends(selected_student)):
        state = await app.state.academic.read(student)
        return app.state.academic.envelope(
            student, state, app.state.academic.prerequisite_check(state, course_id)
        )
