from __future__ import annotations

import unicodedata
import re
from typing import Any

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.nlp.language_detector import resolve_response_language, response_script

from .templates import PHRASES

TN_HINTS = (
    "nheb",
    "n7eb",
    "ghodwa",
    "npointi",
    "nokhrej",
    "konji",
    "swaye3",
    "chnowa",
    "warini",
    "lyoum",
    "9adeh",
    "ma3andich",
)

COMMON_TRANSLATIONS: dict[str, dict[str, str]] = {
    "data_unavailable": {
        "fr": "Donnee indisponible",
        "en": "Unavailable data",
        "ar": "بيانات غير متاحة",
        "tn": "Donnees moch disponibles",
    },
    "backend_unavailable": {
        "fr": "Service backend momentanement indisponible.",
        "en": "The backend service is temporarily unavailable.",
        "ar": "الخدمة الخلفية غير متاحة حاليا.",
        "tn": "Service backend moch disponible taw.",
    },
    "auth_required": {
        "fr": "Votre session a expiré. Veuillez vous reconnecter.",
        "en": "Your session is expired. Please log in again.",
        "ar": "انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى.",
        "tn": "Session wfet, aawed connecti.",
    },
    "access_denied": {
        "fr": "Accès refusé. Vous n'avez pas les droits nécessaires pour cette action.",
        "en": "Access denied. You do not have permission for this action.",
        "ar": "تم رفض الوصول. ليست لديك الصلاحيات اللازمة لهذا الإجراء.",
        "tn": "Access refuse. Ma 3andekch les droits lel action hedhi.",
    },
    "daily_summary_title": {
        "fr": "{agent} : {priorities} priorite(s), {available} section(s) disponible(s).",
        "en": "{agent}: {priorities} priorities, {available} available sections.",
        "ar": "{agent}: {priorities} أولوية، {available} قسم متاح.",
        "tn": "{agent}: {priorities} priorité, {available} section disponible.",
    },
    "sections_title": {
        "fr": "Sections :",
        "en": "Sections:",
        "ar": "الأقسام:",
        "tn": "Sections:",
    },
    "priorities_title": {
        "fr": "Priorites :",
        "en": "Priorities:",
        "ar": "الأولويات:",
        "tn": "Priorités:",
    },
    "reminders_title": {
        "fr": "Rappels :",
        "en": "Reminders:",
        "ar": "التذكيرات:",
        "tn": "Rappels:",
    },
    "diagnostics_title": {
        "fr": "Diagnostics :",
        "en": "Diagnostics:",
        "ar": "التشخيصات:",
        "tn": "Diagnostics:",
    },
    "partial_data_warning": {
        "fr": "Certaines donnees sont indisponibles; le resume reste partiel.",
        "en": "Some data is unavailable, so the summary is partial.",
        "ar": "بعض البيانات غير متاحة، لذلك يبقى الملخص جزئيا.",
        "tn": "Fama donnees moch disponibles, donc el resume partiel.",
    },
    "action_approved": {
        "fr": "Action approuvee.",
        "en": "Action approved.",
        "ar": "تمت الموافقة على العملية.",
        "tn": "Action tacceptat.",
    },
    "action_cancelled": {
        "fr": "Action annulee.",
        "en": "Action cancelled.",
        "ar": "تم إلغاء العملية.",
        "tn": "Action t'annulat.",
    },
    "confirmation_required": {
        "fr": "Confirmation requise.",
        "en": "Confirmation required.",
        "ar": "التأكيد مطلوب.",
        "tn": "Lazem confirmation.",
    },
    "confirmation_not_found": {
        "fr": "Confirmation introuvable ou expiree.",
        "en": "Confirmation not found or expired.",
        "ar": "التأكيد غير موجود أو انتهت صلاحيته.",
        "tn": "Confirmation ma l9inehech walla expirée.",
    },
    "confirmation_expired": {
        "fr": "Cette confirmation a expire.",
        "en": "This confirmation has expired.",
        "ar": "انتهت صلاحية هذا التأكيد.",
        "tn": "El confirmation hedhi expirée.",
    },
    "confirmation_already_used": {
        "fr": "Cette action a deja ete traitee.",
        "en": "This action has already been processed.",
        "ar": "تمت معالجة هذه العملية من قبل.",
        "tn": "El action hedhi deja ttraitat.",
    },
    "missing_field": {
        "fr": "Champ manquant.",
        "en": "Missing field.",
        "ar": "حقل ناقص.",
        "tn": "Champ ناقص.",
    },
    "invalid_request": {
        "fr": "Demande invalide.",
        "en": "Invalid request.",
        "ar": "طلب غير صالح.",
        "tn": "Demande moch valide.",
    },
    "safe_fallback": {
        "fr": "Je peux vous aider avec une demande verifiee par le systeme.",
        "en": "I can help with a system-verified request.",
        "ar": "يمكنني المساعدة بطلب موثق من النظام.",
        "tn": "Najjem n3awnek b demande verifiee mel systeme.",
    },
    "tool_error": {
        "fr": "L'outil n'a pas pu terminer la demande.",
        "en": "The tool could not complete the request.",
        "ar": "لم تتمكن الأداة من إكمال الطلب.",
        "tn": "El outil ma najmch ykammel el demande.",
    },
    "no_data_found": {
        "fr": "Aucune donnee trouvee.",
        "en": "No data found.",
        "ar": "لم يتم العثور على بيانات.",
        "tn": "Ma l9inech donnees.",
    },
    "attendance_summary": {
        "fr": "Pointage",
        "en": "Attendance",
        "ar": "الحضور",
        "tn": "Pointage",
    },
    "leave_balance": {
        "fr": "Solde conges",
        "en": "Leave balance",
        "ar": "رصيد العطل",
        "tn": "Solde congés",
    },
    "weekly_hours": {
        "fr": "Heures semaine",
        "en": "Weekly hours",
        "ar": "ساعات الأسبوع",
        "tn": "Heures semaine",
    },
}

