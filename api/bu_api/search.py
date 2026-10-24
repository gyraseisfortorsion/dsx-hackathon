import asyncio
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from pydantic import Field

from .schemas import Citation, Schema, Source

STOP_WORDS = set(
    "a an and are at be bu can do for how i in is it me my of on or the to what "
    "when where which with does have much many please tell about".split()
)


class SearchResult(Citation):
    excerpt: str
    fetched_at: datetime


class SearchResponse(Schema):
    results: list[SearchResult] = Field(default_factory=list)
    unavailable_sources: list[str] = Field(default_factory=list)
    coverage: str = "Search covers only the curated official BU pages, not the entire BU website."


@dataclass
class Document:
    source: Source
    passages: list[str]
    fetched_at: datetime


def words(text: str) -> set[str]:
    return {
        word[:-1] if word.endswith("s") and len(word) > 4 else word
        for word in re.findall(r"[a-z0-9]+", text.lower())
        if word not in STOP_WORDS
    }


def is_bu_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    return (
        parsed.scheme == "https"
        and (host == "bu.edu" or host.endswith(".bu.edu"))
        and parsed.port in (None, 443)
        and not parsed.username
        and not parsed.password
    )


def extract_passages(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    for node in soup.select("script, style, nav, header, footer, noscript, form"):
        node.decompose()
    main = soup.select_one("main, article, #content") or soup.body or soup
    lines = [
        re.sub(r"\s+", " ", line).strip() for line in main.get_text("\n", strip=True).splitlines()
    ]
    # Keep neighboring table cells/labels together so amounts retain their meaning.
    text = "\n".join(line for line in lines if line)[:150_000]
    return [text[index : index + 1400] for index in range(0, len(text), 1000)]


class BUSearch:
    def __init__(self, client: httpx.AsyncClient, sources: list[Source], ttl: float = 900):
        if any(not is_bu_url(source.url) for source in sources):
            raise ValueError("Search sources must be official BU HTTPS URLs")
        self.client, self.sources, self.ttl = client, sources, ttl
        self.cache: dict[str, tuple[float, Document | None]] = {}
        self._refresh_lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(6)

    async def _fetch(self, source: Source) -> Document | None:
        async with self._semaphore:
            try:
                url = source.url
                for _ in range(4):
                    response = await self.client.get(url, follow_redirects=False)
                    if response.is_redirect:
                        url = urljoin(url, response.headers.get("location", ""))
                        if not is_bu_url(url):
                            return None
                        continue
                    response.raise_for_status()
                    if "html" not in response.headers.get("content-type", "text/html"):
                        return None
                    passages = extract_passages(response.text)
                    return Document(source, passages, datetime.now(UTC)) if passages else None
                return None
            except httpx.HTTPError:
                return None

    async def search(self, query: str) -> SearchResponse:
        query_words = words(query[:300])
        if not query_words:
            return SearchResponse()
        async with self._refresh_lock:
            missing = [
                source
                for source in self.sources
                if source.url not in self.cache
                or time.monotonic() - self.cache[source.url][0] >= self.ttl
            ]
            documents = await asyncio.gather(*(self._fetch(source) for source in missing))
            for source, document in zip(missing, documents, strict=True):
                self.cache[source.url] = (time.monotonic(), document)
        ranked = []
        unavailable = []
        for source in self.sources:
            document = self.cache[source.url][1]
            if document is None:
                unavailable.append(source.url)
                continue
            passages = [
                (len(query_words & words(passage)), passage) for passage in document.passages
            ]
            match_count, passage = max(passages, key=lambda item: item[0])
            title_matches = len(query_words & words(source.title))
            if match_count:
                ranked.append(
                    (
                        match_count * 3 + title_matches * 2,
                        SearchResult(
                            title=source.title,
                            url=source.url,
                            excerpt=passage,
                            fetched_at=document.fetched_at,
                        ),
                    )
                )
        ranked.sort(key=lambda item: (-item[0], item[1].url))
        return SearchResponse(
            results=[item for _, item in ranked[:5]], unavailable_sources=unavailable
        )
