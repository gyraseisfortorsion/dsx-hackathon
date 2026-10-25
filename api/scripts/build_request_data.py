"""Build synthetic, source-linked routing annotations and topic-grouped splits."""

import csv
import json
import random
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "research/request-routing"
# Merge related scenarios with the seed's broader families BEFORE splitting.
FAMILIES = {
    "registrar": (
        "domestic_name semester_record transcript enrollment_verification "
        "diploma domestic_name enrollment_verification semester_record "
        "transcript semester_record"
    ),
    "financial_assistance": (
        "appeal documents application counseling application appeal documents "
        "missing_award missing_award missing_award"
    ),
    "student_financials": (
        "bill_details payments transactions payments bill_details late_fee "
        "transactions transactions financial_hold transactions"
    ),
    "housing": (
        "swap roommate change_status room_change room_change room_change "
        "change_status roommate change_status change_window"
    ),
    "residential_maintenance": (
        "furniture lighting fixture fixture fixture furniture appliance fixture fixture furniture"
    ),
    "it_help": (
        "duo wifi password portal_login portal_login email account_lock wifi portal_error duo"
    ),
    "disability_access": (
        "housing_access exam_access documents captioning semester_request "
        "accessible_materials housing_access note_taking appeal "
        "temporary_access"
    ),
    "isso": (
        "travel_signature passport travel_documents employment_status "
        "employment_status travel_documents sevis status travel_documents "
        "status"
    ),
    "terrier_card": (
        "replacement replacement meal_change points meal_account photo "
        "replacement points replacement card_pickup"
    ),
    "university_service_center": (
        "leave_process return leave_withdrawal leave_timing leave_process "
        "leave_status reverse_leave leave_withdrawal leave_process "
        "leave_process"
    ),
}


def build():
    departments = {d["id"]: d for d in json.loads((ROOT / "departments.json").read_text())}
    rows = [json.loads(line) for line in (ROOT / "requests_seed.jsonl").read_text().splitlines()]
    for department, scenarios in json.loads((ROOT / "scenarios.json").read_text()).items():
        families = FAMILIES[department].split()
        assert len(families) == len(scenarios)
        for (intent, *texts), family in zip(scenarios, families, strict=True):
            for variant, text in enumerate(texts, 1):
                rows.append(
                    dict(
                        id=f"expanded-{department}-{intent}-{variant}",
                        text=text,
                        department_id=department,
                        intent=intent,
                        scenario_group=f"{department}:{family}",
                        source_urls=departments[department]["official_source_urls"],
                        provenance="assistant_created_synthetic",
                        language="en",
                        review_status="needs_independent_human_review",
                    )
                )
    assert len({r["id"] for r in rows}) == len(rows)
    assert len({r["text"].casefold() for r in rows}) == len(rows)
    groups = defaultdict(set)
    for row in rows:
        groups[row["department_id"]].add(row["scenario_group"])
    assigned = {}
    rng = random.Random(42)
    for department in sorted(groups):
        family_list = sorted(groups[department])
        rng.shuffle(family_list)
        held_out = max(1, round(len(family_list) * 0.2))
        for i, family in enumerate(family_list):
            assigned[family] = "test" if i < held_out else "dev" if i < 2 * held_out else "train"
    for row in rows:
        row["split"] = assigned[row["scenario_group"]]
    (ROOT / "requests_synthetic.jsonl").write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    )
    with (ROOT / "requests_synthetic.csv").open("w") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows({**r, "source_urls": json.dumps(r["source_urls"])} for r in rows)
    print(
        json.dumps(
            {split: sum(r["split"] == split for r in rows) for split in ("train", "dev", "test")}
        )
    )


if __name__ == "__main__":
    build()
