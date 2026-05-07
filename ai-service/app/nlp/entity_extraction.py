from __future__ import annotations

import re


def extract_basic_entities(text: str | None, language: str | None = None) -> dict[str, object]:
    value = text or ""
    entities: dict[str, object] = {}
    if re.search(r"\b(demain|tomorrow|ghodwa|غدا|غدوة)\b", value, flags=re.IGNORECASE):
        entities["relative_date"] = "tomorrow"
    if re.search(r"\b(apres demain|after tomorrow|baad ghodwa|ba3d ghodwa|بعد غدوة|بعد غدا)\b", value, flags=re.IGNORECASE):
        entities["relative_date"] = "after_tomorrow"
    if re.search(r"\b(aujourd hui|today|اليوم)\b", value, flags=re.IGNORECASE):
        entities["relative_date"] = "today"
    time_range = re.search(r"\b(?:de|from)?\s*(\d{1,2})(?::(\d{2}))?\s*h?\s*(?:a|au|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*h?\b", value, flags=re.IGNORECASE)
    if time_range:
        entities["time_start"] = f"{int(time_range.group(1)):02d}:{int(time_range.group(2) or 0):02d}:00"
        entities["time_end"] = f"{int(time_range.group(3)):02d}:{int(time_range.group(4) or 0):02d}:00"
    duration = re.search(r"\b(\d{1,2})\s*h(?:eure|eures)?\b", value, flags=re.IGNORECASE)
    if duration and "time_start" not in entities:
        entities["duration_hours"] = int(duration.group(1))
    numbers = re.findall(r"\b\d+\b", value)
    if numbers:
        entities["numbers"] = [int(item) for item in numbers]
    if language:
        entities["language"] = language
    return entities