AGENT_LABELS: dict[str, dict[str, str]] = {
    "employee": {"fr": "Resume employe", "en": "Employee digest", "ar": "ملخص الموظف", "tn": "Résumé employé"},
    "manager": {"fr": "Resume manager", "en": "Manager digest", "ar": "ملخص المدير", "tn": "Résumé manager"},
    "rh": {"fr": "Resume RH", "en": "HR digest", "ar": "ملخص الموارد البشرية", "tn": "Résumé RH"},
    "admin": {"fr": "Resume administrateur", "en": "Admin digest", "ar": "ملخص المسؤول", "tn": "Résumé admin"},
}

SECTION_TITLES: dict[str, dict[str, str]] = {
    "pointage": {"en": "Attendance", "ar": "الحضور", "tn": "Pointage"},
    "heures semaine": {"en": "Weekly hours", "ar": "ساعات الأسبوع", "tn": "Heures semaine"},
    "solde conges": {"en": "Leave balance", "ar": "رصيد العطل", "tn": "Solde congés"},
    "demandes conges": {"en": "Leave requests", "ar": "طلبات العطل", "tn": "Demandes congés"},
    "teletravail": {"en": "Telework", "ar": "العمل عن بعد", "tn": "Télétravail"},
    "autorisations": {"en": "Authorizations", "ar": "الأذونات", "tn": "Autorisations"},
    "documents": {"en": "Documents", "ar": "الوثائق", "tn": "Documents"},
    "communication": {"en": "Communication", "ar": "التواصل", "tn": "Communication"},
    "presence equipe": {"en": "Team attendance", "ar": "حضور الفريق", "tn": "Pointage équipe"},
    "conges equipe": {"en": "Team leave", "ar": "عطل الفريق", "tn": "Congés équipe"},
    "teletravail equipe": {"en": "Team telework", "ar": "عمل الفريق عن بعد", "tn": "Télétravail équipe"},
    "autorisations equipe": {"en": "Team authorizations", "ar": "أذونات الفريق", "tn": "Autorisations équipe"},
    "statistiques rh": {"en": "HR statistics", "ar": "إحصائيات الموارد البشرية", "tn": "Stats RH"},
    "conges rh": {"en": "HR leave", "ar": "عطل الموارد البشرية", "tn": "Congés RH"},
    "teletravail rh": {"en": "HR telework", "ar": "عمل الموارد البشرية عن بعد", "tn": "Télétravail RH"},
    "autorisations rh": {"en": "HR authorizations", "ar": "أذونات الموارد البشرية", "tn": "Autorisations RH"},
    "documents rh": {"en": "HR documents", "ar": "وثائق الموارد البشرية", "tn": "Documents RH"},
    "sante systeme": {"en": "System health", "ar": "حالة النظام", "tn": "Santé système"},
    "utilisateurs mal configures": {"en": "Misconfigured users", "ar": "مستخدمون بإعدادات ناقصة", "tn": "Users mal configurés"},
    "utilisateurs": {"en": "Users", "ar": "المستخدمون", "tn": "Users"},
    "entreprises": {"en": "Companies", "ar": "الشركات", "tn": "Entreprises"},
    "capacites": {"en": "Capabilities", "ar": "الإمكانيات", "tn": "Capacités"},
    "configuration utilisateurs": {"en": "User configuration", "ar": "إعدادات المستخدمين", "tn": "Configuration users"},
    "sante systeme backend": {"en": "Backend system health", "ar": "حالة النظام الخلفي", "tn": "Santé système backend"},
    "statut fournisseur ia": {"en": "AI provider status", "ar": "حالة مزود الذكاء الاصطناعي", "tn": "Statut fournisseur IA"},
}

