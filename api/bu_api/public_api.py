"""Read-only BU API client with bounded caching and no frontend credentials."""

import asyncio
import logging
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TypeVar
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx
from pydantic import BaseModel, ValidationError

from .config import Settings
from .public_models import (
    BUBusArrivals,
    BUBusNotices,
    BUBusRoutes,
    BUBusVehicles,
    BUCampusRequest,
    BUDiningItemDetail,
    BUDiningLocations,
    BUDiningMenu,
)

logger = logging.getLogger(__name__)
PublicResult = TypeVar("PublicResult", bound=BaseModel)


class BUPublicError(Exception):
    def __init__(self, detail: str, status: int = 503, retry_after: int | None = None):
        self.detail, self.status, self.retry_after = detail, status, retry_after
        super().__init__(detail)


@dataclass
class CacheEntry:
    stored_at: float
    result: BaseModel


class BUPublicAPI:
    def __init__(self, client: httpx.AsyncClient, settings: Settings):
        self.client, self.settings = client, settings
        self.cache: OrderedDict[tuple, CacheEntry] = OrderedDict()
        self.lock = asyncio.Lock()
        self.requests: deque[float] = deque()
        self.blocked_until = 0.0

    def check_access(self):
        if not self.settings.bu_public_api_key:
            raise BUPublicError("BU public services are not configured on the server")
        expiry = self.settings.bu_public_api_expires_at
        if expiry is not None and datetime.now(UTC) >= expiry:
            raise BUPublicError("The BU hackathon API access window has ended")

    async def fetch(self, request: BUCampusRequest) -> BaseModel:
        specs = {
            "routes": ("transit/bus/routes", BUBusRoutes, 60, 300),
            "vehicles": ("transit/bus/vehicles", BUBusVehicles, 10, 30),
            "arrivals": (f"transit/bus/stops/{request.stop_id}/arrivals", BUBusArrivals, 10, 30),
            "notices": ("transit/bus/notices", BUBusNotices, 30, 180),
            "locations": ("dining/locations", BUDiningLocations, 3600, 3600),
            "menu": (f"dining/locations/{request.location}/menu", BUDiningMenu, 300, 1800),
            "item": (
                f"dining/locations/{request.location}/menu/items/"
                + quote(request.item_id or "", safe=""),
                BUDiningItemDetail,
                300,
                1800,
            ),
        }
        path, model, ttl, max_age = specs[request.resource]
        day = None
        if request.resource in {"menu", "item"}:
            day = request.day or datetime.now(ZoneInfo("America/New_York")).date()
        return await self.get(path, model, day=day, ttl=ttl, max_age=max_age)

    async def get(
        self,
        path: str,
        model: type[PublicResult],
        *,
        day=None,
        ttl: float = 60,
        max_age: float = 300,
    ) -> PublicResult:
        self.check_access()
        params = {"day": day.isoformat()} if day is not None else {}
        cache_key = (path, tuple(params.items()))
        # Coalesce misses and serialize upstream calls to protect the limited hackathon key.
        async with self.lock:
            self.check_access()
            now = time.monotonic()
            entry = self.cache.get(cache_key)
            if entry and now - entry.stored_at < ttl:
                self.cache.move_to_end(cache_key)
                return entry.result.model_copy(deep=True)
            while self.requests and now - self.requests[0] >= 60:
                self.requests.popleft()
            if now < self.blocked_until or len(self.requests) >= 90:
                return self._fallback(entry, now, max_age, retry_after=60)
            self.requests.append(now)
            try:
                response = await self.client.get(
                    path,
                    params=params,
                    headers={
                        "X-API-Key": self.settings.bu_public_api_key.get_secret_value(),
                    },
                    follow_redirects=False,
                )
                if response.status_code in {401, 403}:
                    self.blocked_until = time.monotonic() + 60
                    raise BUPublicError("BU API access was rejected; check server credentials")
                if response.status_code in {404, 422}:
                    raise BUPublicError(
                        "BU resource not found"
                        if response.status_code == 404
                        else "BU does not support this request or dining date",
                        response.status_code,
                    )
                if response.status_code == 429:
                    self.blocked_until = time.monotonic() + 60
                    return self._fallback(entry, now, max_age, retry_after=60)
                response.raise_for_status()
                result = model.model_validate(response.json())
            except (httpx.HTTPError, ValueError, ValidationError) as error:
                # Never log request headers, raw provider bodies, or credentials.
                logger.warning("BU public service unavailable: error_type=%s", type(error).__name__)
                return self._fallback(entry, time.monotonic(), max_age)
            # A rejected/missing resource must never revive an unrelated stale response.
            self.cache[cache_key] = CacheEntry(time.monotonic(), result)
            self.cache.move_to_end(cache_key)
            while len(self.cache) > 256:
                self.cache.popitem(last=False)
            return result.model_copy(deep=True)

    @staticmethod
    def _fallback(entry, now, max_age, retry_after=None):
        # Data without freshness metadata (the location directory) is not served stale.
        if entry and now - entry.stored_at <= max_age and hasattr(entry.result, "stale"):
            return entry.result.model_copy(update={"stale": True}, deep=True)
        raise BUPublicError(
            "BU public services are temporarily unavailable", retry_after=retry_after
        )
