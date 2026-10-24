import asyncio
import json
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, ToolCallPart, UserPromptPart
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.test import TestModel

from bu_api.agent import ChatService
from bu_api.history import HistoryStore
from bu_api.main import create_app
from bu_api.repository import Repository
from bu_api.search import BUSearch

from .conftest import AUTH


def prompts(messages):
    return [
        part.content
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, UserPromptPart)
    ]


def test_context_isolation_and_restart_with_another_model(settings, fake_transport):
    captured = []

    def respond(messages, info):
        captured.append((prompts(messages), info.instructions))
        return ModelResponse(parts=[TextPart(content="Your next class is Monday.")])

    first = create_app(settings, model=FunctionModel(respond), search_transport=fake_transport)
    with TestClient(first) as client:
        response = client.post(
            "/chat?user=alex", headers=AUTH, json={"message": "  When is my next class?  "}
        )
        assert response.status_code == 200, response.text
        assistant = response.json()
        assert assistant["role"] == "assistant"
        assert datetime.fromisoformat(assistant["created_at"]).utcoffset().total_seconds() == 0
        assert captured[-1][0] == ["When is my next class?"]
        assert "Alex Morgan" in captured[-1][1] and "Maya Patel" not in captured[-1][1]
        assert all(
            key in captured[-1][1]
            for key in ("meal_plan", "calendar", "attendance", "grades", "recommended_events")
        )
        history = client.get("/messages?user=alex", headers=AUTH).json()
        assert [m["role"] for m in history] == ["user", "assistant"]
        assert history[-1] == assistant
        assert client.get("/messages?user=maya", headers=AUTH).json() == []
    # A fresh app and model read the saved provider-neutral Pydantic AI history.
    second = create_app(
        settings,
        model=FunctionModel(respond, model_name="another-provider"),
        search_transport=fake_transport,
    )
    with TestClient(second) as client:
        response = client.post(
            "/chat?user=alex", headers=AUTH, json={"message": "And my meal balance?"}
        )
        assert response.status_code == 200
        assert captured[-1][0] == ["When is my next class?", "And my meal balance?"]
        assert len(client.get("/messages?user=alex", headers=AUTH).json()) == 4
        client.post("/chat?user=maya", headers=AUTH, json={"message": "My classes?"})
        assert captured[-1][0] == ["My classes?"]
        assert "Maya Patel" in captured[-1][1] and "Alex Morgan" not in captured[-1][1]
    saved = json.loads((settings.history_path() / "alex.json").read_text())
    assert saved["version"] == 1 and saved["user"] == "alex"
    assert len(saved["agent_messages"]) >= 4


def test_agent_search_tool_and_citations_survive_restart(settings, fake_transport):
    url = "https://www.bu.edu/dining/plans-points/"

    def respond(messages, info):
        if len(messages) == 1:
            return ModelResponse(
                parts=[ToolCallPart("search_bu", {"query": "meal plan"}, tool_call_id="bu-search")]
            )
        return ModelResponse(parts=[TextPart(content=f"See [BU meal plans]({url}).")])

    app = create_app(settings, model=FunctionModel(respond), search_transport=fake_transport)
    with TestClient(app) as client:
        response = client.post(
            "/chat?user=alex", headers=AUTH, json={"message": "How do meal plans work?"}
        )
        assert response.status_code == 200, response.text
        assert any(source["url"] == url for source in response.json()["sources"])
        assert client.get("/messages?user=alex", headers=AUTH).json()[-1] == response.json()
    history = HistoryStore(settings.history_path()).load("alex")
    assert any(
        part.part_kind == "tool-return"
        for message in history.agent_messages
        for part in message.parts
    )


@pytest.mark.parametrize("batch_size", [1, 4])
def test_search_budget_finishes_answer_and_resets_each_turn(
    settings, fake_transport, monkeypatch, batch_size
):
    searches = []
    original_search = BUSearch.search

    async def count_search(self, query):
        searches.append(query)
        return await original_search(self, query)

    monkeypatch.setattr(BUSearch, "search", count_search)

    def respond(messages, info):
        # Keep requesting search until the agent removes it from the available tools.
        if info.function_tools:
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        "search_bu",
                        {"query": "meal plan"},
                        tool_call_id=f"search-{len(messages)}-{index}",
                    )
                    for index in range(batch_size)
                ]
            )
        return ModelResponse(parts=[TextPart(content="Here are the meal plan options.")])

    with TestClient(
        create_app(settings, model=FunctionModel(respond), search_transport=fake_transport)
    ) as client:
        for turn in range(2):
            response = client.post(
                "/chat?user=alex", headers=AUTH, json={"message": "Meal plan options?"}
            )
            assert response.status_code == 200, response.text
            assert response.json()["content"] == "Here are the meal plan options."
            assert len(searches) == (turn + 1) * 3
        assert len(client.get("/messages?user=alex", headers=AUTH).json()) == 4


