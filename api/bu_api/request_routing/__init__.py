"Local encoder + exported linear head. No pickle, training or downloads at runtime."

import json
import re
from pathlib import Path
from typing import Annotated, Literal

import numpy as np
from model2vec import StaticModel
from pydantic import BaseModel, Field, StringConstraints


class RoutingRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]


class Department(BaseModel):
    id: str
    name: str
    handles: str
    boundaries: str
    official_source_urls: list[str]


class Candidate(BaseModel):
    department: Department
    score: float | None = None


class RoutingResult(BaseModel):
    handling: Literal["route", "clarify", "multiple_routes", "out_of_scope", "urgent_bypass"]
    department: Department | None = None
    candidates: list[Candidate] = Field(default_factory=list)
    message: str
    model_version: str
    source: Literal["classifier", "boundary_rule"]
    synthetic_only: Literal[True] = True
    submitted: Literal[False] = False


def boundary(text: str):
    "Conservative prototype guards; these are deliberately independent of model scores."
    t = text.casefold().replace("’", "'")

    def has(pattern):
        return re.search(pattern, t) is not None

    # Remove negation of each hazard separately; "no smoke but sparks" is still urgent.
    hazard_text = re.sub(
        r"\b(?:no|not an?|without) (?:immediate danger|emergency|fire|smoke)\b", "", t
    )
    if re.search(
        r"\b(smoke|fire|sparks|gas leak|smell (?:of )?gas|immediate danger|emergency|"
        r"threatening me|attacking me)\b",
        hazard_text,
    ):
        return (
            "urgent_bypass",
            [],
            (
                "For an immediate hazard, use emergency services and BU's official "
                "emergency guidance now. Do not wait for an administrative request."
            ),
        )
    leave = has(r"\b(leave|withdraw|withdrawal|semester (?:off|away))\b")
    immigration = has(r"\b(visa|immigration|i-20|sevis|f-1|isso)\b")
    disability = has(r"\b(disability|accommodation|wheelchair)\b")
    repair = has(r"\b(broken|repair|fix|jammed|damaged|maintenance)\b")
    graduate = has(r"\b(graduate|grad|master'?s|phd|doctoral)\b") and not has(r"undergrad")
    if graduate and has(r"\b(aid|scholarship|grant|leave|withdrawal)\b"):
        return (
            "out_of_scope",
            [],
            "Which graduate school or program are you in? Aid and leave procedures depend "
            "on the program. For immigration implications, also consult ISSO.",
        )
    if leave and immigration:
        return (
            "multiple_routes",
            ["university_service_center", "isso"],
            (
                "Leave procedures and immigration advising need separate guidance. "
                "Confirm your school and undergraduate/graduate status; USC guidance "
                "here covers undergraduates."
            ),
        )
    if disability and repair:
        return (
            "multiple_routes",
            ["disability_access", "residential_maintenance"],
            (
                "Accommodation review and physical repairs are separate needs. Use DAS "
                "for accommodation review and official residence maintenance intake "
                "for repairs."
            ),
        )
    if has(
        "\\b(prerequisite|override|medical "
        "treatment|diagnos\\w*|prescription|work "
        "hours|earned.*hours|payroll|paycheck)\\b"
    ):
        return (
            "out_of_scope",
            [],
            (
                "This request is outside the ten supported queues. Please identify "
                "your school/program or relevant service so the appropriate advisor, "
                "clinical service, or employment office can help."
            ),
        )
    if (
        has(r"\bscholarship\b")
        and has(r"\b(missing|not showing|gone)\b")
        and not has(r"\b(award|bill|undergrad|account)\b")
    ):
        return (
            "clarify",
            ["financial_assistance", "student_financials"],
            (
                "Are you an undergraduate or graduate student? Is the scholarship "
                "missing from your aid award, or only from the bill after approval?"
            ),
        )
    if has(r"\b(register|registration)\b") and not has(
        "\\b(hold|balance|login|log in|sign in|semester|record|prerequisite|override|password)\\b"
    ):
        return (
            "clarify",
            ["registrar", "student_financials", "it_help"],
            (
                "What exact registration error do you see: authentication failure, "
                "financial hold, prerequisite restriction, or no active semester?"
            ),
        )
    if (
        has(r"\b(room|housing)\b")
        and has(r"\b(change|move)\b")
        and not has(
            "\\b(disability|accommodation|preference|ordinary|swap|roommate|con"
            "venience|voluntary|personal|regular)\\b"
        )
    ):
        return (
            "clarify",
            ["housing", "disability_access"],
            "Is this an ordinary room preference change or a disability accommodation request?",
        )
    if has(r"meal plan.*(?:page|portal).*(?:not work|doesn't work|broken)") and not has(
        r"\b(login|sign in|authentication|balance)\b"
    ):
        return (
            "clarify",
            ["terrier_card", "it_help"],
            "Can you sign in? Is this a technical error or a meal plan/account question?",
        )
    return None


