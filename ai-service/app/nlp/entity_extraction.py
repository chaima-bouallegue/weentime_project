from __future__ import annotations

import re


def extract_basic_entities(text: str | None, language: str | None = None) -> dict[str, object]:
    value = text or ""
    entities: dict[str, object] = {}
    if re.search(r"\b(demain|tomorrow|غدا)\b", value, flags=re.IGNORECASE):
        entities["relative_date"] = "tomorrow"
    if re.search(r"\b(aujourd hui|today|اليوم)\b", value, flags=re.IGNORECASE):
        entities["relative_date"] = "today"
    numbers = re.findall(r"\b\d+\b", value)
    if numbers:
        entities["numbers"] = [int(item) for item in numbers]
    if language:
        entities["language"] = language
    return entities
