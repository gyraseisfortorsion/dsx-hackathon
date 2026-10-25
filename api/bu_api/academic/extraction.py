import re
from datetime import datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from .models import Candidate, Passage

MONTHS = {
    name.casefold(): number
    for number, name in enumerate(
        [
            "",
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ]
    )
}
MONTHS.update({name[:3].casefold(): number for name, number in list(MONTHS.items()) if name})
DATE_RE = re.compile(
    r"\b("
    + "|".join(sorted(MONTHS, key=len, reverse=True))
    + r")\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b",
    re.IGNORECASE,
)
WEIGHT_RE = re.compile(r"([A-Za-z][A-Za-z /&-]{1,40})\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)\s*%")


def _kind(text: str) -> str:
    lowered = text.casefold()
    for kind in ("final", "midterm", "quiz", "project", "assignment"):
        if kind in lowered:
            return kind
    if "paper" in lowered or "essay" in lowered:
        return "assignment"
    return "other"


def extract_candidates(passages: list[Passage], term_year: int, timezone: str) -> list[Candidate]:
    rows: list[Candidate] = []
    seen = set()
    for passage in passages:
        for line in passage.text.splitlines():
            clean = " ".join(line.split())
            match = DATE_RE.search(clean)
            context = clean.casefold()
            if match and any(
                word in context
                for word in (
                    "due",
                    "exam",
                    "quiz",
                    "midterm",
                    "final",
                    "project",
                    "paper",
                    "assignment",
                )
            ):
                year = int(match.group(3) or term_year)
                month, day = MONTHS[match.group(1).rstrip(".").casefold()], int(match.group(2))
                try:
                    due = datetime(year, month, day, 23, 59, tzinfo=ZoneInfo(timezone))
                except ValueError:
                    continue
                key = (_kind(clean), clean.casefold(), due.isoformat())
                if key in seen:
                    continue
                seen.add(key)
                title = clean[:120]
                rows.append(
                    Candidate(
                        id=f"candidate-{uuid4().hex}",
                        kind="assessment",
                        title=title,
                        value={"title": title, "kind": _kind(clean), "due_at": due.isoformat()},
                        passage_ids=[passage.id],
                        confidence=0.82 if match.group(3) else 0.68,
                        ambiguity=None if match.group(3) else f"Year inferred as {term_year}",
                    )
                )
        lowered = passage.text.casefold()
        if any(
            term in lowered
            for term in ("late work", "late assignment", "late submission", "extension")
        ):
            rows.append(
                Candidate(
                    id=f"candidate-{uuid4().hex}",
                    kind="late_policy",
                    title="Late-work policy",
                    value={"text": passage.text},
                    passage_ids=[passage.id],
                    confidence=0.72,
                )
            )
        if any(term in lowered for term in ("attendance", "absence", "absences")):
            rows.append(
                Candidate(
                    id=f"candidate-{uuid4().hex}",
                    kind="attendance",
                    title="Attendance policy",
                    value={"text": passage.text},
                    passage_ids=[passage.id],
                    confidence=0.72,
                )
            )
        weights = [(name.strip(), value) for name, value in WEIGHT_RE.findall(passage.text)]
        if weights and 95 <= sum(float(value) for _, value in weights) <= 105:
            rows.append(
                Candidate(
                    id=f"candidate-{uuid4().hex}",
                    kind="grading",
                    title="Weighted grading scheme",
                    value={
                        "mode": "weighted",
                        "categories": [
                            {"name": name, "weight": value, "drop_lowest": 0}
                            for name, value in weights
                        ],
                        "thresholds": [],
                    },
                    passage_ids=[passage.id],
                    confidence=0.8,
                )
            )
        prerequisite = re.search(
            r"(?:pre-?requisites?|requires?)\s*[:\-]?\s*([^\n.]{3,180})",
            passage.text,
            re.IGNORECASE,
        )
        if prerequisite:
            codes = re.findall(r"\b[A-Z]{2,4}\s*\d{3,4}\b", prerequisite.group(1), re.IGNORECASE)
            if codes:
                rows.append(
                    Candidate(
                        id=f"candidate-{uuid4().hex}",
                        kind="prerequisite",
                        title="Prerequisites",
                        value={
                            "all_of": [" ".join(code.upper().split()) for code in codes],
                            "any_of": [],
                        },
                        passage_ids=[passage.id],
                        confidence=0.65,
                        ambiguity="Confirm AND/OR logic",
                    )
                )
    return rows