@pytest.mark.parametrize("failure,expected", [("provider", 502), ("timeout", 504)])
def test_failed_turn_does_not_change_history(settings, fake_transport, failure, expected, caplog):
    async def respond(messages, info):
        if failure == "timeout":
            await asyncio.sleep(0.1)
        raise UnexpectedModelBehavior("simulated provider failure")

    with TestClient(
        create_app(
            settings,
            model=TestModel(call_tools=[], custom_output_text="Saved"),
            search_transport=fake_transport,
        )
    ) as client:
        assert (
            client.post("/chat?user=alex", headers=AUTH, json={"message": "First"}).status_code
            == 200
        )
    before = (settings.history_path() / "alex.json").read_bytes()
    if failure == "timeout":
        settings.chat_timeout_seconds = 0.01
    with TestClient(
        create_app(settings, model=FunctionModel(respond), search_transport=fake_transport)
    ) as client:
        response = client.post("/chat?user=alex", headers=AUTH, json={"message": "Fails"})
        assert response.status_code == expected, response.text
        assert len(client.get("/messages?user=alex", headers=AUTH).json()) == 2
    assert (settings.history_path() / "alex.json").read_bytes() == before
    if failure == "provider":
        assert "error_type=UnexpectedModelBehavior" in caplog.text
        assert "simulated provider failure" not in caplog.text


async def test_same_user_serializes_but_other_users_can_run(settings, fake_transport):
    import httpx

    started = asyncio.Event()
    release = asyncio.Event()
    captured = []

    async def respond(messages, info):
        user_prompts = prompts(messages)
        captured.append(user_prompts)
        if user_prompts[-1] == "First":
            started.set()
            await release.wait()
        return ModelResponse(parts=[TextPart(content="Reply to " + user_prompts[-1])])

    repo = Repository(settings.data_dir)
    history = HistoryStore(settings.history_path())
    async with httpx.AsyncClient(transport=fake_transport) as http:
        service = ChatService(
            settings, repo, BUSearch(http, repo.sources), history, FunctionModel(respond)
        )
        first = asyncio.create_task(service.send(repo.students["alex"], "First"))
        await asyncio.wait_for(started.wait(), timeout=2)
        second = asyncio.create_task(service.send(repo.students["alex"], "Second"))
        other = await service.send(repo.students["maya"], "Other student")
        assert other.content == "Reply to Other student"
        assert not second.done()
        release.set()
        await asyncio.gather(first, second)
    assert ["First", "Second"] in captured
    assert [m.content for m in history.load("alex").messages if m.role == "user"] == [
        "First",
        "Second",
    ]
    assert len(history.load("maya").messages) == 2
    assert not list(settings.history_path().glob("*.tmp"))


def test_invalid_history_is_reported_without_overwriting(settings, fake_transport):
    settings.history_path().mkdir()
    path = settings.history_path() / "alex.json"
    path.write_text("corrupt history")
    with TestClient(
        create_app(settings, model=TestModel(call_tools=[]), search_transport=fake_transport)
    ) as client:
        assert client.get("/messages?user=alex", headers=AUTH).status_code == 500
        assert (
            client.post("/chat?user=alex", headers=AUTH, json={"message": "Hi"}).status_code == 500
        )
    assert path.read_text() == "corrupt history"


def test_atomic_save_keeps_previous_history_on_failure(settings, monkeypatch):
    from bu_api import history as history_module

    store = HistoryStore(settings.history_path())
    conversation = store.load("alex")
    store.save("alex", conversation)
    path = settings.history_path() / "alex.json"
    before = path.read_bytes()

    def fail_replace(*args):
        raise OSError("simulated full disk")

    monkeypatch.setattr(history_module.os, "replace", fail_replace)
    with pytest.raises(OSError):
        store.save("alex", conversation)
    assert path.read_bytes() == before
    assert not list(settings.history_path().glob("*.tmp"))
    with pytest.raises(ValueError):
        store.load("../other")


def test_model_selected_from_configuration_without_route_changes(settings, fake_transport):
    from bu_api.agent import build_agent

    assert build_agent("google:gemini-3.8-flash").model == "google:gemini-3.8-flash"
    assert build_agent("openai:another-model").model == "openai:another-model"
