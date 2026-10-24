from datetime import date

import httpx
import pytest

from bu_api.schemas import Source
from bu_api.search import BUSearch, extract_passages


def source(path, title="BU source"):
    return Source(title=title, url=f"https://www.bu.edu/{path}", retrieved_on=date(2026, 10, 24))


async def test_rank_and_cache_relevant_pages():
    calls = []

    def handler(request):
        calls.append(request.url.path)
        text = (
            "<main>Meal plans offer dining points. Kosher: $410.</main>"
            if request.url.path == "/dining"
            else "<main>Computer science courses.</main>"
        )
        return httpx.Response(200, text=text, headers={"content-type": "text/html"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        search = BUSearch(client, [source("dining", "Meal plans"), source("courses")])
        result = await search.search("meal plan dining points")
        assert len(result.results) == 1
        assert result.results[0].url.endswith("/dining")
        assert "$410" in result.results[0].excerpt
        assert result.results[0].fetched_at.utcoffset().total_seconds() == 0
        assert (await search.search("nothingmatcheszz")).results == []
        assert (await search.search("the and of")).results == []
        assert len(calls) == 2
        search.ttl = -1  # Force expiry without a real-time sleep.
        await search.search("meal")
        assert len(calls) == 4


async def test_partial_and_total_source_failure():
    def handler(request):
        if request.url.path == "/timeout":
            raise httpx.ReadTimeout("timeout", request=request)
        if request.url.path == "/missing":
            return httpx.Response(404)
        return httpx.Response(
            200,
            text="<main>Dining points are dollars.</main>",
            headers={"content-type": "text/html"},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        search = BUSearch(client, [source("ok"), source("timeout"), source("missing")])
        result = await search.search("dining points")
        assert len(result.results) == 1
        assert len(result.unavailable_sources) == 2
        unavailable = BUSearch(client, [source("timeout"), source("missing")])
        result = await unavailable.search("dining")
        assert result.results == [] and len(result.unavailable_sources) == 2


async def test_result_limit_and_domain_restricted_redirects():
    calls = []

    def handler(request):
        calls.append(str(request.url))
        if request.url.path == "/external":
            return httpx.Response(302, headers={"location": "https://example.com/stolen"})
        if request.url.path == "/internal":
            return httpx.Response(301, headers={"location": "/final"})
        return httpx.Response(
            200, text="<main>Meal plan dining points.</main>", headers={"content-type": "text/html"}
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        sources = [source(str(i)) for i in range(7)] + [source("external"), source("internal")]
        result = await BUSearch(client, sources).search("meal plan")
        assert len(result.results) == 5
        assert source("external").url in result.unavailable_sources
        assert "https://www.bu.edu/final" in calls
        assert not any("example.com" in url for url in calls)
        with pytest.raises(ValueError, match="official BU"):
            BUSearch(
                client,
                [
                    Source(
                        title="Bad",
                        url="https://bu.edu.evil.test/",
                        retrieved_on=date(2026, 10, 24),
                    )
                ],
            )


def test_readable_text_excludes_scripts_and_navigation():
    html = """<nav>IGNORE NAV</nav><main><h1>Dining</h1><table><tr>
        <td>Kosher</td><td>$410</td></tr></table><script>IGNORE SCRIPT</script></main>
        <footer>IGNORE FOOTER</footer>"""
    text = " ".join(extract_passages(html))
    assert "Kosher" in text and "$410" in text
    assert "IGNORE" not in text
