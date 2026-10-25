from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from .models import AcademicState, Assessment, PlanRequest, StudyBlock


def deadline(item: Assessment) -> datetime | None:
    if item.due_at:
        return item.due_at
    if item.due_on:
        return datetime.combine(
            item.due_on, datetime.max.time().replace(microsecond=0), ZoneInfo("America/New_York")
        )
    return None


def _capacity_for_day(state: AcademicState, day: date, busy) -> int:
    capacity = 0
    for window in state.availability:
        if window.weekday != day.weekday():
            continue
        start = datetime.combine(day, window.starts_at)
        end = datetime.combine(day, window.ends_at)
        blocked = []
        for row in busy:
            row_start = row.starts_at.replace(tzinfo=None)
            row_end = (row.ends_at or row.starts_at).replace(tzinfo=None)
            overlap_start, overlap_end = max(start, row_start), min(end, row_end)
            if overlap_start < overlap_end:
                blocked.append((overlap_start, overlap_end))
        blocked.sort()
        merged = []
        for interval in blocked:
            if merged and interval[0] <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], interval[1]))
            else:
                merged.append(interval)
        total = int((end - start).total_seconds() // 60)
        total -= sum(int((right - left).total_seconds() // 60) for left, right in merged)
        capacity += max(0, total)
    return min(capacity, state.max_daily_minutes)


def workload(state: AcademicState, starts_on: date, ends_on: date, busy=()) -> dict:
    task_assessment = {
        task.id: state.assessments.get(task.assessment_id) for task in state.tasks.values()
    }
    by_day = defaultdict(lambda: {"required_minutes": 0, "task_ids": [], "assessment_ids": []})
    for task in state.tasks.values():
        assessment = task_assessment[task.id]
        due = deadline(assessment) if assessment else None
        if task.remaining_minutes and due and starts_on <= due.date() <= ends_on:
            row = by_day[due.date().isoformat()]
            row["required_minutes"] += task.remaining_minutes
            row["task_ids"].append(task.id)
            if task.assessment_id not in row["assessment_ids"]:
                row["assessment_ids"].append(task.assessment_id)
    daily_capacity = defaultdict(int)
    day = starts_on
    while day <= ends_on:
        daily_capacity[day.isoformat()] = _capacity_for_day(state, day, busy)
        day += timedelta(days=1)
    cumulative_required = 0
    cumulative_capacity = 0
    rows = []
    day = starts_on
    while day <= ends_on:
        key = day.isoformat()
        cumulative_required += by_day[key]["required_minutes"]
        cumulative_capacity += daily_capacity[key]
        rows.append(
            {
                "date": key,
                **by_day[key],
                "available_minutes": daily_capacity[key],
                "cumulative_deficit_minutes": max(0, cumulative_required - cumulative_capacity),
            }
        )
        day += timedelta(days=1)
    return {
        "from": starts_on,
        "to": ends_on,
        "days": rows,
        "overloaded": any(row["cumulative_deficit_minutes"] > 0 for row in rows),
    }


def _busy(blocks: list[StudyBlock], start: datetime, end: datetime) -> bool:
    return any(start < row.ends_at and end > row.starts_at for row in blocks)


def preview_plan(
    state: AcademicState,
    request: PlanRequest,
    timezone: str,
    recovery: bool = False,
    busy=(),
) -> dict:
    zone = ZoneInfo(timezone)
    locked = [row for row in state.study_blocks.values() if row.locked or row.completed]
    tasks = [
        row for row in state.tasks.values() if row.remaining_minutes > 0 and row.status != "done"
    ]

    def grade_impact(task):
        assessment = state.assessments.get(task.assessment_id)
        if not assessment:
            return 0
        scheme = state.grading_schemes.get(assessment.course_id)
        if scheme and scheme.mode == "weighted" and assessment.category:
            category = next(
                (
                    row
                    for row in scheme.categories
                    if row.name.casefold() == assessment.category.casefold()
                ),
                None,
            )
            if category:
                return float(category.weight)
        return float(assessment.points_possible or 0)

    tasks.sort(
        key=lambda task: (
            deadline(state.assessments.get(task.assessment_id))
            or datetime.max.replace(tzinfo=zone),
            -grade_impact(task),
            -task.remaining_minutes,
            task.id,
        )
    )
    remaining = {row.id: row.remaining_minutes for row in tasks}
    scheduled: list[StudyBlock] = []
    day = request.starts_on
    while day <= request.ends_on:
        used = 0
        windows = sorted(
            (row for row in state.availability if row.weekday == day.weekday()),
            key=lambda row: row.starts_at,
        )
        for window in windows:
            cursor = datetime.combine(day, window.starts_at, zone)
            window_end = datetime.combine(day, window.ends_at, zone)
            while cursor < window_end and used < state.max_daily_minutes:
                eligible = []
                for task in tasks:
                    if remaining[task.id] <= 0:
                        continue
                    due = deadline(state.assessments.get(task.assessment_id))
                    if due and cursor >= due and not recovery:
                        continue
                    if any(remaining.get(dep, 0) > 0 for dep in task.dependencies):
                        continue
                    eligible.append(task)
                if not eligible:
                    break
                task = eligible[0]
                minutes = min(
                    request.block_minutes,
                    remaining[task.id],
                    state.max_daily_minutes - used,
                    int((window_end - cursor).total_seconds() // 60),
                )
                if minutes < 15:
                    break
                end = cursor + timedelta(minutes=minutes)
                if _busy([*busy, *locked, *scheduled], cursor, end):
                    cursor += timedelta(minutes=15)
                    continue
                scheduled.append(
                    StudyBlock(
                        id=f"block-preview-{len(scheduled) + 1}",
                        task_id=task.id,
                        starts_at=cursor,
                        ends_at=end,
                    )
                )
                remaining[task.id] -= minutes
                used += minutes
                cursor = end
        day += timedelta(days=1)
    unscheduled = [
        {"task_id": key, "remaining_minutes": value}
        for key, value in remaining.items()
        if value > 0
    ]
    return {
        "input_version": state.version,
        "mode": "recovery" if recovery else "weekly",
        "blocks": [row.model_dump(mode="json") for row in scheduled],
        "unscheduled": unscheduled,
        "feasible": not unscheduled,
    }
