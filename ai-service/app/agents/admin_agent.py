from __future__ import annotations

import re
from typing import Any

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import ToolResult
from app.intelligence.admin_digest_builder import AdminDigestBuilder

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin
from .response_composer import compose_read_response


class AdminAgent(ConfirmationMixin, DomainAgent):
    name = "admin"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        if (context.role or "").upper().replace("ROLE_", "") != "ADMIN":
            return 0.0
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        if (context.role or "").upper().replace("ROLE_", "") != "ADMIN":
            return AgentResponse(type="error", text="Votre role ne permet pas les actions admin.", intent="admin.forbidden", confidence=0.95)

        intent, confidence = self.detect_intent(message, context)
        source_text = (
            str(context.metadata.get("original_text") or message)
            if isinstance(context.metadata, dict)
            else message
        )
        if intent == "admin.list_users":
            return await self._read("admin.list_users", {}, context, intent, "Voici les utilisateurs.", confidence)
        if intent == "admin.list_enterprises":
            return await self._read("admin.list_enterprises", {}, context, intent, "Voici les entreprises.", confidence)
        if intent == "admin.misconfigured_users":
            return await self._read("admin.misconfigured_users", {}, context, intent, "Voici les utilisateurs potentiellement mal configures.", confidence)
        if intent == "admin.system_health":
            return await self._read("admin.system_health", {}, context, intent, "Etat systeme minimal disponible.", confidence)
        if intent == "admin.provider_status":
            return await self._read("admin.provider_status", {}, context, intent, "Etat du fournisseur IA.", confidence)
        if intent == "admin.redis_status":
            return await self._read("admin.redis_status", {}, context, intent, "Etat Redis.", confidence)
        if intent == "admin.braintrust_status":
            return await self._read("admin.braintrust_status", {}, context, intent, "Etat Braintrust.", confidence)
        if intent == "admin.rag_status":
            return await self._read("admin.rag_status", {}, context, intent, "Etat RAG.", confidence)
        if intent == "admin.tenant_issues":
            return await self._read(
                "admin.misconfigured_users",
                {},
                context,
                intent,
                "Voici les problemes de configuration tenant detectes.",
                confidence,
            )
        if intent == "admin.summary":
            return await self._summary(context, intent=intent, confidence=confidence)
        if intent == "admin.help_create_user":
            is_en = _is_english(source_text)
            text = (
                "To create a user in WeenTime:\n\n"
                "1. 💻 Via the Web Interface:\n"
                "   • Go to Administration > Users.\n"
                "   • Click '+ New User'.\n"
                "   • Fill in first name, last name, email, password (min 8 chars), and role (ADMIN, RH, MANAGER, EMPLOYEE).\n"
                "   • Click Save.\n\n"
                "2. 🎙️ Directly with the Copilot:\n"
                "   • Tell me or write: 'Create user first name Karim last name Ben Salem email karim@test.com password Secret123 role EMPLOYEE company 1'.\n\n"
                "💡 Would you like me to create a user for you right now?"
                if is_en else
                "Pour créer un utilisateur dans WeenTime :\n\n"
                "1. 💻 Dans l'interface web :\n"
                "   • Rendez-vous dans le menu « Administration » > « Utilisateurs ».\n"
                "   • Cliquez sur le bouton « + Nouvel utilisateur » en haut à droite.\n"
                "   • Renseignez prénom, nom, email, mot de passe (min. 8 caractères) et attribuez le rôle (Admin, RH, Manager ou Employé).\n"
                "   • Cliquez sur « Enregistrer ».\n\n"
                "2. 🎙️ Directement avec moi (Copilote) :\n"
                "   • Vous pouvez simplement me dire ou m'écrire :\n"
                "     « Crée un utilisateur prénom Karim nom Ben Salem email karim@test.com mot de passe Test12345 rôle EMPLOYEE entreprise 1 ».\n\n"
                "💡 Souhaitez-vous que je crée un utilisateur pour vous dès maintenant ?"
            )
            return AgentResponse(type="answer", text=text, intent=intent, confidence=confidence)
        if intent == "admin.help_create_enterprise":
            is_en = _is_english(source_text)
            text = (
                "To create a company in WeenTime, you have two options:\n\n"
                "From the interface\n\n"
                "Go to Administration > Companies.\n"
                "Click '+ New Company'.\n"
                "Fill in the required information.\n"
                "Click 'Save'.\n\n"
                "With the Copilot\n\n"
                "You can also ask me directly to create a company, for example:\n"
                "'Create a company Carthage, sector IT, with SIRET 12345678901234.'\n\n"
                "I will verify the necessary information before proceeding.\n\n"
                "Would you like me to help you create a company now?"
                if is_en else
                "Pour créer une entreprise dans WeenTime, vous pouvez procéder de deux façons :\n\n"
                "Depuis l'interface\n\n"
                "Accédez à Administration → Entreprises.\n"
                "Cliquez sur « + Nouvelle entreprise ».\n"
                "Renseignez les informations demandées.\n"
                "Cliquez sur « Enregistrer ».\n\n"
                "Avec le Copilote\n\n"
                "Vous pouvez aussi me demander directement de créer l'entreprise, par exemple :\n"
                "« Crée une entreprise Carthage, secteur Informatique, avec le SIRET 12345678901234. »\n\n"
                "Je vérifierai les informations nécessaires avant de procéder à la création.\n\n"
                "Souhaitez-vous que je vous accompagne pour créer une entreprise maintenant ?"
            )
            return AgentResponse(type="answer", text=text, intent=intent, confidence=confidence)
        if intent == "admin.create_enterprise":
            payload = self._extract_create_enterprise(source_text)
            missing = [label for label, value in {
                "nom": payload.get("nom"),
                "siret": payload.get("siret"),
            }.items() if not value]
            if missing:
                is_en = _is_english(source_text)
                labels_fr = {"nom": "nom de l'entreprise", "siret": "SIRET (14 chiffres)"}
                labels_en = {"nom": "company name", "siret": "SIRET (14 digits)"}
                labels = labels_en if is_en else labels_fr
                missing_labels = ", ".join(labels.get(k, k) for k in missing)
                prompt = f"To create a company, I need: {missing_labels}." if is_en else f"Pour creer une entreprise, il me faut : {missing_labels}."
                return AgentResponse(
                    type="ask",
                    text=prompt,
                    intent=intent,
                    confidence=confidence,
                )
            is_en = _is_english(source_text)
            confirm_text = (
                f"Do you confirm the creation of company '{payload['nom']}' (SIRET {payload['siret']})?"
                if is_en else
                f"Confirmez-vous la creation de l'entreprise '{payload['nom']}' (SIRET {payload['siret']}) ?"
            )
            return self.confirmation_response(
                context=context,
                tool_name="admin.create_enterprise",
                tool_input=payload,
                intent=intent,
                text=confirm_text,
                confidence=confidence,
            )
        if intent == "admin.create_user":
            is_en = _is_english(source_text)
            payload = self._extract_create_user(source_text)
            missing = [label for label, value in payload.items() if label in {"first_name", "last_name", "email", "password", "role", "company_id"} and value in (None, "")]
            if missing:
                ask_text = (
                    "To create a user, I need first name, last name, email, password (min 8 chars), role (ADMIN, RH, MANAGER, EMPLOYEE) and company."
                    if is_en else
                    "Pour créer un utilisateur, il me faut prénom, nom, email, mot de passe (min 8 caractères), rôle (ADMIN, RH, MANAGER, EMPLOYEE) et entreprise."
                )
                return AgentResponse(
                    type="ask",
                    text=ask_text,
                    intent=intent,
                    confidence=confidence,
                )
            confirm_text = (
                f"Do you confirm the creation of user '{payload['first_name']} {payload['last_name']}' (role: {payload['role']}, company: {payload['company_id']}, email: {payload['email']})?"
                if is_en else
                f"Confirmez-vous la création de l'utilisateur '{payload['first_name']} {payload['last_name']}' (rôle: {payload['role']}, entreprise: {payload['company_id']}, email: {payload['email']}) ?"
            )
            return self.confirmation_response(
                context=context,
                tool_name="admin.create_user",
                tool_input=payload,
                intent=intent,
                text=confirm_text,
                confidence=confidence,
            )
        if intent == "admin.update_role":
            user_id = _extract_int_after(source_text, ("user", "utilisateur", "id"))
            role = _extract_role(source_text)
            if not user_id or not role:
                return AgentResponse(type="ask", text="Precisez l'identifiant utilisateur et le nouveau role.", intent=intent, confidence=confidence)
            return self.confirmation_response(
                context=context,
                tool_name="admin.update_user_role",
                tool_input={"user_id": user_id, "role": role},
                intent=intent,
                text=f"Confirmez-vous le remplacement du role par {role} ?",
                confidence=confidence,
            )
        if intent == "admin.assign_manager":
            user_id = _extract_int_after(source_text, ("user", "utilisateur", "employee", "employe"))
            manager_id = _extract_int_after(source_text, ("manager", "responsable"))
            if not user_id or not manager_id:
                return AgentResponse(type="ask", text="Precisez l'identifiant utilisateur et l'identifiant manager.", intent=intent, confidence=confidence)
            return self.confirmation_response(
                context=context,
                tool_name="admin.assign_manager",
                tool_input={"user_id": user_id, "manager_id": manager_id},
                intent=intent,
                text="Confirmez-vous cette assignation manager ?",
                confidence=confidence,
            )
        if intent == "admin.assign_rh":
            rh_user_id = _extract_int_after(source_text, ("rh", "hr"))
            entreprise_id = _extract_int_after(source_text, ("entreprise", "company"))
            if not rh_user_id or not entreprise_id:
                return AgentResponse(type="ask", text="Precisez l'identifiant RH et l'identifiant entreprise.", intent=intent, confidence=confidence)
            return self.confirmation_response(
                context=context,
                tool_name="admin.assign_rh_owner",
                tool_input={"rh_user_id": rh_user_id, "entreprise_id": entreprise_id},
                intent=intent,
                text="Confirmez-vous cette assignation RH a l'entreprise ?",
                confidence=confidence,
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous administrer ?", intent="admin.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if _has_arabic(text):
            if any(term in text for term in ("حالة النظام", "حاله النظام", "النظام")):
                return "admin.system_health", 0.94
            if "ريديس" in text:
                return "admin.redis_status", 0.93
            if "براينترست" in text:
                return "admin.braintrust_status", 0.93
            if any(term in text for term in ("كروم", "كروما", "راغ")):
                return "admin.rag_status", 0.9
            if any(term in text for term in ("المستخدم", "مستخدم")):
                return "admin.list_users", 0.86
            if any(term in text for term in ("الشركات", "شركة", "مؤسسة")):
                return "admin.list_enterprises", 0.86
            return "admin.summary", 0.84
        is_how_to = any(p in text for p in (
            "comment", "how to", "how do i", "how can i", "comment faire",
            "procedure", "procédure", "guide", "tuto", "explication", "explique",
            "aide moi a creer", "aide moi à créer", "aide moi a crier", "aide moi à crier",
            "ou creer", "où créer", "ou crier", "où crier", "ou puis-je", "où puis-je"
        ))
        if is_how_to:
            if any(term in text for term in ("utilisateur", "user", "employe", "employé", "collaborateur", "compte", "profil")):
                return "admin.help_create_user", 0.98
            if any(term in text for term in ("entreprise", "company", "société", "societe", "tenant")):
                return "admin.help_create_enterprise", 0.98

        user_action = any(p in text for p in (
            "cree un utilisateur", "crée un utilisateur", "creer un utilisateur", "créer un utilisateur", "crier un utilisateur",
            "cree utilisateur", "crée utilisateur", "crier utilisateur", "create user", "create a user",
            "nouvel utilisateur", "new user", "ajoute un utilisateur", "ajouter un utilisateur", "add user", "add a user"
        ))
        comp_action = any(p in text for p in (
            "cree une entreprise", "crée une entreprise", "creer une entreprise", "créer une entreprise", "crier une entreprise",
            "cree entreprise", "crée entreprise", "crier entreprise", "create company", "create a company",
            "nouvelle entreprise", "new company", "ajoute une entreprise", "ajouter une entreprise",
            "add company", "add a company", "cree une societe", "crée une société", "creer une societe", "créer une société"
        ))
        if user_action:
            return "admin.create_user", 0.95
        if comp_action:
            return "admin.create_enterprise", 0.95

        has_create = any(term in text for term in ("cree", "creer", "créer", "crier", "create", "add", "ajoute", "ajouter"))
        has_user = any(term in text for term in ("utilisateur", "user", "employe", "employé", "collaborateur"))
        has_comp = any(term in text for term in ("entreprise", "company", "société", "societe"))
        has_siret = any(term in text for term in ("siret", "siré", "ciré", "siren"))
        has_user_fields = any(term in text for term in ("role", "rôle", "mdp", "password", "mot de passe"))

        if has_siret and has_comp:
            return "admin.create_enterprise", 0.93
        if has_create and has_user and (has_user_fields or not has_siret):
            return "admin.create_user", 0.93
        if has_create and has_comp:
            return "admin.create_enterprise", 0.93
        if any(term in text for term in ("role", "rôle")) and any(term in text for term in ("change", "changer", "update", "modifier", "remplace", "replace")):
            return "admin.update_role", 0.92
        if any(term in text for term in ("assign", "assigner", "assigne", "affecte")) and any(term in text for term in ("manager", "responsable")):
            return "admin.assign_manager", 0.92
        if any(term in text for term in ("assign", "assigner", "assigne", "affecte")) and any(term in text for term in ("rh", "hr")):
            return "admin.assign_rh", 0.91
        if any(term in text for term in ("mal configure", "mal configures", "misconfigured")):
            return "admin.misconfigured_users", 0.91
        if any(term in text for term in ("tenant configuration", "configuration tenant", "tenant issues", "configuration entreprise")):
            return "admin.tenant_issues", 0.93
        if any(term in text for term in ("ai provider", "fournisseur ia", "provider status", "etat provider", "etat du provider", "ollama status", "ollama")):
            return "admin.provider_status", 0.93
        if "redis" in text and any(term in text for term in ("status", "etat", "sante", "health")):
            return "admin.redis_status", 0.93
        if "redis" in text:
            return "admin.redis_status", 0.88
        if "braintrust" in text:
            return "admin.braintrust_status", 0.93
        if "rag" in text or "chroma" in text:
            return "admin.rag_status", 0.9
        if any(term in text for term in ("utilisateurs", "users", "show users", "liste users", "lister utilisateurs", "liste utilisateurs")):
            return "admin.list_users", 0.88
        if any(term in text for term in ("entreprises", "companies", "company list", "lister entreprises", "liste entreprises")):
            return "admin.list_enterprises", 0.88
        if any(term in text for term in ("system health", "sante systeme", "santé système", "etat systeme", "état systeme", "etat backend", "backend status", "platform status", "platform statut", "etat plateforme", "état plateforme")):
            return "admin.system_health", 0.93
        if any(term in text for term in ("health", "sante")):
            return "admin.system_health", 0.86
        if any(term in text for term in ("resume systeme", "system summary", "dashboard admin", "systeme", "que dois-je verifier")):
            return "admin.summary", 0.97
        return None, 0.0

    async def _read(self, tool_name: str, payload: dict[str, Any], context: CurrentUserContext, intent: str, fallback_text: str, confidence: float) -> AgentResponse:
        result = await self.executor.execute(tool_name, payload, context)
        response = compose_read_response(intent, result, fallback_text=fallback_text, confidence=confidence)
        response.toolCalls = [ToolCallRecord(name=tool_name, arguments=payload, status="success" if result.success else "failed")]
        return response

    async def _summary(self, context: CurrentUserContext, *, intent: str, confidence: float) -> AgentResponse:
        digest = await AdminDigestBuilder(self.executor).build_digest(context)
        action = digest.to_dict()
        action["kind"] = "role_summary"
        action["agent"] = "AdminAgent"
        lines = ["Resume systeme administrateur."]
        for section in action.get("sections", [])[:6]:
            if isinstance(section, dict):
                lines.append(f"- {section.get('title')}: {section.get('summary')}")
        diagnostics = action.get("reminders") if isinstance(action.get("reminders"), list) else []
        if diagnostics:
            lines.append("Diagnostics:")
            lines.extend(
                f"- {item.get('title')}: {item.get('summary')}"
                for item in diagnostics[:5]
                if isinstance(item, dict)
            )
        if action.get("warnings"):
            lines.append("Certaines sections admin sont indisponibles; le resume reste partiel.")
        return AgentResponse(
            type="answer",
            text="\n".join(lines),
            intent=intent,
            confidence=confidence,
            toolCalls=digest.tool_calls,
            actionResult=action,
        )

    @staticmethod
    def _extract_create_enterprise(message: str) -> dict[str, Any]:
        text = message or ""
        # Nom: after "entreprise", "company", "named", "called", "nom"
        nom_match = re.search(
            r"(?:nom(?:\s+de\s+l['’]entreprise)?|entreprise|company|société|societe|named|called)\s+(?:c['’]est|est|soit|:)?\s*([A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ &'-]*?)(?:\s*[,;.]|\s+(?:siret|siré|ciré|siren|email|telephone|tel|phone|secteur|sector|industry|adresse|address|location|max|site|website|with)|$)",
            text, flags=re.IGNORECASE,
        )
        nom = nom_match.group(1).strip() if nom_match else None
        if nom:
            nom = re.sub(r"^(?:c['’]est|c est|est|soit|nommée|nommee|nomme|named|called)\s+", "", nom, flags=re.IGNORECASE).strip()
            if nom.lower() in {"de l'entreprise", "de l entreprise", "l'entreprise", "l entreprise"}:
                nom = None

        # SIRET: 14 digits (consécutifs ou séparés par des espaces/virgules énoncés à l'oral)
        siret = None
        siret_match = re.search(r"(?:siret|siré|ciré|siren)?\s*[:=]?\s*\b(\d{14})\b", text, flags=re.IGNORECASE)
        if siret_match and siret_match.group(1):
            siret = siret_match.group(1)
        else:
            # Recherche après mot-clé de chiffres espacés
            siret_seq = re.search(r"(?:siret|siré|ciré|siren)\s*(?:c['’]est|est|:)?\s*([\d\s,.-]{14,50})", text, flags=re.IGNORECASE)
            if siret_seq:
                digits = re.sub(r"\D", "", siret_seq.group(1))
                if len(digits) == 14:
                    siret = digits
                elif len(digits) > 14:
                    siret = digits[:14]
            if not siret:
                all_digits = re.sub(r"\D", "", text)
                if len(all_digits) == 14:
                    siret = all_digits

        # Email
        email_match = re.search(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", text)
        email = email_match.group(0) if email_match else None
        # Telephone
        tel_match = re.search(r"(?:telephone|tel|phone)\s+(\+?[\d\s.-]{8,15})", text, flags=re.IGNORECASE)
        telephone = tel_match.group(1).strip() if tel_match else None
        # Adresse
        addr_match = re.search(r"(?:adresse|address|location)\s+(.+?)(?:\s*[,;]|\s+(?:siret|email|telephone|tel|phone|secteur|sector|industry|max|site|website)|$)", text, flags=re.IGNORECASE)
        adresse = addr_match.group(1).strip() if addr_match else None
        # Secteur
        sect_match = re.search(r"(?:secteur|sector|industry)\s+([A-Za-z0-9À-ÿ &'-]+?)(?:\s*[,;.]|\s+(?:siret|email|telephone|tel|phone|adresse|address|location|max|site|website)|$)", text, flags=re.IGNORECASE)
        secteur = sect_match.group(1).strip() if sect_match else None
        # Max users
        max_match = re.search(r"(?:max|maximum|limite|up\s+to|limit)\s+(\d+)\s*(?:utilisateur|user|employe|employee|member|person|people)?s?", text, flags=re.IGNORECASE)
        max_users = int(max_match.group(1)) if max_match else None
        # Site web
        site_match = re.search(r"(?:site(?:\s+web)?|website)\s+(https?://[^\s,;]+|www\.[^\s,;]+)", text, flags=re.IGNORECASE)
        site_web = site_match.group(1).strip() if site_match else None
        result = {
            "nom": nom,
            "siret": siret,
        }
        if email:
            result["email"] = email
        if telephone:
            result["telephone"] = telephone
        if adresse:
            result["adresse"] = adresse
        if secteur:
            result["secteur"] = secteur
        if max_users:
            result["max_users"] = max_users
        if site_web:
            result["site_web"] = site_web
        return result

    @staticmethod
    def _extract_create_user(message: str) -> dict[str, Any]:
        text = message or ""
        email_match = re.search(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", text)
        email = email_match.group(0) if email_match else None
        role = _extract_role(text)
        lower = text.lower()
        if any(term in lower for term in ("it serv", "itserv", "it-serv")):
            company_id = 2
        else:
            comp_match = re.search(r"(?:company|entreprise|societe|société)\s*(?:id)?\s*[:=]?\s*(\d+)", text, flags=re.IGNORECASE)
            company_id = int(comp_match.group(1)) if comp_match else _extract_int_after(text, ("company", "entreprise", "societe", "société"))

        password_match = re.search(r"(?:password|mot de passe|mdp)\s+([^\s,;]+)", text, flags=re.IGNORECASE)
        password = password_match.group(1) if password_match else None

        fn_match = re.search(r"\b(?:prenom|prénom|first[\s_]?name)\s*[:=]?\s*([A-Za-zÀ-ÿ'-]+)", text, flags=re.IGNORECASE)
        ln_match = re.search(r"\b(?:nom|last[\s_]?name)\b\s*[:=]?\s*([A-Za-zÀ-ÿ'-]+)", text, flags=re.IGNORECASE)
        if fn_match:
            first_name = fn_match.group(1)
            last_name = ln_match.group(1) if ln_match else "Utilisateur"
        else:
            name_match = re.search(
                r"(?:pour|for|user|utilisateur)\s+([A-Za-zÀ-ÿ'-]+(?:\s+[A-Za-zÀ-ÿ'-]+)*?)(?:\s*[,;]|\s+(?:email|mot\s+de\s+passe|mdp|password|role|rôle|entreprise|company)|$)",
                text,
                flags=re.IGNORECASE,
            )
            if name_match:
                parts = name_match.group(1).strip().split()
                first_name = parts[0]
                last_name = " ".join(parts[1:]) if len(parts) > 1 else "Utilisateur"
            else:
                first_name = None
                last_name = None

        return {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "password": password,
            "role": role,
            "status": "ACTIVE",
            "company_id": company_id,
        }


def _extract_role(message: str) -> str | None:
    text = (message or "").upper().replace("ROLE_", "")
    for role in ("ADMIN", "RH", "MANAGER", "EMPLOYEE"):
        if role in text:
            return role
    if "EMPLOYE" in text or "EMPLOYEE" in text:
        return "EMPLOYEE"
    return None


def _extract_int_after(message: str, markers: tuple[str, ...]) -> int | None:
    text = message or ""
    for marker in markers:
        match = re.search(rf"{re.escape(marker)}\D+(\d+)", text, flags=re.IGNORECASE)
        if match:
            return int(match.group(1))
    numbers = re.findall(r"\d+", text)
    return int(numbers[0]) if len(numbers) == 1 else None


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)


def _is_english(value: str) -> bool:
    text = (value or "").lower()
    en_markers = ("create", "company", "named", "called", "with", "employees", "users", "sector", "address", "website", "confirm", "please")
    fr_markers = ("crée", "créer", "cree", "creer", "entreprise", "société", "societe", "utilisateur", "secteur", "adresse", "confirmez")
    en_count = sum(1 for m in en_markers if m in text)
    fr_count = sum(1 for m in fr_markers if m in text)
    return en_count > fr_count