KNOWN_TEXT_TRANSLATIONS: dict[str, dict[str, str]] = {
    "donnees disponibles depuis le backend.": {
        "en": "Data available from the backend.",
        "ar": "البيانات متاحة من النظام الخلفي.",
        "tn": "Donnees disponibles mel backend.",
    },
    "donnees disponibles.": {
        "en": "Data available.",
        "ar": "البيانات متاحة.",
        "tn": "Donnees disponibles.",
    },
    "aucun element trouve.": {
        "en": "No items found.",
        "ar": "لم يتم العثور على عناصر.",
        "tn": "Ma l9inech elements.",
    },
    "aucune donnee disponible.": {
        "en": "No data available.",
        "ar": "لا توجد بيانات متاحة.",
        "tn": "Ma fama hatta donnee disponible.",
    },
    "cette section est momentanement indisponible.": {
        "en": "This section is temporarily unavailable.",
        "ar": "هذا القسم غير متاح حاليا.",
        "tn": "El section hedhi moch disponible taw.",
    },
    "cette capacite n'est pas encore disponible.": {
        "en": "This capability is not available yet.",
        "ar": "هذه الإمكانية غير متاحة بعد.",
        "tn": "El capacité hedhi mazelt moch disponible.",
    },
    "cette capacite n'est pas disponible en lecture securisee.": {
        "en": "This capability is not available as a secure read action.",
        "ar": "هذه الإمكانية غير متاحة كقراءة آمنة.",
        "tn": "El capacité hedhi moch disponible en lecture sécurisée.",
    },
    "vous n'avez pas les droits necessaires pour consulter cette section.": {
        "en": "You do not have the required permissions to view this section.",
        "ar": "ليست لديك الصلاحيات المطلوبة لعرض هذا القسم.",
        "tn": "Ma 3andekch les droits bech techouf el section hedhi.",
    },
    "vous n'avez pas les droits necessaires pour cette section.": {
        "en": "You do not have the required permissions for this section.",
        "ar": "ليست لديك الصلاحيات المطلوبة لهذا القسم.",
        "tn": "Ma 3andekch les droits lel section hedhi.",
    },
    "certaines donnees sont indisponibles; le resume reste partiel.": {
        "en": "Some data is unavailable, so the summary is partial.",
        "ar": "بعض البيانات غير متاحة، لذلك يبقى الملخص جزئيا.",
        "tn": "Fama donnees moch disponibles, donc el resume partiel.",
    },
    "votre role ne permet pas d'utiliser ce copilot.": {
        "en": "Your role cannot use this copilot.",
        "ar": "دورك لا يسمح باستخدام هذا المساعد.",
        "tn": "Role mte3ek ma yesta3melch el copilot hedha.",
    },
    "votre role ne permet pas les actions admin.": {
        "en": "Your role cannot use admin actions.",
        "ar": "دورك لا يسمح بإجراءات المسؤول.",
        "tn": "Role mte3ek ma yesta3melch actions admin.",
    },
    "contexte employe non autorise pour ce digest.": {
        "en": "Employee context is not authorized for this digest.",
        "ar": "سياق الموظف غير مصرح له بهذا الملخص.",
        "tn": "Contexte employé moch autorisé lel digest hedha.",
    },
    "voici les utilisateurs.": {
        "en": "Here are the users.",
        "ar": "هؤلاء هم المستخدمون.",
        "tn": "Hedhom el users.",
    },
    "voici les entreprises.": {
        "en": "Here are the companies.",
        "ar": "هذه هي الشركات.",
        "tn": "Hedhom el entreprises.",
    },
    "voici les utilisateurs potentiellement mal configures.": {
        "en": "Here are the potentially misconfigured users.",
        "ar": "هؤلاء المستخدمون الذين قد تكون إعداداتهم ناقصة.",
        "tn": "Hedhom users elli ymken mal configurés.",
    },
    "etat systeme minimal disponible.": {
        "en": "Minimal system status is available.",
        "ar": "حالة النظام الأساسية متاحة.",
        "tn": "Etat système minimal disponible.",
    },
    "etat du fournisseur ia.": {
        "en": "AI provider status.",
        "ar": "حالة مزود الذكاء الاصطناعي.",
        "tn": "Etat fournisseur IA.",
    },
    "etat redis.": {
        "en": "Redis status.",
        "ar": "حالة Redis.",
        "tn": "Etat Redis.",
    },
    "etat braintrust.": {
        "en": "Braintrust status.",
        "ar": "حالة Braintrust.",
        "tn": "Etat Braintrust.",
    },
    "etat rag.": {
        "en": "RAG status.",
        "ar": "حالة RAG.",
        "tn": "Etat RAG.",
    },
    "statistiques rh disponibles depuis le backend.": {
        "en": "HR statistics are available from the backend.",
        "ar": "إحصائيات الموارد البشرية متاحة من النظام الخلفي.",
        "tn": "Stats RH disponibles mel backend.",
    },
    "voici les problemes de configuration tenant detectes.": {
        "en": "Here are the detected tenant configuration issues.",
        "ar": "هذه مشاكل إعدادات المستأجر التي تم اكتشافها.",
        "tn": "Hedhom problèmes configuration tenant elli tdetectaw.",
    },
    "la creation d'entreprise n'est pas encore connectee a un outil admin verifie.": {
        "en": "Company creation is not connected to a verified admin tool yet.",
        "ar": "إنشاء الشركات غير متصل بعد بأداة مسؤول موثقة.",
        "tn": "Création entreprise mazelt moch connectée b outil admin vérifié.",
    },
    "je n'ai pas encore compris cette demande. pouvez-vous la reformuler ?": {
        "en": "I did not understand that request yet. Could you rephrase it?",
        "ar": "لم أفهم هذا الطلب بعد. هل يمكنك إعادة صياغته؟",
        "tn": "Mazelt ma fhemtch el demande. Tnajjem taawedha?",
    },
    "bonjour. je peux vous aider avec la sante systeme, les utilisateurs, les entreprises ou les diagnostics ia.": {
        "en": "Hello. I can help with system health, users, companies, or AI diagnostics.",
        "ar": "مرحبا. يمكنني مساعدتك في حالة النظام، المستخدمين، الشركات أو تشخيصات الذكاء الاصطناعي.",
        "tn": "Ahla. Najjem n3awnek fi santé système, users, entreprises walla diagnostics IA.",
    },
    "bonjour. je peux vous aider avec le backlog rh, les validations, les documents ou les employes.": {
        "en": "Hello. I can help with HR backlog, approvals, documents, or employees.",
        "ar": "مرحبا. يمكنني مساعدتك في أعمال الموارد البشرية، الموافقات، الوثائق أو الموظفين.",
        "tn": "Ahla. Najjem n3awnek fi backlog RH, validations, documents walla employés.",
    },
    "bonjour. je peux vous aider avec votre equipe, les validations et le pointage.": {
        "en": "Hello. I can help with your team, approvals, and attendance.",
        "ar": "مرحبا. يمكنني مساعدتك في فريقك، الموافقات والحضور.",
        "tn": "Ahla. Najjem n3awnek fi équipe mte3ek, validations w pointage.",
    },
    "bonjour. je peux vous aider avec vos conges, documents, teletravail, autorisations et pointage.": {
        "en": "Hello. I can help with leave, documents, telework, authorizations, and attendance.",
        "ar": "مرحبا. يمكنني مساعدتك في العطل، الوثائق، العمل عن بعد، الأذونات والحضور.",
        "tn": "Ahla. Najjem n3awnek fi congés, documents, télétravail, autorisations w pointage.",
    },
    "j'ai compris votre intention, mais aucun agent n'est disponible pour la traiter.": {
        "en": "I understood the intent, but no agent is available to handle it.",
        "ar": "فهمت النية، لكن لا يوجد مساعد متاح لمعالجة الطلب.",
        "tn": "Fhemt el intention, ama ma fama hatta agent disponible.",
    },
    "action annulee.": COMMON_TRANSLATIONS["action_cancelled"],
    "action confirmee.": COMMON_TRANSLATIONS["action_approved"],
    "confirmation introuvable ou expiree.": COMMON_TRANSLATIONS["confirmation_not_found"],
    "cette confirmation a expire.": COMMON_TRANSLATIONS["confirmation_expired"],
    "cette action a deja ete traitee.": COMMON_TRANSLATIONS["confirmation_already_used"],
    "action de pointage confirmee.": {
        "en": "Attendance action confirmed.",
        "ar": "تم تأكيد عملية الحضور.",
        "tn": "Action pointage tconfirmat.",
    },
    "pointage d'entree confirme.": {
        "en": "Check-in confirmed.",
        "ar": "تم تأكيد تسجيل الدخول.",
        "tn": "Pointage entrée tconfirma.",
    },
    "pointage de sortie confirme.": {
        "en": "Check-out confirmed.",
        "ar": "تم تأكيد تسجيل الخروج.",
        "tn": "Pointage sortie tconfirma.",
    },
    "le service de pointage est indisponible actuellement.": {
        "en": "The attendance service is currently unavailable.",
        "ar": "خدمة الحضور غير متاحة حاليا.",
        "tn": "Service pointage moch disponible taw.",
    },
    "votre session a expire. veuillez vous reconnecter.": {
        "en": "Your session has expired. Please sign in again.",
        "ar": "انتهت صلاحية جلستك. يرجى تسجيل الدخول من جديد.",
        "tn": "Session mte3ek expirée. Aawed connecti.",
    },
    "vous n'avez pas les droits necessaires pour effectuer cette action.": {
        "en": "You do not have the required permissions for this action.",
        "ar": "ليست لديك الصلاحيات المطلوبة لتنفيذ هذه العملية.",
        "tn": "Ma 3andekch les droits lel action hedhi.",
    },
    "la ressource demandee est introuvable ou le service backend est indisponible.": {
        "en": "The requested resource was not found or the backend service is unavailable.",
        "ar": "المورد المطلوب غير موجود أو الخدمة الخلفية غير متاحة.",
        "tn": "El ressource ma l9inehech walla el backend moch disponible.",
    },
    "la ressource admin demandee est indisponible.": {
        "en": "The requested admin resource is unavailable.",
        "ar": "مورد المسؤول المطلوب غير متاح.",
        "tn": "El ressource admin المطلوبة moch disponible.",
    },
    "ce canal ou ces messages sont introuvables.": {
        "en": "This channel or these messages could not be found.",
        "ar": "تعذر العثور على هذه القناة أو هذه الرسائل.",
        "tn": "El canal walla messages hedhouma ma l9inehomch.",
    },
    "aucun utilisateur mal configure detecte.": {
        "en": "No misconfigured users detected.",
        "ar": "لم يتم اكتشاف مستخدمين بإعدادات ناقصة.",
        "tn": "Ma fama hatta user mal configuré.",
    },
    "aucun utilisateur mal configure detecte dans les donnees disponibles.": {
        "en": "No misconfigured users detected in the available data.",
        "ar": "لم يتم اكتشاف مستخدمين بإعدادات ناقصة في البيانات المتاحة.",
        "tn": "Ma fama hatta user mal configuré fel données disponibles.",
    },
    "le service backend est momentanement indisponible. reessayez dans quelques instants.": {
        "en": "The backend service is temporarily unavailable. Try again in a moment.",
        "ar": "الخدمة الخلفية غير متاحة حاليا. حاول بعد قليل.",
        "tn": "Service backend moch disponible taw. Jarreb baad chweya.",
    },
    "action refusee par le backend.": {
        "en": "The backend refused the action.",
        "ar": "رفضت الخدمة الخلفية العملية.",
        "tn": "El backend refusé el action.",
    },
}

