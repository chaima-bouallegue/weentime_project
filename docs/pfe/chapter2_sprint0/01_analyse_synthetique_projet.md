# 1. Analyse synth?tique du projet WEENTIME

## 1.1 Vue d'ensemble

WEENTIME est une plateforme web de gestion RH et de suivi du temps destin?e ? couvrir les processus d'administration d'entreprise, de gestion des collaborateurs, de demandes RH, de pointage, de communication interne et d'assistance intelligente. Le projet adopte une architecture distribu?e : une application Angular pour l'interface utilisateur, plusieurs microservices Spring Boot pour le m?tier, un service FastAPI pour les fonctionnalit?s d'intelligence artificielle, et des composants d'infrastructure tels que PostgreSQL, Redis, Spring Cloud Gateway et Eureka.

L'analyse du d?p?t montre une application orient?e r?les. Les parcours fonctionnels sont organis?s autour de quatre profils principaux : Administrateur, Responsable RH, Manager et Employ?. Chaque profil dispose de pages Angular d?di?es, de routes prot?g?es par guards, et d'un acc?s contr?l? aux services backend via JWT.

## 1.2 Frontend Angular

Le frontend se trouve dans `weentime-frontend/angular-weentime`. Il est structur? autour d'une application Angular standalone organis?e en modules fonctionnels.

| ?l?ment | Observations r?elles |
|---|---|
| Framework | Angular 21, RxJS, Angular Router, Angular Material/CDK, TailwindCSS |
| Routing | `app.routes.ts`, `features/shell/shell.routes.ts`, routes d?di?es communication, r?unions et vocal |
| S?curit? frontend | Guards `auth.guard.ts`, `role.guard.ts`, `admin.guard.ts` ; interceptors JWT, auth, loading et erreurs API |
| Pages Admin | Dashboard, utilisateurs, entreprises, r?les, RH owners, d?partements, ?quipes, analytics, param?tres |
| Pages RH | Dashboard, structure, employ?s, managers, cong?s, absences, autorisations, t?l?travail, documents, horaires, planning, pointage, param?tres |
| Pages Manager | Dashboard, ?quipe, approbations, pr?sence, pointage personnel, t?l?travail, autorisations, horaires |
| Pages Employ? | Dashboard, cong?s, documents, t?l?travail, absences, pointage, autorisations, horaires, profil |
| Communication | Module messages avec channels, messages, pi?ces jointes, r?actions, WebSocket et store local |
| Assistant | `shared/chat-widget` mont? dans le shell authentifi?, service texte `AiCopilotService`, service vocal `VoiceAssistantService` |

Le frontend envoie au service AI un contexte enrichi : r?le courant, identifiant utilisateur, identifiant entreprise, langue, canal, `current_page` et session de conversation. Cette information permet au chatbot d'?tre sensible au contexte de page sans modifier l'autorit? m?tier du backend.

## 1.3 Backend Spring Boot

Le backend est organis? en microservices dans `weentime-backend/services`.

| Microservice | Port observ? | Responsabilit?s principales | Statut |
|---|---:|---|---|
| `auth-service` | 8181 | Authentification, JWT, inscription, 2FA, tokens, cr?ation RH c?t? auth | R?alis? |
| `organisation-service` | 8190 | Entreprises, utilisateurs, r?les, d?partements, ?quipes, notifications organisationnelles | R?alis? |
| `rh-service` | 8192 | Cong?s, soldes, t?l?travail, autorisations, documents RH, r?unions, planning, types RH | R?alis? |
| `presence-service` | 8193 | Pointage, sessions de pr?sence, horaires, affectations horaires, overtime | R?alis? |
| `communication-service` | 8194 | Channels, messages, pi?ces jointes, r?actions, unread, ?v?nements temps r?el | R?alis? |
| `gateway` | 8322 | Routage API, centralisation d'acc?s, s?curit? JWT c?t? gateway | R?alis? |
| `config-server` | 8988 | Configuration centralis?e Spring Cloud | R?alis? |
| `discovery` | 8861 | D?couverte de services Eureka | R?alis? |

Les microservices utilisent Java 17, Spring Boot, Spring Security, JPA, Flyway, PostgreSQL, OpenFeign, Eureka et, pour certains modules, Redis/WebSocket.

## 1.4 AI Service FastAPI

Le service AI est situ? dans `ai-service`. Il expose les routes modernes `/v2/chat`, `/v2/chat/confirm`, `/v2/chat/reset`, `/v2/voice` et `/v2/health/deep`. Il s'agit d'un composant interne qui orchestre les requ?tes utilisateur, mais ne devient jamais source d'autorit? m?tier.

| Sous-module AI | R?le r?el |
|---|---|
| `app/api/chat_v2.py` | Chatbot texte, confirmation d'action, reset de conversation |
| `app/api/voice_v2.py` | Entr?e vocale, transcription, routage, r?ponse textuelle et TTS optionnel |
| `app/agents` | Agents m?tier : attendance, leave, telework, authorization, document, RH, manager, admin, employee, router |
| `app/tools` | ToolRegistry, appels backend v?rifi?s, outils read/write et confirmation des ?critures |
| `app/policy` | RAG RH/politiques avec citations, ChromaDB optionnel et fallback local |
| `voice` | Conversion audio, VAD, STT faster-whisper, TTS Coqui/Piper fallback, nettoyage transcript |
| `app/providers` | Routage LLM local, notamment Ollama/qwen pour reformulation non autoritaire |
| `app/guards` | ResponseGuard, contrats de r?ponse, rejet des r?ponses non s?res |
| `app/observability` | Braintrust, m?triques, traces, redaction des secrets |

Le service AI applique le principe suivant : l'IA peut reformuler, orienter, expliquer ou r?sumer, mais les donn?es r?elles et les actions passent toujours par ToolRegistry et les microservices Spring Boot.

## 1.5 Infrastructure

| Composant | Usage dans WEENTIME |
|---|---|
| PostgreSQL | Base principale des microservices organisation, RH, pr?sence et communication |
| Redis | Temps r?el, cache, sessions ou ?v?nements selon les modules |
| Docker Compose | Support local PostgreSQL/Redis et services backend |
| Spring Cloud Gateway | Point d'entr?e API, routage vers microservices et AI service |
| Eureka Discovery | D?couverte des services Spring |
| Config Server | Centralisation de configuration Spring |
| WebSocket/STOMP | Notifications et communication temps r?el |
| Braintrust | Observabilit? et ?valuation IA |
| ChromaDB | Recherche documentaire/RAG si activ? |

## 1.6 Synth?se technique

L'architecture r?elle de WEENTIME correspond ? une application SaaS RH multi-r?les, construite sur une s?paration nette entre interface, services m?tier et couche AI. Les processus critiques tels que l'authentification, les validations, la gestion des utilisateurs, le pointage, les cong?s et les documents restent contr?l?s par les microservices Spring Boot. Le module AI ajoute une interface conversationnelle et vocale, mais n'ex?cute pas directement les actions sensibles : celles-ci sont pr?par?es puis soumises ? confirmation et ? validation backend.
