from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from threading import RLock
from typing import Any


@dataclass
class MemoryMessage:
    role: str
    content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class PendingRequest:
    intent: str
    action: str
    entities: dict[str, Any] = field(default_factory=dict)
    missing_fields: list[str] = field(default_factory=list)
    prompt: str | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class PendingConfirmation:
    intent: str
    action: str
    entities: dict[str, Any] = field(default_factory=dict)
    prompt: str | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class WorkflowStepState:
    key: str
    label: str
    status: str = "pending"
    text: str = ""
    error: str | None = None
    data: dict[str, Any] = field(default_factory=dict)
    api: dict[str, Any] = field(default_factory=dict)


@dataclass
class WorkflowState:
    workflow_id: str
    workflow_name: str
    intent: str
    action: str | None = None
    status: str = "running"
    entities: dict[str, Any] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)
    steps: list[WorkflowStepState] = field(default_factory=list)
    pending_step: str | None = None
    completed_steps: list[str] = field(default_factory=list)
    error: str | None = None
    can_retry: bool = False
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class PlannedTaskState:
    task_id: str
    task_key: str
    intent: str
    role: str
    plan: list[dict[str, Any]] = field(default_factory=list)
    status: str = "running"
    current_step: str | None = None
    errors: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class SessionState:
    user_id: int
    role: str = "EMPLOYEE"
    last_intent: str | None = None
    last_action: str | None = None
    last_action_key: str | None = None
    last_action_at: datetime | None = None
    last_entities: dict[str, Any] = field(default_factory=dict)
    pending_request: PendingRequest | None = None
    pending_confirmation: PendingConfirmation | None = None
    workflow_state: WorkflowState | None = None
    last_plan: list[dict[str, Any]] = field(default_factory=list)
    last_step: str | None = None
    pending_tasks: list[PlannedTaskState] = field(default_factory=list)
    task_attempts: dict[str, int] = field(default_factory=dict)
    history: list[MemoryMessage] = field(default_factory=list)


