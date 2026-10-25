"""Deterministic matching, text normalization, and validated metadata-free images."""

import base64
import binascii
import hashlib
import io
import re
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError


def normalized(value):
    return " ".join(re.findall(r"\w+", value.casefold()))


def merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged


def clean_windows(windows):
    groups = {}
    for window in windows:
        key = (window.weekday, window.effective_from, window.effective_until)
        groups.setdefault(key, []).append((window.start, window.end))
    return (
        [
            windows[0].model_copy(
                update={
                    "weekday": key[0],
                    "effective_from": key[1],
                    "effective_until": key[2],
                    "start": start,
                    "end": end,
                }
            )
            for key, intervals in groups.items()
            for start, end in merge_intervals(intervals)
        ]
        if windows
        else []
    )


def intervals(profile, start_date, end_date):
    zone = ZoneInfo(profile.timezone)
    result = []
    # Include adjacent local dates for offsets across the international date line.
    day = start_date - timedelta(days=1)
    while day <= end_date + timedelta(days=1):
        for window in profile.availability:
            if day.weekday() != window.weekday:
                continue
            if window.effective_from and day < window.effective_from:
                continue
            if window.effective_until and day > window.effective_until:
                continue
            start = datetime.combine(day, time.fromisoformat(window.start), zone)
            end = datetime.combine(day, time.fromisoformat(window.end), zone)
            # Ignore non-existent local endpoints in a spring-forward gap. For ambiguous
            # fall-back endpoints, fold=0 consistently selects the first occurrence.
            if any(
                t.astimezone(UTC).astimezone(zone).replace(tzinfo=None) != t.replace(tzinfo=None)
                for t in (start, end)
            ):
                continue
            start, end = start.astimezone(UTC), end.astimezone(UTC)
            if end > start:
                result.append((start, end))
        day += timedelta(days=1)
    return merge_intervals(result)


def overlap(a, b, term, now, minimum=30):
    zone = ZoneInfo(term.timezone)
    first = max(now.astimezone(zone).date(), term.starts_on)
    last = min(first + timedelta(days=6), term.ends_on)
    if first > last:
        return []
    floor = max(now, datetime.combine(first, time.min, zone).astimezone(UTC))
    ceiling = datetime.combine(last + timedelta(days=1), time.min, zone).astimezone(UTC)
    shared = merge_intervals(
        [
            (max(s1, s2, floor), min(e1, e2, ceiling))
            for s1, e1 in intervals(a, first, last)
            for s2, e2 in intervals(b, first, last)
            if min(e1, e2, ceiling) > max(s1, s2, floor)
        ]
    )
    if not any((end - start).total_seconds() >= minimum * 60 for start, end in shared):
        return []
    return shared


def rank_match(a, b, windows, target=180):
    minutes = sum((end - start).total_seconds() / 60 for start, end in windows)
    components = [(0.5, min(minutes / target, 1))]
    common_goals = sorted(set(a.goals) & set(b.goals))
    if a.goals and b.goals:
        components.append((0.3, len(common_goals) / len(set(a.goals) | set(b.goals))))
    comparable = []
    for field in ("study_format", "meeting_mode"):
        x, y = getattr(a, field), getattr(b, field)
        if x and y:
            comparable.append(x == y or (field == "meeting_mode" and "either" in (x, y)))
    if comparable:
        components.append((0.2, sum(comparable) / len(comparable)))
    return round(100 * sum(w * v for w, v in components) / sum(w for w, _ in components), 4)


def sanitize_photo(data):
    try:
        prefix, encoded = data.split(",", 1)
        if prefix not in (
            "data:image/jpeg;base64",
            "data:image/png;base64",
            "data:image/webp;base64",
        ):
            raise ValueError("Unsupported image type")
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 2_000_000:
            raise ValueError("Photo must be smaller than 2 MB")
        with Image.open(io.BytesIO(raw)) as original:
            if original.format not in ("JPEG", "PNG", "WEBP"):
                raise ValueError("Unsupported image content")
            if original.width * original.height > 16_000_000:
                raise ValueError("Photo resolution is too large")
            original.load()
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((1200, 1200))
            # A fresh image preserves pixels while removing EXIF, GPS and other metadata.
            clean = Image.new("RGB", image.size)
            clean.paste(image)
            output = io.BytesIO()
            clean.save(output, format="JPEG", quality=82)
            content = output.getvalue()
        return "data:image/jpeg;base64," + base64.b64encode(content).decode(), hashlib.sha256(
            content
        ).hexdigest()
    except (
        ValueError,
        OSError,
        binascii.Error,
        UnidentifiedImageError,
        Image.DecompressionBombError,
    ):
        raise HTTPException(422, "Choose a valid JPEG, PNG, or WebP photo under 2 MB") from None
