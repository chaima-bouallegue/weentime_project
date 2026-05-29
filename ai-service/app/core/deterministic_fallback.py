from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.models.response_models import ALLOWED_FALLBACK_REASONS, FallbackMetadata, SafeResponseType
from app.nlp.language_detector import resolve_response_language
from app.observability.tracing import log_event

if TYPE_CHECKING:
    from app.guards.guard_result import GuardResult


DEFAULT_FALLBACK_REASON = "unsafe_response"

SAFE_FALLBACK_MESSAGES: dict[str, dict[str, str]] = {
    "provider_disabled": {
        "fr": "Le mode IA generative est desactive. Je reste en mode deterministe avec uniquement les donnees verifiees du systeme.",
        "en": "Generative AI mode is disabled. I remain in deterministic mode with verified system data only.",
        "ar": "وضع الذكاء الاصطناعي التوليدي غير مفعل. سأجيب فقط بالبيانات المؤكدة من النظام.",
        "tn": "Mode IA generative msakker. Njaweb ken b donnees verifiees mel systeme.",
    },
    "provider_unavailable": {
        "fr": "Le modele IA n'est pas disponible. Je peux continuer avec les reponses deterministes et les donnees verifiees.",
        "en": "The AI model is unavailable. I can continue with deterministic responses and verified data.",
        "ar": "النموذج غير متاح حاليا. سأستخدم فقط الإجابات المؤكدة من النظام.",
        "tn": "El modele IA moch disponible. Njaweb b mode deterministe w donnees verifiees.",
    },
    "provider_timeout": {
        "fr": "Le modele IA a mis trop de temps a repondre. Je continue avec une reponse sure basee sur le systeme.",
        "en": "The AI model took too long to respond. I am using a safe system-based answer instead.",
        "ar": "تأخر النموذج في الرد. سأستخدم إجابة آمنة من النظام.",
        "tn": "El modele t3attel barcha. Njaweb b reponse sure mel systeme.",
    },
    "provider_invalid_output": {
        "fr": "La reponse IA n'etait pas exploitable en securite. Je continue avec une reponse deterministe.",
        "en": "The AI response could not be used safely. I am using a deterministic response instead.",
        "ar": "لا يمكن استخدام رد النموذج بأمان. سأستخدم إجابة آمنة من النظام.",
        "tn": "Reponse IA mahich safe. Njaweb b mode deterministe.",
    },
    "guard_rejected": {
        "fr": "Je ne peux pas confirmer cette information sans donnees verifiees. Reessayez avec une demande basee sur les donnees du systeme.",
        "en": "I cannot confirm that without verified data. Please retry with a request based on system data.",
        "ar": "لا أستطيع تأكيد هذه المعلومة بدون بيانات موثقة من النظام.",
        "tn": "Ma najjemch nconfirmi hedha blesh donnees verifiees mel systeme.",
    },
    "rag_unavailable": {
        "fr": "Je n'ai pas acces aux sources RH approuvees pour repondre a cette question.",
        "en": "I do not have access to approved HR sources for this question.",
        "ar": "لا توجد لدي مصادر موارد بشرية معتمدة للإجابة عن هذا السؤال.",
        "tn": "Ma andich sources RH approuvees bech njaweb ala hedha.",
    },
    "rag_missing_citations": {
        "fr": "Je n'ai pas trouve de source RH approuvee pour repondre a cette question.",
        "en": "I could not find an approved HR source to answer this question.",
        "ar": "لم أجد مصدرا معتمدا من الموارد البشرية للإجابة عن هذا السؤال.",
        "tn": "Ma l9itch source RH approuvee bech njaweb.",
    },
    "unsupported_tool": {
        "fr": "Cette action n'est pas disponible dans les outils verifies du systeme.",
        "en": "This action is not available in the verified system tools.",
        "ar": "هذه العملية غير متاحة ضمن أدوات النظام المؤكدة.",
        "tn": "El action hedhi moch mawjooda fel outils verifies.",
    },
    "unsafe_response": {
        "fr": "Je ne peux pas fournir cette reponse en securite. Je peux vous aider avec une demande verifiee par le systeme.",
        "en": "I cannot provide that response safely. I can help with a system-verified request.",
        "ar": "لا يمكنني تقديم هذه الإجابة بأمان. يمكنني مساعدتك بطلب مؤكد من النظام.",
        "tn": "Ma najjemch njaweb hedha b securite. Najjem n3awnek b demande verifiee.",
    },
}


