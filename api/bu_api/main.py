import asyncio
import logging
import os
import secrets
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic_ai.exceptions import AgentRunError, UsageLimitExceeded, UserError
from pydantic_ai.models import Model

from .agent import ChatService
from .blob_history import BlobHistoryStore
from .config import API_ROOT, Settings
from .docs import SWAGGER_HTML
from .event_routes import install_event_routes
from .events import EventService
from .history import HistoryConflict, HistoryStore, HistoryUnavailable
from .preferences import BlobPreferenceStore, PreferenceStore
from .repository import Repository
from .schemas import (
    AttendanceResponse,
    CalendarResponse,
    ChatMessage,
    ChatRequest,
    CoursesResponse,
    GradesResponse,
    MealPlanResponse,
    StudentProfile,
    StudentRecord,
)
from .search import BUSearch

logger = logging.getLogger(__name__)


def create_app(
    settings: Settings | None = None,
    *,
    model: Model | None = None,
    search_transport: httpx.AsyncBaseTransport | None = None,
    history_transport: httpx.BaseTransport | None = None,
) -> FastAPI:
    if settings is None:
        # Provider SDKs read environment variables; dotenv also supports providers beyond Google.
        load_dotenv(API_ROOT / ".env.local", override=False)
        load_dotenv(API_ROOT / ".env", override=False)
        settings = Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if not settings.api_password.get_secret_value().strip():
            raise RuntimeError("API_PASSWORD must be set before starting the API")
        if os.getenv("VERCEL") and settings.history_backend != "blob":
            raise RuntimeError("Vercel deployments require HISTORY_BACKEND=blob")
        repository = Repository(settings.data_dir)
        with httpx.Client(timeout=15, transport=history_transport) as history_client:
            async with httpx.AsyncClient(
                timeout=8,
                transport=search_transport,
                headers={"User-Agent": "BUStudentPrototype/0.1 (public BU reference pages)"},
            ) as client:
                search = BUSearch(client, repository.sources)
                history = (
                    BlobHistoryStore(
                        settings.blob_store_id,
                        history_client,
                        settings.blob_read_write_token.get_secret_value()
                        if settings.blob_read_write_token
                        else None,
                    )
                    if settings.history_backend == "blob"
                    else HistoryStore(settings.history_path())
                )
                app.state.repository, app.state.history = repository, history
                preferences = (
                    BlobPreferenceStore(settings.blob_store_id, history_client,
                        settings.blob_read_write_token.get_secret_value()
                        if settings.blob_read_write_token else None)
                    if settings.history_backend == "blob"
                    else PreferenceStore(settings.history_path().parent / "preferences")
                )
                events = EventService(settings.data_dir / "event_artifacts.json")
                app.state.preferences, app.state.events = preferences, events
                app.state.chat = ChatService(
                    settings, repository, search, history, model, events, preferences
                )
                yield

    bearer = HTTPBearer(auto_error=False)

    async def authenticate(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> None:
        expected = settings.api_password.get_secret_value().encode()
        provided = credentials.credentials.encode() if credentials else b""
        if not credentials or not secrets.compare_digest(expected, provided):
            raise HTTPException(
                401, "Invalid bearer password", headers={"WWW-Authenticate": "Bearer"}
            )

    app = FastAPI(
        title="BU Student Prototype",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_methods=["GET", "POST", "PUT"],
            allow_headers=["Authorization", "Content-Type"],
        )

    async def selected_student(
        user: Annotated[str, Query(min_length=1, max_length=32, pattern=r"^[a-z][a-z0-9_-]*$")],
        _auth: Annotated[None, Depends(authenticate)],
    ) -> StudentRecord:
        student = app.state.repository.students.get(user)
        if student is None:
            raise HTTPException(404, "Unknown user; use alex, maya, jordan, sam, or taylor")
        return student

    Student = Annotated[StudentRecord, Depends(selected_student)]

    @app.exception_handler(HistoryConflict)
    async def state_conflict(request, exc):
        return JSONResponse(status_code=409, content={"detail": "State changed; reload and retry"})

    @app.exception_handler(HistoryUnavailable)
    async def state_unavailable(request, exc):
        return JSONResponse(status_code=503, content={"detail": "Storage temporarily unavailable"})

    install_event_routes(app, selected_student)

    @app.get("/student", response_model=StudentProfile)
    async def student_info(student: Student):
        return student.profile

    @app.get("/meal-plan", response_model=MealPlanResponse)
    async def meal_plan(student: Student):
        return app.state.repository.meal_plan(student)

    @app.get("/courses", response_model=CoursesResponse)
    async def courses(student: Student):
        return app.state.repository.course_response(student)

    @app.get("/calendar", response_model=CalendarResponse)
    async def calendar(student: Student):
        return app.state.repository.calendar(student)

    @app.get("/attendance", response_model=AttendanceResponse)
    async def attendance(student: Student):
        return app.state.repository.attendance(student)

    @app.get("/grades", response_model=GradesResponse)
    async def grades(student: Student):
        return app.state.repository.grades(student)

    @app.get("/messages", response_model=list[ChatMessage])
    async def messages(student: Student):
        try:
            conversation = await asyncio.to_thread(app.state.history.load, student.profile.user)
            return conversation.messages
        except (OSError, ValueError, KeyError):
            raise HTTPException(500, "Stored chat history is unavailable") from None
        except HistoryUnavailable:
            raise HTTPException(503, "Chat history storage is temporarily unavailable") from None

    @app.post("/chat", response_model=ChatMessage)
    async def chat(body: ChatRequest, student: Student):
        try:
            return await app.state.chat.send(student, body.message)
        except HistoryConflict:
            raise HTTPException(
                409,
                "Another chat turn completed first; retry your message. This turn was not saved",
            ) from None
        except HistoryUnavailable:
            raise HTTPException(503, "Chat history storage is temporarily unavailable") from None
        except TimeoutError:
            raise HTTPException(504, "The model timed out; no messages were saved") from None
        except UserError:
            raise HTTPException(
                503, "Chat model is not configured; check LLM_MODEL and provider credentials"
            ) from None
        except (AgentRunError, httpx.HTTPError) as error:
            # Provider exceptions can contain prompts or credentials; log only safe metadata.
            logger.warning(
                "Chat agent failed: error_type=%s model=%s status_code=%s",
                type(error).__name__,
                settings.llm_model,
                getattr(error, "status_code", None),
            )
            if isinstance(error, UsageLimitExceeded):
                logger.warning("Chat agent usage limit: %s", error)
            raise HTTPException(
                502, "The model could not complete this turn; no messages were saved"
            ) from None
        except (OSError, ValueError, KeyError):
            logger.warning("Chat history or response could not be processed", exc_info=False)
            raise HTTPException(
                500, "Chat could not be saved or history could not be read"
            ) from None

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi_schema(student: Student):
        return JSONResponse(app.openapi(), headers={"Cache-Control": "no-store"})

    @app.get("/docs", include_in_schema=False, response_class=HTMLResponse)
    async def swagger_docs():
        return HTMLResponse(SWAGGER_HTML, headers={"Cache-Control": "no-store"})

    return app


app = create_app()