TITLE_PREFIX_TRANSLATIONS: tuple[tuple[str, str], ...] = (
    ("donnee indisponible:", "data_unavailable"),
    ("a verifier:", "review_required"),
    ("priorite manager:", "manager_priority"),
    ("vue equipe:", "team_view"),
    ("priorite rh:", "hr_priority"),
    ("diagnostic admin:", "admin_diagnostic"),
    ("capacite indisponible:", "capability_unavailable"),
)

PREFIX_LABELS: dict[str, dict[str, str]] = {
    "review_required": {"en": "Review", "ar": "للمراجعة", "tn": "A vérifier"},
    "manager_priority": {"en": "Manager priority", "ar": "أولوية المدير", "tn": "Priorité manager"},
    "team_view": {"en": "Team view", "ar": "نظرة الفريق", "tn": "Vue équipe"},
    "hr_priority": {"en": "HR priority", "ar": "أولوية الموارد البشرية", "tn": "Priorité RH"},
    "admin_diagnostic": {"en": "Admin diagnostic", "ar": "تشخيص المسؤول", "tn": "Diagnostic admin"},
    "capability_unavailable": {"en": "Unavailable capability", "ar": "إمكانية غير متاحة", "tn": "Capacité indisponible"},
}


def translate(key: str, language: str | None, params: dict[str, Any] | None = None) -> str:
    locale = _normalize_locale(language)
    table = COMMON_TRANSLATIONS.get(key) or PHRASES.get(key)
    if not table:
        return key
    template = table.get(locale) or table.get("fr") or key
    if params:
        try:
            return template.format(**params)
        except (KeyError, ValueError):
            return template
    return template


