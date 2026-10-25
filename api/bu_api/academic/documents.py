import base64
import hashlib
import io
import re

from pypdf import PdfReader


def read_upload(media_type: str, text: str | None, content_base64: str | None) -> tuple[str, str]:
    if text is not None:
        raw = text.encode()
        content = text
    else:
        try:
            raw = base64.b64decode(content_base64 or "", validate=True)
        except ValueError as exc:
            raise ValueError("content_base64 is invalid") from exc
        if len(raw) > 8_000_000:
            raise ValueError("Syllabus exceeds the 8 MB limit")
        try:
            reader = PdfReader(io.BytesIO(raw))
            content = "\n\f\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as exc:
            raise ValueError("PDF could not be read") from exc
    content = content.replace("\x00", "").strip()
    if not content:
        raise ValueError("Syllabus contains no extractable text")
    return content, hashlib.sha256(raw).hexdigest()


def chunk_pages(text: str, target_chars: int = 1200) -> list[tuple[int | None, str]]:
    chunks: list[tuple[int | None, str]] = []
    pages = text.split("\f")
    for page_number, page in enumerate(pages, 1):
        paragraphs = [row.strip() for row in re.split(r"\n\s*\n", page) if row.strip()]
        current = ""
        for paragraph in paragraphs:
            if current and len(current) + len(paragraph) > target_chars:
                chunks.append((page_number if len(pages) > 1 else None, current))
                current = paragraph
            else:
                current = f"{current}\n{paragraph}".strip()
        if current:
            chunks.append((page_number if len(pages) > 1 else None, current))
    return chunks