class SessionStore:
    def __init__(self, max_messages: int = 20) -> None:
        self.max_messages = max_messages
        self._states: dict[int, SessionState] = {}
        self._messages: dict[int, deque[MemoryMessage]] = defaultdict(
            lambda: deque(maxlen=self.max_messages)
        )
        self._lock = RLock()

    def get_state(self, user_id: int) -> SessionState:
        with self._lock:
            state = self._states.get(user_id)
            if state is None:
                state = SessionState(user_id=user_id)
                state.history = list(self._messages[user_id])
                self._states[user_id] = state
            return state

    def set_role(self, user_id: int, role: str) -> SessionState:
        with self._lock:
            state = self.get_state(user_id)
            state.role = (role or "EMPLOYEE").upper()
            return state

    def add_message(self, user_id: int, role: str, content: str) -> None:
        message = MemoryMessage(role=role, content=content)
        with self._lock:
            self._messages[user_id].append(message)
            self.get_state(user_id).history = list(self._messages[user_id])

    def get_history(self, user_id: int) -> list[MemoryMessage]:
        with self._lock:
            return list(self._messages[user_id])

    def update_context(
        self,
        user_id: int,
        *,
        role: str | None = None,
        last_intent: str | None = None,
        last_action: str | None = None,
        last_action_key: str | None = None,
        last_action_at: datetime | None = None,
        last_entities: dict[str, Any] | None = None,
    ) -> SessionState:
        with self._lock:
            state = self.get_state(user_id)
            if role is not None:
                state.role = (role or "EMPLOYEE").upper()
            if last_intent is not None:
                state.last_intent = last_intent
            if last_action is not None:
                state.last_action = last_action
            if last_action_key is not None:
                state.last_action_key = last_action_key
            if last_action_at is not None:
                state.last_action_at = last_action_at
            if last_entities is not None:
                state.last_entities = dict(last_entities)
            state.history = list(self._messages[user_id])
            return state

    def set_pending_request(
        self,
        user_id: int,
        *,
        intent: str,
        action: str,
        entities: dict[str, Any],
        missing_fields: list[str],
        prompt: str,
    ) -> PendingRequest:
        pending = PendingRequest(
            intent=intent,
            action=action,
            entities=dict(entities),
            missing_fields=list(missing_fields),
            prompt=prompt,
        )
        with self._lock:
            self.get_state(user_id).pending_request = pending
        return pending

    def clear_pending_request(self, user_id: int) -> None:
        with self._lock:
            self.get_state(user_id).pending_request = None

    def set_pending_confirmation(
        self,
        user_id: int,
        *,
        intent: str,
        action: str,
        entities: dict[str, Any],
        prompt: str,
    ) -> PendingConfirmation:
        confirmation = PendingConfirmation(
            intent=intent,
            action=action,
            entities=dict(entities),
            prompt=prompt,
        )
        with self._lock:
            self.get_state(user_id).pending_confirmation = confirmation
        return confirmation

    def clear_pending_confirmation(self, user_id: int) -> None:
        with self._lock:
            self.get_state(user_id).pending_confirmation = None

    def get_workflow(self, user_id: int) -> WorkflowState | None:
        with self._lock:
            return self.get_state(user_id).workflow_state

    def set_workflow(self, user_id: int, workflow_state: WorkflowState | None) -> WorkflowState | None:
        with self._lock:
            self.get_state(user_id).workflow_state = workflow_state
            return workflow_state

    def clear_workflow(self, user_id: int) -> None:
        with self._lock:
            self.get_state(user_id).workflow_state = None

    def set_last_plan(self, user_id: int, plan: list[dict[str, Any]]) -> None:
        with self._lock:
            state = self.get_state(user_id)
            state.last_plan = [dict(item) for item in plan]

    def start_task(
        self,
        user_id: int,
        *,
        task_id: str,
        task_key: str,
        intent: str,
        role: str,
        plan: list[dict[str, Any]],
    ) -> PlannedTaskState:
        with self._lock:
            state = self.get_state(user_id)
            state.task_attempts[task_key] = state.task_attempts.get(task_key, 0) + 1
            task = PlannedTaskState(
                task_id=task_id,
                task_key=task_key,
                intent=intent,
                role=role,
                plan=[dict(item) for item in plan],
            )
            state.pending_tasks = [item for item in state.pending_tasks if item.task_key != task_key]
            state.pending_tasks.append(task)
            state.last_plan = [dict(item) for item in plan]
            state.last_intent = intent
            return task

    def is_task_pending(self, user_id: int, task_key: str) -> bool:
        with self._lock:
            state = self.get_state(user_id)
            return any(task.task_key == task_key and task.status == "running" for task in state.pending_tasks)

    def task_attempts(self, user_id: int, task_key: str) -> int:
        with self._lock:
            return int(self.get_state(user_id).task_attempts.get(task_key, 0))

    def update_task_step(
        self,
        user_id: int,
        task_id: str,
        *,
        step_key: str,
        status: str,
        error: str | None = None,
    ) -> None:
        with self._lock:
            state = self.get_state(user_id)
            state.last_step = step_key
            for task in state.pending_tasks:
                if task.task_id != task_id:
                    continue
                task.current_step = step_key
                task.status = status if status == "failed" else "running"
                task.updated_at = datetime.utcnow()
                if error:
                    task.errors.append(error)
                break

    def complete_task(
        self,
        user_id: int,
        task_id: str,
        *,
        status: str,
        last_action: str | None = None,
        error: str | None = None,
    ) -> None:
        with self._lock:
            state = self.get_state(user_id)
            remaining: list[PlannedTaskState] = []
            for task in state.pending_tasks:
                if task.task_id != task_id:
                    remaining.append(task)
                    continue
                task.status = status
                task.updated_at = datetime.utcnow()
                if error:
                    task.errors.append(error)
            state.pending_tasks = remaining
            if last_action is not None:
                state.last_action = last_action
                state.last_action_at = datetime.utcnow()

    def mark_action(
        self,
        user_id: int,
        *,
        action: str,
        action_key: str,
        intent: str,
        entities: dict[str, Any],
    ) -> None:
        self.update_context(
            user_id,
            last_action=action,
            last_action_key=action_key,
            last_action_at=datetime.utcnow(),
            last_intent=intent,
            last_entities=entities,
        )

    def is_duplicate_action(
        self,
        user_id: int,
        action_key: str,
        dedup_window_seconds: float,
    ) -> bool:
        state = self.get_state(user_id)
        if not state.last_action_key or not state.last_action_at:
            return False
        if state.last_action_key != action_key:
            return False
        window = timedelta(seconds=max(dedup_window_seconds, 0))
        return datetime.utcnow() - state.last_action_at <= window