def response_locale(context: CurrentUserContext) -> str:
    original = str(context.metadata.get("original_text") or "").lower()
    language = resolve_response_language(original, context.metadata, fallback=context.language or "fr")
    if language == "tn" or any(term in original for term in TN_HINTS):
        return "tn"
    if language in {"en", "ar"}:
        return language
    return "fr"


def localize_agent_response(response: AgentResponse, context: CurrentUserContext) -> AgentResponse:
    locale = response_locale(context)
    render_locale = _render_locale(locale, context)
    context.language = locale
    context.metadata["language"] = locale
    context.metadata["requested_language"] = locale
    context.metadata["response_language"] = locale
    context.metadata["response_script"] = "arabic" if render_locale == "ar" and locale == "tn" else response_script(
        str(context.metadata.get("original_text") or "")
    )

    key = _template_key(response)
    if key:
        response.text = translate(key, render_locale) or response.text
        _tag_response_language(response, locale)
        return response

    if _is_role_summary(response):
        localized = _localize_role_summary(response, render_locale)
        _tag_response_language(localized, locale)
        return localized

    response.text = _localize_known_text(response.text, render_locale)
    if isinstance(response.actionResult, dict):
        response.actionResult = _localize_action_result(response.actionResult, render_locale)
    if response.type == "error" and _should_use_generic_backend_unavailable(response.text):
        response.text = translate("backend_unavailable", render_locale)
    elif render_locale == "en" and response.type == "ask" and "motif" in response.text.lower():
        response.text = "What reason should I add?"
    elif render_locale == "ar" and response.type == "ask" and "motif" in response.text.lower():
        response.text = "ما هو السبب؟"
    elif render_locale == "tn" and response.type == "ask" and "motif" in response.text.lower():
        response.text = "Chnowa el motif?"
    _tag_response_language(response, locale)
    return response


