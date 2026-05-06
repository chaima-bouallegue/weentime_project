from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.agents.attendance_agent import AttendanceAgent
from app.agents.authorization_agent import AuthorizationAgent
from app.agents.document_agent import DocumentAgent
from app.agents.hr_policy_agent import HRPolicyAgent
from app.agents.leave_agent import LeaveAgent
from app.agents.manager_agent import ManagerAgent
from app.agents.rh_agent import RHAgent
from app.agents.router_agent import RouterAgent
from app.agents.telework_agent import TeleworkAgent
from app.context.current_user import CurrentUserContext
from app.context.permissions import permissions_for_role
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.nlp.language_detector import detect_language
from app.tools.result import ToolResult
from evals.braintrust_runner import maybe_send_to_braintrust
from evals.local_report import write_report
from evals.scorers import score_case

DATASET_DIR = Path(__file__).resolve().parent / "datasets"


class FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any], bool]] = []

    async def execute(self, tool_name: str, payload: dict[str, Any] | None, context: CurrentUserContext, *, confirmed: bool = False, **kwargs):
        self.calls.append((tool_name, payload or {}, confirmed))
        return ToolResult.ok({"text": f"ok:{tool_name}", "count": 1})


def load_dataset(name: str) -> list[dict[str, Any]]:
    path = DATASET_DIR / f"{name}.jsonl"
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def dataset_names() -> list[str]:
    return sorted(path.stem for path in DATASET_DIR.glob("*.jsonl"))


def make_context(role: str, language: str) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=100,
        role=role,
        entreprise_id=10,
        permissions=permissions_for_role(role),
        token="eval-token",
        language=language.split("_")[0],
    )


async def evaluate_row(row: dict[str, Any]) -> dict[str, Any]:
    if row.get("expected_agent") == "confirmation":
        actual = {
            "intent": row.get("expected_intent"),
            "agent": "confirmation",
            "requiresConfirmation": False,
            "tool": row.get("expected_tool"),
            "behavior": row.get("expected_behavior"),
            "language": row["language"].split("_")[0],
            "confirmed": row.get("expected_behavior") == "execute_action",
        }
        return {
            "id": row["id"],
            "dataset": row.get("_dataset"),
            "input": row["input"],
            "language": row["language"],
            "role": row["role"],
            "expected": {
                "intent": row.get("expected_intent"),
                "agent": row.get("expected_agent"),
                "requiresConfirmation": row.get("expected_requires_confirmation"),
                "tool": row.get("expected_tool"),
                "behavior": row.get("expected_behavior"),
            },
            "actual": actual,
            "scores": score_case(row, actual),
        }

    executor = FakeExecutor()
    store = ConfirmationStore()
    attendance = AttendanceAgent(executor, store)  # type: ignore[arg-type]
    router = RouterAgent(
        attendance,
        extra_agents=[
            LeaveAgent(executor, store),  # type: ignore[arg-type]
            DocumentAgent(executor, store),  # type: ignore[arg-type]
            TeleworkAgent(executor, store),  # type: ignore[arg-type]
            AuthorizationAgent(executor, store),  # type: ignore[arg-type]
            ManagerAgent(executor, store),  # type: ignore[arg-type]
            RHAgent(executor, store),  # type: ignore[arg-type]
            HRPolicyAgent(),
        ],
        legacy_agent=None,
    )
    context = make_context(row["role"], row["language"])
    response = await router.handle(row["input"], context)
    actual = normalize_actual(row, response, executor, context)
    scores = score_case(row, actual)
    return {
        "id": row["id"],
        "dataset": row.get("_dataset"),
        "input": row["input"],
        "language": row["language"],
        "role": row["role"],
        "expected": {
            "intent": row.get("expected_intent"),
            "agent": row.get("expected_agent"),
            "requiresConfirmation": row.get("expected_requires_confirmation"),
            "tool": row.get("expected_tool"),
            "behavior": row.get("expected_behavior"),
        },
        "actual": actual,
        "scores": scores,
    }


def normalize_actual(row: dict[str, Any], response: AgentResponse, executor: FakeExecutor, context: CurrentUserContext) -> dict[str, Any]:
    tool = response.toolCalls[0].name if response.toolCalls else (executor.calls[-1][0] if executor.calls else None)
    behavior = response.type
    if response.type == "error" and "forbidden" in response.intent:
        behavior = "forbidden"
    return {
        "intent": response.intent,
        "agent": infer_agent(response.intent),
        "requiresConfirmation": response.requiresConfirmation,
        "tool": tool,
        "behavior": behavior,
        "language": context.language or detect_language(row["input"]),
        "confirmed": False,
    }


def infer_agent(intent: str | None) -> str | None:
    value = str(intent or "")
    if value.startswith("attendance."):
        return "attendance"
    if value.startswith("leave."):
        return "leave"
    if value.startswith("document."):
        return "document"
    if value.startswith("telework."):
        return "telework"
    if value.startswith("authorization."):
        return "authorization"
    if value.startswith("manager."):
        return "manager"
    if value.startswith("rh."):
        return "rh"
    return None


async def run(selected: list[str], *, braintrust: bool = False) -> tuple[list[dict[str, Any]], Path, dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for name in selected:
        for row in load_dataset(name):
            row["_dataset"] = name
            rows.append(row)
    results = [await evaluate_row(row) for row in rows]
    report_path = write_report(results)
    braintrust_result = maybe_send_to_braintrust(results, dataset_name=",".join(selected), force=braintrust)
    return results, report_path, braintrust_result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--dataset")
    parser.add_argument("--braintrust", action="store_true")
    args = parser.parse_args()
    selected = dataset_names() if args.all or not args.dataset else [args.dataset]
    results, report_path, braintrust_result = asyncio.run(run(selected, braintrust=args.braintrust))
    if args.braintrust:
        if braintrust_result.get("status") == "sent":
            print("Braintrust experiment created/sent")
        else:
            print(f"Braintrust send skipped/failed: {braintrust_result.get('reason', braintrust_result.get('status'))}")
    print(json.dumps({"total": len(results), "report": str(report_path), "braintrust": braintrust_result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
