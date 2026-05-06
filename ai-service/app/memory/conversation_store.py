from __future__ import annotations

from collections import defaultdict, deque


class ConversationStore:
    """Short-term v2 memory placeholder. Persistent tenant memory is planned for AI-04+."""

    def __init__(self, max_messages: int = 20) -> None:
        self.max_messages = max_messages
        self._items: dict[tuple[int | None, int], deque[dict]] = defaultdict(lambda: deque(maxlen=max_messages))

    def append(self, tenant_id: int | None, user_id: int, item: dict) -> None:
        self._items[(tenant_id, user_id)].append(item)

    def get(self, tenant_id: int | None, user_id: int) -> list[dict]:
        return list(self._items[(tenant_id, user_id)])