def _normalize_locale(language: str | None) -> str:
    value = str(language or "fr").strip().lower()
    return value if value in {"fr", "en", "ar", "tn"} else "fr"


def _render_locale(locale: str, context: CurrentUserContext) -> str:
    original = str(context.metadata.get("original_text") or "")
    return "ar" if locale == "tn" and response_script(original) == "arabic" else locale


def _template_key(response: AgentResponse) -> str | None:
    text = (response.text or "").lower()
    intent = response.intent or ""
    if intent == "attendance.unknown":
        return "ask.attendance.choice"
    if intent == "leave.create":
        if "type" in text:
            return "ask.type.leave"
        if "date" in text:
            return "ask.date.leave"
        if "motif" in text:
            return "ask.reason.leave"
    if intent == "authorization.create":
        if "type" in text:
            return "ask.type.authorization"
        if "heures" in text or "heure" in text:
            return "ask.time.authorization"
        if "date" in text:
            return "ask.date.authorization"
        if "motif" in text:
            return "ask.reason.authorization"
    if intent == "planning.unavailable":
        return "unavailable.planning"
    if intent == "meeting.unavailable":
        return "unavailable.meeting"
    if intent == "manager.team_schedule":
        return "unavailable.team_schedule"
    return None


def _is_role_summary(response: AgentResponse) -> bool:
    action = response.actionResult if isinstance(response.actionResult, dict) else {}
    kind = str(action.get("kind") or "").lower()
    return kind in {"role_summary", "role_intelligence_digest", "digest"}


def _localize_role_summary(response: AgentResponse, locale: str) -> AgentResponse:
    action = dict(response.actionResult or {})
    sections = _localize_dict_list(action.get("sections"), locale)
    priorities = _localize_dict_list(action.get("priorities"), locale)
    reminders = _localize_dict_list(action.get("reminders"), locale)
    action["sections"] = sections
    action["priorities"] = priorities
    action["reminders"] = reminders
    action["warnings"] = [_localize_known_text(str(item), locale) for item in _as_list(action.get("warnings"))]
    action["summary"] = _build_role_summary_headline(action, response, locale)
    action["response_language"] = locale
    action["requested_language"] = locale
    response.actionResult = action
    response.text = _build_role_summary_text(action, response, locale)
    return response


def _localize_dict_list(value: Any, locale: str) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item in _as_list(value):
        if not isinstance(item, dict):
            continue
        localized = dict(item)
        if "title" in localized:
            localized["title"] = _localize_title(str(localized.get("title") or ""), locale)
        if "summary" in localized:
            localized["summary"] = _localize_known_text(str(localized.get("summary") or ""), locale)
        if isinstance(localized.get("recommendedActions"), list):
            localized["recommendedActions"] = [_localize_known_text(str(action), locale) for action in localized["recommendedActions"]]
        output.append(localized)
    return output


def _localize_action_result(value: dict[str, Any], locale: str) -> dict[str, Any]:
    localized: dict[str, Any] = {}
    for key, item in value.items():
        if isinstance(item, dict):
            localized[key] = _localize_action_result(item, locale)
        elif isinstance(item, list):
            localized[key] = [
                _localize_action_result(entry, locale) if isinstance(entry, dict) else _localize_known_text(str(entry), locale)
                for entry in item
            ]
        elif isinstance(item, str) and key in {"title", "label", "name"}:
            localized[key] = _localize_title(item, locale)
        elif isinstance(item, str) and key in {"summary", "text", "message"}:
            localized[key] = _localize_known_text(item, locale)
        else:
            localized[key] = item
    return localized


def _build_role_summary_text(action: dict[str, Any], response: AgentResponse, locale: str) -> str:
    sections = _as_list(action.get("sections"))
    priorities = _as_list(action.get("priorities"))
    reminders = _as_list(action.get("reminders"))
    lines = [_build_role_summary_headline(action, response, locale)]

    if priorities:
        lines.append(translate("priorities_title", locale))
        lines.extend(_format_item_line(item) for item in priorities[:8] if isinstance(item, dict))
    if sections:
        lines.append(translate("sections_title", locale))
        lines.extend(_format_item_line(item) for item in sections[:8] if isinstance(item, dict))
    if reminders:
        title_key = "diagnostics_title" if _role_key(action, response) == "admin" else "reminders_title"
        lines.append(translate(title_key, locale))
        lines.extend(_format_item_line(item) for item in reminders[:5] if isinstance(item, dict))
    if action.get("warnings"):
        lines.append(translate("partial_data_warning", locale))
    return "\n".join(line for line in lines if line)


