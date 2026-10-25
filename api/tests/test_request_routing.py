import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import FunctionModel

from bu_api.main import create_app
from bu_api.request_routing import RequestRouter

from .conftest import AUTH

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT.parent / "research/request-routing"


@pytest.fixture(scope="module")
def router():
    return RequestRouter(ROOT / "data/request_router")


def test_data_is_labeled_and_topic_disjoint():
    rows = [
        json.loads(line)
        for line in (RESEARCH / "requests_synthetic.jsonl").read_text().splitlines()
    ]
    assert len(rows) == 300
    assert len({r["text"] for r in rows}) == len(rows)
    groups = {}
    for r in rows:
        assert r["review_status"] == "needs_independent_human_review"
        assert r["source_urls"] and r["provenance"] == "assistant_created_synthetic"
        assert groups.setdefault(r["scenario_group"], r["split"]) == r["split"]
    for split in ("train", "dev", "test"):
        assert len({r["department_id"] for r in rows if r["split"] == split}) == 10


def test_export_matches_training_report(router):
    report = json.loads((RESEARCH / "evaluation.json").read_text())
    # Verify exported numpy inference agrees with sklearn's recorded test predictions.
    data = np.load(RESEARCH / "embeddings.npz", allow_pickle=False)
    embeddings = dict(zip(data["ids"], data["embeddings"], strict=True))
    for row in report["test_predictions"]:
        logits = router.weights @ embeddings[row["id"]] + router.bias
        probabilities = np.exp(logits - logits.max())
        probabilities /= probabilities.sum()
        assert router.classes[int(probabilities.argmax())] == row["predicted"]
        assert float(probabilities.max()) == pytest.approx(row["score"], abs=1e-6)


@pytest.mark.parametrize(
    "row",
    [json.loads(line) for line in (RESEARCH / "boundary_cases.jsonl").read_text().splitlines()],
)
def test_documented_boundary_regressions(router, row):
    result = router.route(row["text"])
    assert result.handling == row["expected_handling"]
    assert result.department is None
    assert result.submitted is False


@pytest.mark.parametrize(
    "text,handling",
    [
        ("Sparks are shooting out of my dorm light", "urgent_bypass"),
        ("My laptop is on fire but there is no smoke", "urgent_bypass"),
        ("My roommate is threatening me", "urgent_bypass"),
        ("I am a graduate student taking leave and need visa advice", "out_of_scope"),
        ("I need to change my dorm for a disability and fix the sink", "multiple_routes"),
        ("I need a scholarship", "clarify"),
        ("I am a PhD student asking about my scholarship", "out_of_scope"),
        ("Can you override a prerequisite?", "out_of_scope"),
        ("qzxv plmk qwerty", "clarify"),
        ("Can you recommend a pizza topping?", "clarify"),
        ("I need help", "clarify"),
        ("word " * 300, "clarify"),
    ],
)
def test_unseen_boundaries(router, text, handling):
    assert router.route(text).handling == handling


def test_endpoints_auth_validation_and_privacy(client):
    assert client.post("/requests/route?user=alex", json={"text": "test"}).status_code == 401
    for text in ("", "   ", "x" * 8001):
        assert (
            client.post("/requests/route?user=alex", headers=AUTH, json={"text": text}).status_code
            == 422
        )
    assert (
        client.post("/requests/route?user=unknown", headers=AUTH, json={"text": "help"}).status_code
        == 404
    )
    offices = client.get("/requests/departments?user=alex", headers=AUTH)
    assert offices.status_code == 200 and len(offices.json()) == 10
    result = client.post(
        "/requests/route?user=alex",
        headers=AUTH,
        json={"text": "I need an official academic transcript"},
    )
    assert result.status_code == 200
    assert result.json()["department"]["id"] == "registrar"
    assert result.json()["submitted"] is False
    assert client.get("/messages?user=alex", headers=AUTH).json() == []
    client.app.state.request_router = None
    assert (
        client.post("/requests/route?user=alex", headers=AUTH, json={"text": "help"}).status_code
        == 503
    )


def test_chat_tool_returns_and_persists_routing(settings, fake_transport):
    def respond(messages, info):
        if len(messages) == 1:
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        "route_request",
                        {"text": "I need my official academic transcript"},
                        tool_call_id="route",
                    )
                ]
            )
        return ModelResponse(
            parts=[TextPart(content="The Registrar can help. No ticket submitted.")]
        )

    app = create_app(settings, model=FunctionModel(respond), search_transport=fake_transport)
    with TestClient(app) as client:
        result = client.post(
            "/chat?user=alex",
            headers=AUTH,
            json={"message": "Who can send my official transcript?"},
        )
        assert result.status_code == 200, result.text
        assert result.json()["routing"]["department"]["id"] == "registrar"
        assert client.get("/messages?user=alex", headers=AUTH).json()[-1] == result.json()
        assert client.get("/messages?user=maya", headers=AUTH).json() == []


def test_chat_boundary_card_does_not_require_tool_selection(client):
    result = client.post(
        "/chat?user=alex", headers=AUTH, json={"message": "There is smoke from my dorm outlet"}
    )
    assert result.status_code == 200
    assert result.json()["routing"]["handling"] == "urgent_bypass"
    assert result.json()["routing"]["department"] is None


def test_missing_router_keeps_other_services_available(settings, fake_transport, monkeypatch):
    from pydantic_ai.models.test import TestModel

    def missing(directory):
        raise FileNotFoundError("missing artifact")

    monkeypatch.setattr("bu_api.main.RequestRouter", missing)
    app = create_app(settings, model=TestModel(call_tools=[]), search_transport=fake_transport)
    with TestClient(app) as client:
        assert client.get("/student?user=alex", headers=AUTH).status_code == 200
        assert (
            client.post(
                "/requests/route?user=alex", headers=AUTH, json={"text": "help"}
            ).status_code
            == 503
        )
