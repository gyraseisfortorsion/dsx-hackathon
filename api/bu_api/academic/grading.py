from decimal import Decimal

from .models import Assessment, GradingScheme

TWOPLACES = Decimal("0.01")


def _graded(items: list[Assessment]) -> list[Assessment]:
    return [row for row in items if row.score is not None and row.points_possible]


def _exact_percentage(items: list[Assessment], scheme: GradingScheme | None) -> Decimal | None:
    graded = _graded(items)
    if not graded:
        return None
    if scheme is None or scheme.mode == "points":
        earned = sum((row.score or Decimal(0) for row in graded), Decimal(0))
        possible = sum((row.points_possible or Decimal(0) for row in graded), Decimal(0))
        return earned * 100 / possible if possible else None
    weighted, counted_weight = Decimal(0), Decimal(0)
    for category in scheme.categories:
        rows = [
            row for row in graded if (row.category or "").casefold() == category.name.casefold()
        ]
        rows.sort(key=lambda row: (row.score or Decimal(0)) / (row.points_possible or Decimal(1)))
        rows = rows[min(category.drop_lowest, len(rows)) :]
        earned = sum((row.score or Decimal(0) for row in rows), Decimal(0))
        possible = sum((row.points_possible or Decimal(0) for row in rows), Decimal(0))
        if possible:
            weighted += earned * 100 / possible * category.weight / 100
            counted_weight += category.weight
    return weighted * 100 / counted_weight if counted_weight else None


def calculate_grade(items: list[Assessment], scheme: GradingScheme | None) -> dict:
    graded = _graded(items)
    if not graded:
        return {"current_percentage": None, "earned": "0", "possible": "0", "categories": []}
    if scheme is None or scheme.mode == "points":
        earned = sum((row.score or Decimal(0) for row in graded), Decimal(0))
        possible = sum((row.points_possible or Decimal(0) for row in graded), Decimal(0))
        percentage = earned * 100 / possible if possible else None
        return {
            "current_percentage": str(percentage.quantize(TWOPLACES))
            if percentage is not None
            else None,
            "earned": str(earned),
            "possible": str(possible),
            "categories": [],
            "mode": "points",
        }
    categories = []
    weighted = Decimal(0)
    counted_weight = Decimal(0)
    for category in scheme.categories:
        rows = [
            row for row in graded if (row.category or "").casefold() == category.name.casefold()
        ]
        rows.sort(key=lambda row: (row.score or Decimal(0)) / (row.points_possible or Decimal(1)))
        rows = rows[min(category.drop_lowest, len(rows)) :]
        earned = sum((row.score or Decimal(0) for row in rows), Decimal(0))
        possible = sum((row.points_possible or Decimal(0) for row in rows), Decimal(0))
        percent = earned * 100 / possible if possible else None
        if percent is not None:
            weighted += percent * category.weight / 100
            counted_weight += category.weight
        categories.append(
            {
                "name": category.name,
                "percentage": str(percent.quantize(TWOPLACES)) if percent is not None else None,
                "weight": str(category.weight),
                "counted": len(rows),
            }
        )
    current = weighted * 100 / counted_weight if counted_weight else None
    return {
        "current_percentage": str(current.quantize(TWOPLACES)) if current is not None else None,
        "categories": categories,
        "mode": "weighted",
        "counted_weight": str(counted_weight),
    }


def scenario(
    items: list[Assessment],
    scheme: GradingScheme | None,
    target: Decimal,
    assumptions: dict[str, Decimal],
) -> dict:
    projected = []
    unknown = []
    for item in items:
        if item.id in assumptions:
            score = assumptions[item.id]
            if item.points_possible is None or score > item.points_possible:
                raise ValueError(f"Invalid assumed score for {item.id}")
            projected.append(item.model_copy(update={"score": score, "status": "graded"}))
        else:
            projected.append(item)
            if item.score is None and item.points_possible:
                unknown.append(item.id)
    result = calculate_grade(projected, scheme)
    current = Decimal(result["current_percentage"]) if result["current_percentage"] else None
    response = {
        "target_percentage": str(target),
        "projection": result,
        "unknown_assessment_ids": unknown,
        "target_met": current is not None and current >= target,
    }
    if len(unknown) == 1:
        remaining = next(row for row in items if row.id == unknown[0])
        possible = remaining.points_possible or Decimal(0)
        low, high = Decimal(0), possible
        for _ in range(30):
            midpoint = (low + high) / 2
            trial = [
                row.model_copy(update={"score": midpoint, "status": "graded"})
                if row.id == remaining.id
                else row
                for row in projected
            ]
            grade = _exact_percentage(trial, scheme)
            if grade is not None and grade >= target:
                high = midpoint
            else:
                low = midpoint
        full_score_rows = [
            row.model_copy(update={"score": possible, "status": "graded"})
            if row.id == remaining.id
            else row
            for row in projected
        ]
        maximum = _exact_percentage(full_score_rows, scheme)
        response["required_on_single_remaining"] = {
            "assessment_id": remaining.id,
            "points": str(high.quantize(TWOPLACES)),
            "possible": str(possible),
            "achievable": maximum is not None and maximum >= target,
        }
    return response