def _build_role_summary_headline(action: dict[str, Any], response: AgentResponse, locale: str) -> str:
    role = _role_key(action, response)
    agent = AGENT_LABELS.get(role, AGENT_LABELS["employee"]).get(locale) or AGENT_LABELS[role].get("fr")
    sections = _as_list(action.get("sections"))
    priorities = _as_list(action.get("priorities"))
    available = sum(1 for section in sections if isinstance(section, dict) and str(section.get("status") or "").lower() == "ok")
    return translate(
        "daily_summary_title",
        locale,
        {"agent": agent, "priorities": len(priorities), "available": available},
    )


def _role_key(action: dict[str, Any], response: AgentResponse) -> str:
    agent = str(action.get("agent") or response.intent or "").lower()
    role = str(action.get("role") or "").lower()
    value = f"{agent} {role}"
    if "admin" in value:
        return "admin"
    if "manager" in value:
        return "manager"
    if "rh" in value or "hr" in value:
        return "rh"
    return "employee"


def _format_item_line(item: dict[str, Any]) -> str:
    title = str(item.get("title") or "").strip()
    summary = str(item.get("summary") or "").strip()
    if title and summary:
        return f"- {title}: {summary}"
    return f"- {title or summary}"


def _localize_title(title: str, locale: str) -> str:
    if locale == "fr":
        return title
    normalized = _text_key(title)
    pending_match = re.match(r"demande\(s\) de (?P<label>.+) en attente$", normalized)
    if pending_match:
        label = _localize_request_label(pending_match.group("label"), locale)
        if locale == "en":
            return f"Pending {label} request(s)"
        if locale == "ar":
            return f"طلبات {label} في الانتظار"
        return f"Demandes {label} en attente"
    priority_match = re.match(r"demandes de (?P<label>.+) a prioriser$", normalized)
    if priority_match:
        label = _localize_request_label(priority_match.group("label"), locale)
        if locale == "en":
            return f"{label.capitalize()} requests to prioritize"
        if locale == "ar":
            return f"طلبات {label} ذات أولوية"
        return f"Demandes {label} à prioriser"
    for prefix, key in TITLE_PREFIX_TRANSLATIONS:
        if normalized.startswith(prefix):
            suffix = title.split(":", 1)[1].strip() if ":" in title else ""
            localized_suffix = _localize_section_title(suffix, locale)
            if key == "data_unavailable":
                return f"{translate('data_unavailable', locale)}: {localized_suffix}"
            prefix_label = PREFIX_LABELS.get(key, {}).get(locale) or PREFIX_LABELS.get(key, {}).get("en") or key
            return f"{prefix_label}: {localized_suffix}"
    return _localize_section_title(title, locale)


def _localize_section_title(title: str, locale: str) -> str:
    if locale == "fr":
        return title
    normalized = _text_key(title)
    localized = SECTION_TITLES.get(normalized, {}).get(locale)
    return localized or title


