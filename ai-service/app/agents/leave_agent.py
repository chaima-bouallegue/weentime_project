from __future__ import annotations

from datetime import date

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor
from app.tools.leave_tools import list_type_conges

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any
from .leave_planner import LeaveRiskAnalyzer, LeaveRiskCache, get_default_leave_risk_cache


class LeaveAgent(ConfirmationMixin, DomainAgent):
    name = "leave"

    def __init__(
        self,
        executor: ToolExecutor,
        confirmation_store: ConfirmationStore,
        risk_cache: LeaveRiskCache | None = None,
    ) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store
        self.risk_cache = risk_cache or get_default_leave_risk_cache()

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        if intent == "leave.balance":
            return await self.read_response(
                tool_name="leave.get_balance",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici votre solde de conges.",
                confidence=confidence,
            )
        if intent == "leave.status":
            payload = extract_payload(message, "GET_LEAVE_STATUS", context)
            request_id = payload.get("request_id")
            if request_id:
                return await self.read_response(
                    tool_name="leave.get_request_status",
                    tool_input={"request_id": request_id},
                    context=context,
                    intent=intent,
                    success_text="Voici le statut de cette demande de conge.",
                    confidence=confidence,
                )
            return await self.read_response(
                tool_name="leave.list_my_requests",
                tool_input={},
                context=context,
                intent="leave.list",
                success_text="Voici vos demandes de conge.",
                confidence=confidence,
            )
        if intent == "leave.list":
            return await self.read_response(
                tool_name="leave.list_my_requests",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici vos demandes de conge.",
                confidence=confidence,
            )
        if intent == "leave.create":
            payload = extract_payload(message, "CREATE_LEAVE", context)
            # Pre-infer sick-leave type so we don't re-ask "quel type de
            # conge ?" when the user already said "je suis malade".
            if not payload.get("leave_type_label") and _looks_like_sick_leave(message):
                payload["leave_type_label"] = "maladie"
                if not payload.get("reason"):
                    payload["reason"] = "maladie"
            if not payload.get("start_date") or not payload.get("end_date"):
                lang = getattr(context, "language", "fr")
                date_text = "Pour quelle date souhaitez-vous demander ce conge ?"
                if lang == "en":
                    date_text = "Which dates would you like to request for this leave?"
                elif lang == "ar":
                    date_text = "ما هي التواريخ التي ترغب في طلب الإجازة خلالها؟"
                elif lang == "tn":
                    date_text = "anehi date theb tekhedh feha congé?"
                return AgentResponse(
                    type="ask",
                    text=date_text,
                    intent=intent,
                    confidence=confidence,
                )
            if not payload.get("leave_type_label") and not payload.get("type_conge_id"):
                options: list[dict[str, str]] = []
                backend_client = getattr(self.executor, "backend_client", None)
                types = await list_type_conges(backend_client, context) if backend_client else []
                labels = [t.get("libelle") for t in types if isinstance(t, dict) and t.get("libelle")]
                lang = getattr(context, "language", "fr")
                if labels:
                    example_text = ", ".join(labels[:3])
                    options = [{"label": label, "value": label} for label in labels]
                    if lang == "en":
                        text = f"Which leave type would you like to request? For example: {example_text}."
                    elif lang == "ar":
                        text = f"ما نوع الإجازة التي ترغب في طلبها؟ على سبيل المثال: {example_text}."
                    elif lang == "tn":
                        text = f"Chnowa l type de conge? Mathalan: {example_text}."
                    else:
                        text = f"Quel type de conge souhaitez-vous demander ? Par exemple: {example_text}."
                else:
                    if lang == "en":
                        text = "Which leave type would you like to request?"
                    elif lang == "ar":
                        text = "ما نوع الإجازة التي ترغب في طلبها؟"
                    elif lang == "tn":
                        text = "Chnowa l type de conge?"
                    else:
                        text = "Quel type de conge souhaitez-vous demander ?"

                action_result = {"kind": "leave_type_prompt", "options": options} if options else None
                return AgentResponse(
                    type="ask",
                    text=text,
                    intent=intent,
                    confidence=confidence,
                    actionResult=action_result,
                )
            # Specific leave types ARE their own reason — never re-prompt a user
            # who already said "conge maladie / maternite / sans solde" etc.
            if not payload.get("reason"):
                inferred = _reason_from_leave_type(payload.get("leave_type_label"))
                if inferred:
                    payload["reason"] = inferred
            if not payload.get("reason"):
                return AgentResponse(
                    type="ask",
                    text="Quel motif souhaitez-vous indiquer pour cette demande de conge ?",
                    intent=intent,
                    confidence=confidence,
                )
            if payload.get("date_precision") == "month_inferred":
                return AgentResponse(
                    type="ask",
                    text="Pouvez-vous confirmer le mois ou donner la date complete du conge ?",
                    intent=intent,
                    confidence=0.62,
                )
            tool_input = {
                "start_date": payload["start_date"],
                "end_date": payload["end_date"],
                "reason": payload["reason"],
                "type_conge_id": payload.get("type_conge_id"),
                "leave_type_label": payload.get("leave_type_label"),
            }
            # Include justificatif URL from request metadata (pending attachment)
            ctx_meta = context.metadata if isinstance(getattr(context, "metadata", None), dict) else {}
            justificatif_url = ctx_meta.get("justificatif_url") or ctx_meta.get("justificatifUrl")
            if justificatif_url:
                tool_input["justificatif_url"] = justificatif_url
            risk_analysis = await LeaveRiskAnalyzer(self.executor, cache=self.risk_cache).analyze(tool_input, context)
            if _looks_like_sick_leave(message):
                lang = getattr(context, "language", "fr")
                today_str = date.today().isoformat()
                is_today = payload.get("start_date") == today_str and payload.get("end_date") == today_str
                if is_today:
                    if lang == "en":
                        base_text = "I'm sorry to hear that. Would you like me to submit a sick leave request for today?"
                    elif lang == "ar":
                        base_text = "سلامتك، يؤسفني سماع ذلك. هل ترغب في تسجيل إجازة مرضية لهذا اليوم؟"
                    elif lang == "tn":
                        base_text = "Nchallah labes. Theb n3adilek congé maladie lyoum?"
                    else:
                        base_text = "Je suis désolé de l'apprendre. Souhaitez-vous déclarer un congé maladie pour aujourd'hui ?"
                else:
                    s_date = payload.get("start_date")
                    e_date = payload.get("end_date")
                    if lang == "en":
                        base_text = f"I'm sorry to hear that. Would you like me to submit a sick leave request from {s_date} to {e_date}?"
                    elif lang == "ar":
                        base_text = f"سلامتك، يؤسفني سماع ذلك. هل ترغب في تسجيل إجازة مرضية من {s_date} إلى {e_date}؟"
                    elif lang == "tn":
                        base_text = f"Nchallah labes. Theb n3adilek congé maladie men {s_date} l {e_date}?"
                    else:
                        base_text = f"Je suis désolé de l'apprendre. Souhaitez-vous déclarer un congé maladie du {s_date} au {e_date} ?"
            else:
                base_text = "Confirmez-vous la creation de cette demande de conge ?"

            confirmation_text = LeaveRiskAnalyzer.build_confirmation_text(
                base_text,
                risk_analysis,
            )
            return self.confirmation_response(
                context=context,
                tool_name="leave.create_request",
                tool_input=tool_input,
                intent=intent,
                text=confirmation_text,
                confidence=confidence,
                action_result={
                    "kind": "confirmation_summary",
                    "intent": intent,
                    "summary": {
                        "type": payload.get("leave_type_label"),
                        "date": payload["start_date"],
                        "endDate": payload["end_date"],
                        "motif": payload["reason"],
                    },
                    "riskAnalysis": risk_analysis,
                },
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous faire avec vos conges ?", intent="leave.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        # "malade" / "sick" / "marid" trigger sick-leave creation even when
        # the message does not contain a leave noun ("je suis malade
        # aujourd'hui"). The leave_type/reason is pre-inferred in handle().
        sick_terms = ("malade", "maladie", "sick", "mridh", "mridha", "مريض", "مريضة")
        if not has_any(text, ("congé", "conge", "counji", "leave", "vacance", "absence", "reste", "mazel", "mazali", "mazeli", *sick_terms)):
            return None, 0.0
        if has_any(text, ("combien", "solde", "jours restants", "how many", "balance", "reste", "mazel", "mazali", "mazeli", "9adeh", "b9a", "رصيد", "كم بقي")):
            return "leave.balance", 0.91
        if has_any(text, ("statut", "status", "suivi", "historique", "mes demandes", "list", "liste")):
            return "leave.status", 0.82
        if has_any(text, sick_terms):
            return "leave.create", 0.88
        if has_any(text, ("je veux", "demande", "demander", "prendre", "create", "request", "want", "need", "tomorrow", "demain")):
            return "leave.create", 0.9
        return "leave.list", 0.65


def _looks_like_sick_leave(message: str) -> bool:
    text = (message or "").lower()
    return any(term in text for term in ("malade", "maladie", "sick", "mridh", "mridha", "مريض", "مريضة"))


def _reason_from_leave_type(leave_type_label) -> str | None:
    """Specific leave types ARE their own reason — kept in sync with the
    same helper in slot_filling._reason_from_leave_type."""
    label = str(leave_type_label or "").strip().lower()
    if not label:
        return None
    if "maladie" in label or "medical" in label:
        return "maladie"
    if "maternite" in label or "maternité" in label:
        return "maternite"
    if "paternite" in label or "paternité" in label:
        return "paternite"
    if "exceptionnel" in label:
        return "exceptionnel"
    if "sans solde" in label:
        return "sans solde"
    return None
