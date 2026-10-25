import asyncio
import re
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from ..history import HistoryConflict
from ..schemas import StudentRecord
from .documents import chunk_pages, read_upload
from .extraction import extract_candidates
from .grading import calculate_grade, scenario
from .models import (
    AcademicState,
    Assessment,
    CoursePolicy,
    GradingScheme,
    Passage,
    PrerequisiteRule,
    Syllabus,
    SyllabusUpload,
    Task,
)
from .planning import deadline, preview_plan, workload
from .retrieval import PassageSearch


class AcademicService:
    def __init__(self, store, repository, encoder=None):
        self.store = store
        self.repository = repository
        self.searcher = PassageSearch(encoder)

    def initial_state(self, student: StudentRecord) -> AcademicState:
        assessments = {}
        for row in student.assessments:
            assessments[row.id] = Assessment(
                id=row.id,
                course_id=row.course_id,
                title=row.title,
                kind=row.kind,
                due_at=row.due_at,
                starts_at=row.starts_at,
                points_possible=Decimal(str(row.max_score)),
                status=row.status,
                score=Decimal(str(row.score)) if row.score is not None else None,
            )
        return AcademicState(assessments=assessments)

    def load(self, student: StudentRecord):
        stored = self.store.load(student.profile.user)
        if stored.data is None:
            stored.data = self.initial_state(student)
        return stored

    async def read(self, student: StudentRecord) -> AcademicState:
        return (await asyncio.to_thread(self.load, student)).data

    async def mutate(self, student: StudentRecord, version: int, change):
        user = student.profile.user
        async with self.store.lock(user):
            stored = await asyncio.to_thread(self.load, student)
            if version != stored.data.version:
                raise HistoryConflict("Academic state changed; reload and retry")
            result = change(stored.data)
            stored.data.version += 1
            await asyncio.to_thread(self.store.save, user, stored)
            return stored.data, result

    @staticmethod
    def envelope(student: StudentRecord, state: AcademicState, data):
        return {
            "user": student.profile.user,
            "as_of": student.profile.as_of,
            "is_mock": True,
            "version": state.version,
            "data": data,
        }

    def course_ids(self, student: StudentRecord) -> set[str]:
        return {row.course_id for row in student.enrollments}

    def dashboard(self, student: StudentRecord, state: AcademicState, on: date | None = None):
        on = on or student.profile.as_of.date()
        calendar = self.repository.calendar(student)
        today_classes = [
            row for row in calendar.events if row.kind == "class" and row.starts_at.date() == on
        ]
        upcoming = sorted(
            (
                row
                for row in state.assessments.values()
                if (due := deadline(row))
                and due.date() >= on
                and row.status not in {"graded", "submitted"}
            ),
            key=lambda row: (deadline(row), row.id),
        )
        overdue = sorted(
            (
                row
                for row in state.assessments.values()
                if (due := deadline(row)) and due.date() < on and row.status == "upcoming"
            ),
            key=lambda row: (deadline(row), row.id),
        )
        courses = self.repository.registered_courses(student)
        return {
            "date": on,
            "credits": sum(row.credits for row in courses),
            "courses": [
                {"id": row.id, "code": row.code, "title": row.title, "credits": row.credits}
                for row in courses
            ],
            "today_classes": [row.model_dump(mode="json") for row in today_classes],
            "upcoming_assessments": [row.model_dump(mode="json") for row in upcoming[:10]],
            "overdue_assessments": [row.model_dump(mode="json") for row in overdue],
            "pending_syllabus_items": sum(
                candidate.status == "pending"
                for syllabus in state.syllabi.values()
                for candidate in syllabus.candidates
            ),
            "study_blocks": [
                row.model_dump(mode="json")
                for row in state.study_blocks.values()
                if row.starts_at.date() == on
            ],
        }

    def upload_syllabus(
        self, student: StudentRecord, state: AcademicState, course_id: str, body: SyllabusUpload
    ) -> Syllabus:
        if course_id not in self.course_ids(student):
            raise KeyError("Unknown enrolled course")
        text, digest = read_upload(body.media_type, body.text, body.content_base64)
        existing = [row for row in state.syllabi.values() if row.course_id == course_id]
        duplicate = next((row for row in existing if row.content_sha256 == digest), None)
        if duplicate:
            return duplicate
        revision = max((row.revision for row in existing), default=0) + 1
        syllabus_id = f"syllabus-{uuid4().hex}"
        passages = [
            Passage(
                id=f"passage-{uuid4().hex}",
                syllabus_id=syllabus_id,
                revision=revision,
                page=page,
                ordinal=index,
                text=content,
            )
            for index, (page, content) in enumerate(chunk_pages(text))
        ]
        candidates = extract_candidates(
            passages,
            self.repository.catalog.term.starts_on.year,
            self.repository.catalog.term.timezone,
        )
        latest = max(
            (row for row in existing if row.status == "committed"),
            key=lambda row: row.revision,
            default=None,
        )
        if latest:
            for index, candidate in enumerate(candidates):
                candidate_words = set(re.findall(r"[a-z]+", candidate.title.casefold()))
                matches = []
                for old in latest.candidates:
                    if old.kind != candidate.kind or old.status != "accepted":
                        continue
                    old_words = set(re.findall(r"[a-z]+", old.title.casefold()))
                    similarity = len(candidate_words & old_words) / max(
                        1, len(candidate_words | old_words)
                    )
                    matches.append((similarity, old))
                if matches and max(matches, key=lambda row: row[0])[0] >= 0.45:
                    old = max(matches, key=lambda row: row[0])[1]
                    candidates[index] = candidate.model_copy(
                        update={
                            "change": "unchanged" if candidate.value == old.value else "changed",
                            "replaces_candidate_id": old.id,
                        }
                    )
        syllabus = Syllabus(
            id=syllabus_id,
            course_id=course_id,
            filename=body.filename,
            media_type=body.media_type,
            content_sha256=digest,
            revision=revision,
            created_at=datetime.now().astimezone(),
            passages=passages,
            candidates=candidates,
        )
        state.syllabi[syllabus_id] = syllabus
        return syllabus

    def review(self, state: AcademicState, syllabus_id: str, decisions) -> Syllabus:
        syllabus = state.syllabi.get(syllabus_id)
        if not syllabus:
            raise KeyError("Unknown syllabus")
        candidates = {row.id: row for row in syllabus.candidates}
        for decision in decisions:
            candidate = candidates.get(decision.candidate_id)
            if not candidate:
                raise KeyError(f"Unknown candidate {decision.candidate_id}")
            update = {"status": decision.status}
            if decision.value is not None:
                update["value"] = decision.value
            candidates[candidate.id] = candidate.model_copy(update=update)
        syllabus.candidates = list(candidates.values())
        return syllabus

    def commit(self, state: AcademicState, syllabus_id: str) -> dict:
        syllabus = state.syllabi.get(syllabus_id)
        if not syllabus:
            raise KeyError("Unknown syllabus")
        accepted = [row for row in syllabus.candidates if row.status == "accepted"]
        prior_ids = {
            row.id
            for row in state.syllabi.values()
            if row.course_id == syllabus.course_id
            and row.id != syllabus.id
            and row.status == "committed"
        }
        old_assessments = {
            row.id: row for row in state.assessments.values() if row.syllabus_id in prior_ids
        }
        replacements = {}
        counts = {"assessments": 0, "policies": 0, "grading": 0, "prerequisites": 0}
        for candidate in accepted:
            stable = f"{syllabus.id}:{candidate.id}"
            if candidate.kind == "assessment":
                value = candidate.value
                replacement_ids = {
                    f"{prior_id}:{candidate.replaces_candidate_id}" for prior_id in prior_ids
                }
                old = next(
                    (row for key, row in old_assessments.items() if key in replacement_ids),
                    None,
                ) or next(
                    (
                        row
                        for row in old_assessments.values()
                        if row.kind == value.get("kind", "other")
                        and row.title.casefold() == value.get("title", candidate.title).casefold()
                    ),
                    None,
                )
                state.assessments[stable] = Assessment(
                    id=stable,
                    course_id=syllabus.course_id,
                    title=value.get("title", candidate.title),
                    kind=value.get("kind", "other"),
                    due_at=value.get("due_at"),
                    due_on=value.get("due_on"),
                    starts_at=value.get("starts_at"),
                    points_possible=value.get("points_possible"),
                    category=value.get("category"),
                    syllabus_id=syllabus.id,
                    passage_ids=candidate.passage_ids,
                    score=old.score if old else None,
                    status=old.status if old and old.score is not None else "upcoming",
                )
                if old:
                    replacements[old.id] = stable
                counts["assessments"] += 1
            elif candidate.kind in {"attendance", "late_policy"}:
                state.policies[stable] = CoursePolicy(
                    id=stable,
                    course_id=syllabus.course_id,
                    kind=candidate.kind,
                    text=candidate.value["text"],
                    syllabus_id=syllabus.id,
                    passage_ids=candidate.passage_ids,
                )
                counts["policies"] += 1
            elif candidate.kind == "grading":
                state.grading_schemes[syllabus.course_id] = GradingScheme.model_validate(
                    candidate.value
                    | {"syllabus_id": syllabus.id, "passage_ids": candidate.passage_ids}
                )
                counts["grading"] += 1
            elif candidate.kind == "prerequisite":
                state.prerequisites[syllabus.course_id] = PrerequisiteRule(
                    course_id=syllabus.course_id,
                    syllabus_id=syllabus.id,
                    passage_ids=candidate.passage_ids,
                    **candidate.value,
                )
                counts["prerequisites"] += 1
        for row in state.syllabi.values():
            if (
                row.course_id == syllabus.course_id
                and row.id != syllabus.id
                and row.status == "committed"
            ):
                row.status = "superseded"
        for old_id in old_assessments:
            state.assessments.pop(old_id, None)
        for task_id, task in list(state.tasks.items()):
            if task.assessment_id in replacements:
                state.tasks[task_id] = task.model_copy(
                    update={"assessment_id": replacements[task.assessment_id]}
                )
            elif task.assessment_id in old_assessments:
                state.tasks.pop(task_id)
        for policy_id, policy in list(state.policies.items()):
            if policy.syllabus_id in prior_ids:
                state.policies.pop(policy_id)
        syllabus.status = "committed"
        return counts

    def breakdown(
        self, state: AcademicState, assessment_id: str, total_minutes: int | None
    ) -> list[Task]:
        assessment = state.assessments.get(assessment_id)
        if not assessment:
            raise KeyError("Unknown assessment")
        existing = [row for row in state.tasks.values() if row.assessment_id == assessment_id]
        if existing:
            return existing
        templates = {
            "project": [
                "Clarify requirements",
                "Research",
                "Build first draft",
                "Revise and submit",
            ],
            "assignment": ["Review requirements", "Complete first draft", "Check work and submit"],
            "midterm": ["Review topics", "Practice problems", "Target weak areas", "Final review"],
            "final": [
                "Build study guide",
                "Practice problems",
                "Target weak areas",
                "Final review",
            ],
            "quiz": ["Review notes", "Practice questions"],
            "other": ["Prepare", "Complete", "Review"],
        }
        titles = templates[assessment.kind]
        total = total_minutes or max(60, len(titles) * 60)
        base, extra = divmod(total, len(titles))
        previous = None
        result = []
        for index, title in enumerate(titles):
            task = Task(
                id=f"task-{uuid4().hex}",
                assessment_id=assessment_id,
                title=title,
                estimated_minutes=base + (1 if index < extra else 0),
                remaining_minutes=base + (1 if index < extra else 0),
                dependencies=[previous] if previous else [],
            )
            state.tasks[task.id] = task
            result.append(task)
            previous = task.id
        return result

    def search(
        self, state: AcademicState, query: str, course_id: str | None = None, limit: int = 5
    ):
        return self.searcher.search(state, query, course_id, limit)

    def grades(self, state: AcademicState, course_id: str):
        items = [row for row in state.assessments.values() if row.course_id == course_id]
        return {
            "course_id": course_id,
            **calculate_grade(items, state.grading_schemes.get(course_id)),
            "assessments": [row.model_dump(mode="json") for row in items],
            "scheme": state.grading_schemes.get(course_id),
        }

    def grade_scenario(self, state, course_id, target, assumptions):
        items = [row for row in state.assessments.values() if row.course_id == course_id]
        return scenario(items, state.grading_schemes.get(course_id), target, assumptions)

    def prerequisite_check(self, state: AcademicState, course_id: str):
        rule = state.prerequisites.get(course_id)
        if not rule:
            return {
                "course_id": course_id,
                "status": "unknown",
                "reason": "No reviewed prerequisite rule",
            }
        completed = {
            " ".join(row.course_code.upper().split()): row for row in state.completed_courses
        }
        grade_rank = {
            grade: rank
            for rank, grade in enumerate(
                ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"]
            )
        }

        def satisfied(code):
            course = completed.get(" ".join(code.upper().split()))
            if course is None:
                return False
            if not rule.minimum_grade:
                return True
            if not course.grade or course.grade.upper() not in grade_rank:
                return None
            minimum = grade_rank.get(rule.minimum_grade.upper())
            return None if minimum is None else grade_rank[course.grade.upper()] >= minimum

        all_results = {code: satisfied(code) for code in rule.all_of}
        any_results = {code: satisfied(code) for code in rule.any_of}
        missing_all = [code for code, result in all_results.items() if result is False]
        any_met = not rule.any_of or any(result is True for result in any_results.values())
        unknown_grade = any(
            result is None for result in [*all_results.values(), *any_results.values()]
        )
        if unknown_grade and not missing_all and (not rule.any_of or not any_met):
            status = "unknown"
        else:
            status = "met" if not missing_all and any_met else "not_met"
        return {
            "course_id": course_id,
            "status": status,
            "missing": missing_all,
            "any_of_satisfied": any_met,
            "grade_evidence_incomplete": unknown_grade,
            "rule": rule.model_dump(mode="json"),
        }

    def workload_for(self, student, state, starts_on, ends_on):
        classes = [
            row
            for row in self.repository.calendar(student).events
            if row.kind == "class" and starts_on <= row.starts_at.date() <= ends_on
        ]
        return workload(state, starts_on, ends_on, classes)

    def plan_for(self, student, state, request, recovery=False):
        classes = [
            row
            for row in self.repository.calendar(student).events
            if row.kind == "class" and request.starts_on <= row.starts_at.date() <= request.ends_on
        ]
        return preview_plan(
            state,
            request,
            self.repository.catalog.term.timezone,
            recovery,
            classes,
        )