def _localize_known_text(text: str, locale: str) -> str:
    if locale == "fr":
        return text
    normalized = _text_key(text)
    stats_match = re.match(r"statistiques rh: (?P<employees>\d+) employe\(s\), (?P<pending>\d+) demande\(s\) en attente\.", normalized)
    if stats_match:
        employees = stats_match.group("employees")
        pending = stats_match.group("pending")
        if locale == "en":
            return f"HR statistics: {employees} employees, {pending} pending requests."
        if locale == "ar":
            return f"إحصائيات الموارد البشرية: {employees} موظف، {pending} طلب في الانتظار."
        return f"Stats RH: {employees} employe(s), {pending} demande(s) en attente."
    follow_match = re.match(r"vous avez (?P<count>\d+) demande\(s\) de (?P<label>.+) a suivre\.", normalized)
    if follow_match:
        count = follow_match.group("count")
        label = _localize_request_label(follow_match.group("label"), locale)
        if locale == "en":
            return f"You have {count} {label} request(s) to follow up."
        if locale == "ar":
            return f"لديك {count} طلب {label} للمتابعة."
        return f"Andek {count} demande(s) {label} à suivre."
    request_summary_match = re.match(r"vous avez (?P<count>\d+) demande\(s\) de (?P<label>.+): (?P<pending>\d+) en attente(?: manager)?\.", normalized)
    if request_summary_match:
        count = request_summary_match.group("count")
        pending = request_summary_match.group("pending")
        label = _localize_request_label(request_summary_match.group("label").replace(" d'equipe", ""), locale)
        if locale == "en":
            return f"You have {count} {label} request(s): {pending} pending."
        if locale == "ar":
            return f"لديك {count} طلب {label}: {pending} في الانتظار."
        return f"Andek {count} demande(s) {label}: {pending} en attente."
    authorization_summary_match = re.match(r"vous avez (?P<count>\d+) autorisations: (?P<pending>\d+) en attente(?: manager)?\.", normalized)
    if authorization_summary_match:
        count = authorization_summary_match.group("count")
        pending = authorization_summary_match.group("pending")
        if locale == "en":
            return f"You have {count} authorization request(s): {pending} pending."
        if locale == "ar":
            return f"لديك {count} طلب إذن: {pending} في الانتظار."
        return f"Andek {count} autorisation(s): {pending} en attente."
    document_summary_match = re.match(r"vous avez (?P<count>\d+) demande\(s\) de documents ?: (?P<ready>\d+) prete\(s\)\.", normalized)
    if document_summary_match:
        count = document_summary_match.group("count")
        ready = document_summary_match.group("ready")
        if locale == "en":
            return f"You have {count} document request(s): {ready} ready."
        if locale == "ar":
            return f"لديك {count} طلب وثيقة: {ready} جاهز."
        return f"Andek {count} demande(s) document: {ready} prêt(e)."
    leave_balance_match = re.match(r"il vous reste (?P<days>\d+) jours de conge\.", normalized)
    if leave_balance_match:
        days = leave_balance_match.group("days")
        if locale == "en":
            return f"You have {days} leave days remaining."
        if locale == "ar":
            return f"بقي لديك {days} يوم عطلة."
        return f"Ba9ilek {days} jours congé."
    if normalized.startswith("etat systeme local"):
        suffix = text.split(":", 1)[1].strip() if ":" in text else ""
        if locale == "en":
            return f"Local system status: {suffix}"
        if locale == "ar":
            return f"حالة النظام المحلي: {suffix}"
        return f"Etat système local: {suffix}"
    if normalized.startswith("mode ia:"):
        suffix = text.split(":", 1)[1].strip() if ":" in text else ""
        if locale == "en":
            return f"AI mode: {suffix}"
        if locale == "ar":
            return f"وضع الذكاء الاصطناعي: {suffix}"
        return f"Mode IA: {suffix}"
    manager_pending_match = re.match(r"(?P<count>\d+) demande\(s\) de (?P<label>.+) attendent une decision manager\.", normalized)
    if manager_pending_match:
        count = manager_pending_match.group("count")
        label = _localize_request_label(manager_pending_match.group("label"), locale)
        if locale == "en":
            return f"{count} {label} request(s) are waiting for a manager decision."
        if locale == "ar":
            return f"{count} طلب {label} ينتظر قرار المدير."
        return f"{count} demande(s) {label} yestannaw decision manager."
    if normalized.startswith("donnee indisponible:"):
        suffix = text.split(":", 1)[1].strip() if ":" in text else ""
        return f"{translate('data_unavailable', locale)}: {_localize_section_title(suffix, locale)}"
    localized = KNOWN_TEXT_TRANSLATIONS.get(normalized, {}).get(locale)
    if localized:
        return localized
    if "indisponible" in normalized and "backend" in normalized:
        return translate("backend_unavailable", locale)
    return text


def _localize_request_label(label: str, locale: str) -> str:
    normalized = _text_key(label)
    labels = {
        "conge": {"en": "leave", "ar": "عطلة", "tn": "congé"},
        "conges": {"en": "leave", "ar": "عطلة", "tn": "congé"},
        "teletravail": {"en": "telework", "ar": "عمل عن بعد", "tn": "télétravail"},
        "autorisation": {"en": "authorization", "ar": "إذن", "tn": "autorisation"},
        "document": {"en": "document", "ar": "وثيقة", "tn": "document"},
        "documents": {"en": "document", "ar": "وثيقة", "tn": "document"},
    }
    return labels.get(normalized, {}).get(locale) or label


def _tag_response_language(response: AgentResponse, locale: str) -> None:
    if isinstance(response.actionResult, dict):
        response.actionResult["response_language"] = locale
        response.actionResult["requested_language"] = locale


def _looks_like_unavailable(text: str) -> bool:
    value = (text or "").lower()
    return "pas encore disponible" in value or "indisponible" in value or "capability" in value


def _should_use_generic_backend_unavailable(text: str) -> bool:
    normalized = _text_key(text)
    if not _looks_like_unavailable(text) and not any(term in normalized for term in ("connection", "timeout", "attempt", "unreachable")):
        return False
    if any(
        term in normalized
        for term in (
            "pointage",
            "attendance service",
            "conge",
            "leave",
            "rh",
            "hr",
            "document",
            "teletravail",
            "authorization",
            "autorisation",
            "administration",
            "admin",
            "communication",
        )
    ):
        return False
    return True


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _text_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    return " ".join(ascii_text.strip().lower().split())