class RequestRouter:
    def __init__(self, directory: Path):
        self.manifest = json.loads((directory / "classifier.json").read_text())
        self.version = self.manifest["version"]
        self.departments = {
            d["id"]: Department.model_validate(d)
            for d in json.loads((directory / "departments.json").read_text())
        }
        self.classes = self.manifest["classes"]
        self.weights = np.asarray(self.manifest["weights"], dtype=np.float64)
        self.bias = np.asarray(self.manifest["bias"], dtype=np.float64)
        self.references = np.load(directory / "train_embeddings.npy", allow_pickle=False)
        self.encoder = StaticModel.from_pretrained(directory / "encoder", normalize=True)
        if self.weights.shape != (len(self.classes), self.references.shape[1]):
            raise ValueError("Incompatible request router artifacts")

    def route(self, text: str) -> RoutingResult:
        text = RoutingRequest(text=text).text
        guard = boundary(text)
        if guard:
            handling, ids, message = guard
            return RoutingResult(
                handling=handling,
                message=message,
                model_version=self.version,
                source="boundary_rule",
                candidates=[Candidate(department=self.departments[i]) for i in ids],
            )
        # Long messages can hide independent requests beyond the encoder's token budget.
        if len(text.split()) > 250:
            return RoutingResult(
                handling="clarify",
                message=(
                    "Please describe one request in a few sentences so I can identify the "
                    "responsible office."
                ),
                model_version=self.version,
                source="boundary_rule",
            )
        embedding = self.encoder.encode([text], max_length=self.manifest["max_length"])[0]
        logits = self.weights @ embedding + self.bias
        probabilities = np.exp(logits - logits.max())
        probabilities /= probabilities.sum()
        ranking = np.argsort(probabilities)[::-1]
        best, second = ranking[:2]
        thresholds = self.manifest["thresholds"]
        similarity = float((self.references @ embedding).max())
        accepted = (
            probabilities[best] >= thresholds["probability"]
            and probabilities[best] - probabilities[second] >= thresholds["margin"]
            and similarity >= thresholds["similarity"]
        )
        candidates = [
            Candidate(department=self.departments[self.classes[i]], score=float(probabilities[i]))
            for i in ranking[:3]
        ]
        department = candidates[0].department if accepted else None
        if department and department.id in {"financial_assistance", "university_service_center"}:
            if not re.search(r"\bundergrad(?:uate)?\b", text, re.IGNORECASE):
                return RoutingResult(
                    handling="clarify",
                    candidates=candidates,
                    model_version=self.version,
                    source="boundary_rule",
                    message="Are you an undergraduate or graduate student, and in which "
                    "school/program? Aid and leave guidance depends on that context.",
                )
        return RoutingResult(
            handling="route" if accepted else "clarify",
            department=department,
            candidates=candidates,
            model_version=self.version,
            source="classifier",
            message=(
                (
                    f"Suggested office: {department.name}. "
                    "Follow its official intake guidance. No request submitted."
                )
                if accepted
                else (
                    "Please share what happened, any exact error, and your "
                    "undergraduate/graduate status. I need more detail to suggest an "
                    "office."
                )
            ),
        )
