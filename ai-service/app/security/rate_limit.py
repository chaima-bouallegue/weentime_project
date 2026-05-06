from __future__ import annotations

from collections import defaultdict
from time import monotonic


class InMemoryRateLimiter:
    def __init__(self, max_calls: int = 30, window_seconds: float = 60.0) -> None:
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._calls: dict[str, list[float]] = defaultdict(list)

    def allow(self, key: str) -> bool:
        now = monotonic()
        calls = [item for item in self._calls[key] if now - item < self.window_seconds]
        calls.append(now)
        self._calls[key] = calls
        return len(calls) <= self.max_calls