def deterministic_fallback_response(
    reason: str,
    *,
    context: CurrentUserContext | None = None,
    guard_result: "GuardResult | None" = None,
    safe_response_type: SafeResponseType = "unavailable",
) -> AgentResponse:
    safe_reason = reason if reason in ALLOWED_FALLBACK_REASONS else DEFAULT_FALLBACK_REASON
    guard_status = guard_result.primary_category if guard_result is not None else None
    metadata = build_fallback_metadata(
        safe_reason,
        context=context,
        guard_status=guard_status,
        safe_response_type=safe_response_type,
    )
    log_event(
        "fallback.deterministic",
        metadata={
            "fallback_reason": metadata.fallback_reason,
            "safe_response_type": metadata.safe_response_type,
            "provider_used": metadata.provider_used,
            "guard_status": metadata.guard_status,
            "request_id": metadata.request_id,
        },
    )
    action_result = {
        "kind": "deterministic_fallback",
        "fallback": metadata.model_dump(mode="json"),
        "fallback_used": metadata.fallback_used,
        "fallback_reason": metadata.fallback_reason,
        "safe_response_type": metadata.safe_response_type,
        "provider_used": metadata.provider_used,
        "guard_status": metadata.guard_status,
        "request_id": metadata.request_id,
    }
    if guard_result is not None:
        action_result["guard_reasons"] = [rejection.category for rejection in guard_result.rejections]

    return AgentResponse(
        type="error",
        text=localized_fallback_text(safe_reason, context),
        intent=f"fallback.{safe_reason}",
        confidence=1.0,
        requiresConfirmation=False,
        confirmationId=None,
        toolCalls=[],
        actionResult=action_result,
    )


def build_fallback_metadata(
    reason: str,
    *,
    context: CurrentUserContext | None = None,
    guard_status: str | None = None,
    safe_response_type: SafeResponseType = "unavailable",
) -> FallbackMetadata:
    safe_reason = reason if reason in ALLOWED_FALLBACK_REASONS else DEFAULT_FALLBACK_REASON
    request_id = _request_id_from_context(context)
    return FallbackMetadata(
        fallback_reason=safe_reason,  # type: ignore[arg-type]
        safe_response_type=safe_response_type,
        guard_status=guard_status,
        request_id=request_id,
    )


def localized_fallback_text(reason: str, context: CurrentUserContext | None = None) -> str:
    safe_reason = reason if reason in ALLOWED_FALLBACK_REASONS else DEFAULT_FALLBACK_REASON
    locale = _locale_from_context(context)
    return SAFE_FALLBACK_MESSAGES.get(safe_reason, SAFE_FALLBACK_MESSAGES[DEFAULT_FALLBACK_REASON]).get(locale) or SAFE_FALLBACK_MESSAGES[
        safe_reason
    ]["fr"]


def _locale_from_context(context: CurrentUserContext | None) -> str:
    language = resolve_response_language(
        str(context.metadata.get("original_text") or "") if context is not None else "",
        context.metadata if context is not None else None,
        fallback=context.language if context is not None else "fr",
    )
    if language == "tn":
        return "tn"
    if language in {"en", "ar"}:
        return language
    return "fr"


def _request_id_from_context(context: CurrentUserContext | None) -> str | None:
    if context is None:
        return None
    value: Any = context.metadata.get("request_id")
    if value is None:
        return None
    text = str(value).strip()
    return text or None
