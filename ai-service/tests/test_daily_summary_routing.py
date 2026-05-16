"""AI-FE-MASTER-CHATBOT-01 — daily-summary intent routing for EN/FR/TN/AR.

Regression: "Show my daily summary" (EmployeeAgent quick prompt) used to
miss every detector and fall through to the legacy/LLM path. When no
provider was reachable that produced fallback.unsafe_response.

The router only needs ONE detector to fire — but the surface includes the
EmployeeAgent (full intelligence digest) and the EmployeeCopilot (role
summary). Both must accept the same multilingual phrasings so the chat
widget's quick prompts always reach a deterministic, tool-backed builder.
"""

from __future__ import annotations

from app.agents.employee_agent import EmployeeAgent
from app.agents.role_copilots.admin_copilot import AdminCopilot
from app.agents.role_copilots.employee_copilot import EmployeeCopilot
from app.agents.role_copilots.manager_copilot import ManagerCopilot
from app.agents.role_copilots.rh_copilot import RHCopilot
from app.context.current_user import CurrentUserContext


def _ctx(role: str) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=1,
        role=role,
        entreprise_id=1,
        token=None,
        metadata={"chatbot_public_context": True, "jwt_verified": False},
    )


def test_employee_agent_accepts_english_daily_summary() -> None:
    agent = EmployeeAgent(executor=None)
    for prompt in (
        "Show my daily summary",
        "show my daily",
        "my daily summary",
        "what should I do today",
        "daily summary",
        "my briefing",
    ):
        assert agent.can_handle(prompt, _ctx("EMPLOYEE")) >= 0.55, prompt


def test_employee_agent_accepts_fr_tn_ar_daily_summary() -> None:
    agent = EmployeeAgent(executor=None)
    for prompt in (
        "résumé du jour",
        "résumé de ma journée",
        "chnowa najem naamel tawa",
        "ملخص يومي",
    ):
        assert agent.can_handle(prompt, _ctx("EMPLOYEE")) >= 0.55, prompt


def test_employee_copilot_routes_show_my_daily_summary() -> None:
    intent, conf = EmployeeCopilot(executor=None).detect_intent("Show my daily summary", _ctx("EMPLOYEE"))
    assert intent == "employee.daily_briefing"
    assert conf >= 0.55


def test_manager_copilot_routes_todays_team_summary() -> None:
    intent, conf = ManagerCopilot(executor=None).detect_intent("Today's team summary", _ctx("MANAGER"))
    assert intent == "manager.team_summary"
    assert conf >= 0.55


def test_rh_copilot_routes_rh_backlog_prompt() -> None:
    # RHCopilot has no extra args.
    intent, conf = RHCopilot(executor=None).detect_intent("RH backlog", _ctx("RH"))
    assert intent == "rh.daily_briefing"
    assert conf >= 0.55


def test_admin_copilot_routes_system_health_prompt() -> None:
    intent, conf = AdminCopilot(executor=None).detect_intent("System health", _ctx("ADMIN"))
    assert intent == "admin.system_summary"
    assert conf >= 0.55
