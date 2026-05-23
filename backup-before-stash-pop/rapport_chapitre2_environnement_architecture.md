# Rapport Chapitre 2 - Environnement et architecture WEENTIME

## 1. Resume des elements detectes

L'analyse du depot `C:\Users\DELL\Documents\GitHub\weentime_project` met en evidence une plateforme web RH composee d'un frontend Angular, d'un backend Spring Boot en microservices, d'un service IA FastAPI, d'un service ML FastAPI et de composants d'infrastructure locaux.

| Element | Detection dans le depot | Fichiers preuves |
|---|---|---|
| Frontend | Application Angular `angular-weentime`, Angular 21, TypeScript 5.9, RxJS, Angular Router, Angular Material/CDK, TailwindCSS, STOMP/SockJS | `weentime-frontend/angular-weentime/package.json`, `angular.json`, `src/environments/*.ts` |
| Backend | Microservices Spring Boot : `auth-service`, `organisation-service`, `rh-service`, `presence-service`, `communication-service`, `gateway`, `config-server`, `discovery` | `weentime-backend/services/*/pom.xml`, `weentime-backend/services/*/src/main/resources/application.yml` |
| Infrastructure | PostgreSQL, Redis, pgAdmin, MailDev, Docker Compose | `weentime-backend/docker-compose.yml`, `docker-compose.redis.yml` |
| Gateway et ports | Gateway `8322`, Config Server `8988`, Discovery `8861`, services `8181`, `8190`, `8192`, `8193`, `8194` | `application.yml` des services Spring Boot |
| AI service | FastAPI sur `8000`, chat, vocal, STT/TTS, RAG, ChromaDB, ToolRegistry, agents metier, Braintrust, Redis events, Ollama | `ai-service/requirements.txt`, `ai-service/config.py`, `ai-service/main.py`, `ai-service/app/*` |
| ML service | FastAPI sur `8001`, scikit-learn, pandas, SQLAlchemy, psycopg2, routes d'anomalies et d'approbation | `ml-service/requirements.txt`, `ml-service/app/main.py` |
| Documentation PFE | PlantUML/draw.io, LaTeX/Overleaf, Postman, GitHub, Docker Compose mentionnes dans les documents PFE | `docs/pfe/chapter2_sprint0/08_environnement_developpement.md`, `01_analyse_synthetique_projet.md` |

Remarque : aucun README global a la racine du depot actif n'a ete confirme. Les README detectes concernent notamment les donnees IA et les documents PFE.

## 2. Section Markdown structuree

## 2.7 Environnement de developpement

L'environnement de developpement de WEENTIME s'appuie sur un ensemble d'outils adaptes au developpement web, aux microservices Java, aux services Python/FastAPI et a l'integration locale des composants d'infrastructure. Les informations ci-dessous proviennent uniquement des fichiers presents dans le depot.

### 2.7.1 Environnement materiel

Les caracteristiques materielles exactes de la machine de developpement ne sont pas stockees dans le depot. Les documents PFE existants indiquent toutefois un environnement de travail Windows et mentionnent que le service IA est prevu pour fonctionner en mode CPU local.

| Element materiel | Information retenue | Preuve |
|---|---|---|
| Poste de developpement | Ordinateur de developpement sous Windows | `docs/pfe/chapter2_sprint0/08_environnement_developpement.md` |
| Processeur | non confirmé dans le dépôt | Aucun fichier materiel detecte |
| Memoire RAM | non confirmé dans le dépôt | Aucun fichier materiel detecte |
| GPU | non confirmé dans le dépôt ; le service IA configure un mode CPU local par defaut | `ai-service/config.py` |
| Stockage | non confirmé dans le dépôt | Aucun fichier materiel detecte |

### 2.7.2 Environnement logiciel

L'environnement logiciel regroupe les outils de conception, de redaction, de test, d'integration, de stockage et les technologies de developpement detectees dans le projet.

#### 2.7.2.1 Outils de conception

| Outil | Statut | Utilisation dans le projet | Fichiers preuves |
|---|---|---|---|
| UML | Confirme | Modelisation de l'analyse et de l'architecture | `docs/pfe/chapter2_sprint0/05_uml_global.md`, `06_uml_par_sprint.md` |
| PlantUML / draw.io | Confirme dans les documents PFE | Production ou export de diagrammes UML et figures du rapport | `docs/pfe/chapter2_sprint0/08_environnement_developpement.md` |
| Jira Software | Mentionne, usage effectif non confirmé dans le dépôt | Pilotage agile possible, indique avec reserve dans les documents PFE | `docs/pfe/chapter2_sprint0/08_environnement_developpement.md` |
| Figma | non confirmé dans le dépôt | Aucun usage direct detecte | Recherche dans le depot |

#### 2.7.2.2 Outils de redaction

| Outil | Statut | Utilisation dans le projet | Fichiers preuves |
|---|---|---|---|
| LaTeX | Confirme dans les documents PFE | Mise en forme finale du rapport PFE | `docs/pfe/chapter2_sprint0/00_README_ordre_integration.md`, `08_environnement_developpement.md` |
| Overleaf | Confirme dans les documents PFE | Redaction et compilation possibles du rapport | `docs/pfe/chapter2_sprint0/08_environnement_developpement.md` |
| Markdown | Confirme | Documentation technique et rapports intermediaires | Fichiers `*.md` a la racine et dans `docs/pfe` |
| Prism | non confirmé dans le dépôt | Aucun usage direct detecte | Recherche dans le depot |

#### 2.7.2.3 Outils de tests et integration

| Outil / technologie | Statut | Role dans le projet | Fichiers preuves |
|---|---|---|---|
| Postman | Confirme dans les documents PFE | Tests manuels des APIs REST | `docs/pfe/chapter2_sprint0/08_environnement_developpement.md` |
| Swagger / OpenAPI | Confirme | Documentation et test des endpoints via `springdoc-openapi` | POM des services Spring Boot, `gateway/src/main/resources/application.yml` |
| Git / GitHub | Confirme dans les documents PFE et depot Git local | Gestion de versions et collaboration | `.git`, `docs/pfe/chapter2_sprint0/08_environnement_developpement.md` |
| Docker / Docker Compose | Confirme | Lancement local de PostgreSQL, Redis, pgAdmin et MailDev | `weentime-backend/docker-compose.yml`, `docker-compose.redis.yml` |
| Maven | Confirme | Build et gestion des dependances backend Java | `pom.xml` des microservices Spring Boot |
| npm / Angular CLI | Confirme | Installation, build, test et execution du frontend | `weentime-frontend/angular-weentime/package.json`, `angular.json` |
| Pytest | Confirme | Tests du service IA et du service ML | `ai-service/requirements-dev.txt`, `ml-service/requirements.txt`, dossiers `tests` |
| Vitest | Confirme dans le frontend | Tests frontend selon les dependances declarees | `weentime-frontend/angular-weentime/package.json` |
| Logs applicatifs | Confirme | Suivi d'execution via configurations `logging` | `application.yml` des services Spring Boot, `ai-service/config.py` |

#### 2.7.2.4 Systeme de Gestion de bases de Donnees

| Systeme | Statut | Usage dans WEENTIME | Fichiers preuves |
|---|---|---|---|
| PostgreSQL | Confirme | Base principale des microservices organisation, RH, presence et communication | `weentime-backend/docker-compose.yml`, `application.yml` des services metier |
| Redis | Confirme | Cache, evenements et temps reel selon les modules | `docker-compose.redis.yml`, `weentime-backend/docker-compose.yml`, POM/config Spring, `ai-service/config.py` |
| ChromaDB | Confirme | Stockage vectoriel local pour le RAG du service IA | `ai-service/requirements.txt`, `ai-service/config.py`, `ai-service/storage/chroma` |
| H2 | Confirme pour tests | Base embarquee de test dans certains microservices | POM des services Spring Boot |
| pgAdmin | Confirme | Administration visuelle de PostgreSQL en local | `weentime-backend/docker-compose.yml` |
| MailDev | Confirme, non SGBD | Outil de test mail local | `weentime-backend/docker-compose.yml` |
| MinIO | Configuration presente, non SGBD | Stockage objet configure pour les justificatifs RH | `rh-service/src/main/resources/application.yml`, `PresignedUrlResponse.java` |

#### 2.7.2.5 Technologies utilisees

| Couche | Technologies confirmees | Fichiers preuves |
|---|---|---|
| Frontend | Angular 21, TypeScript 5.9, RxJS, Angular Router, Angular Material/CDK, TailwindCSS, STOMP/SockJS, JWT interceptors | `weentime-frontend/angular-weentime/package.json`, `src/app/core/interceptors`, `src/environments/*.ts` |
| Backend Java | Java 17, Spring Boot 3.4.0, Spring Security, Spring Data JPA, Spring Web, Spring WebSocket, Maven, Lombok, MapStruct | POM des services Spring Boot |
| Architecture microservices | Spring Cloud Gateway, Spring Cloud Config Server, Eureka Discovery, OpenFeign, Resilience4j | POM et `application.yml` des services |
| Donnees | PostgreSQL, Flyway, Redis, H2 pour tests | `docker-compose.yml`, POM et `application.yml` des services |
| API et documentation | REST, Swagger/OpenAPI via springdoc | Controllers Java, POM, configuration Swagger du gateway |
| Temps reel | WebSocket, STOMP, SockJS, Redis events | POM Spring WebSocket, configs WebSocket, package Angular `@stomp/rx-stomp` |
| AI service | Python, FastAPI, Uvicorn, Pydantic, httpx, ToolRegistry, agents metier, ResponseGuard | `ai-service/requirements.txt`, `main.py`, `app/tools`, `app/agents`, `app/guards` |
| Vocal IA | faster-whisper, ctranslate2, webrtcvad, pydub, imageio-ffmpeg, TTS | `ai-service/requirements.txt`, `ai-service/voice` |
| RAG et LLM | RAG, ChromaDB, Ollama, modeles `qwen2.5:3b`, `qwen2.5-coder:3b-instruct`, fallback `phi3` | `ai-service/config.py`, `app/policy`, `app/providers` |
| Observabilite IA | Braintrust, traces, redaction de secrets | `ai-service/requirements.txt`, `app/observability` |
| ML service | FastAPI, scikit-learn, pandas, NumPy, SQLAlchemy, psycopg2, joblib | `ml-service/requirements.txt`, `ml-service/app/main.py` |

## 2.8 Architecture logicielle du projet

L'architecture logicielle de WEENTIME est organisee autour d'une separation claire entre l'interface utilisateur, les services metier, les services d'intelligence artificielle et les composants d'infrastructure.

Le frontend Angular situe dans `weentime-frontend/angular-weentime` constitue la couche presentation. Il regroupe les espaces fonctionnels `admin`, `rh`, `manager`, `employee`, `communication`, `presence` et `vocal`. Il communique avec le backend principalement a travers le Spring Cloud Gateway expose sur `http://localhost:8322/api/v1`, comme le montrent les fichiers `src/environments/*.ts`.

Le backend est constitue de plusieurs microservices Spring Boot. Le `gateway` route les requetes vers les services metier : `auth-service` pour l'authentification et les jetons JWT, `organisation-service` pour les entreprises, utilisateurs, roles et structures, `rh-service` pour les conges, documents, autorisations, teletravail, reunions et planning RH, `presence-service` pour le pointage et les horaires, et `communication-service` pour les canaux, messages, pieces jointes et evenements temps reel. Le `config-server` centralise la configuration Spring Cloud et `discovery` fournit un serveur Eureka, meme si plusieurs fichiers locaux indiquent que l'enregistrement Eureka est desactive en mode local.

La persistance metier repose principalement sur PostgreSQL. Les bases detectees dans les configurations sont notamment `organisation_db`, `rh_db`, `presence_db` et `communication_db`. Redis est present dans Docker Compose et dans les configurations de certains modules pour les mecanismes de cache, d'evenements ou de temps reel. Le projet utilise aussi Flyway pour les migrations de schema et H2 dans certains contextes de test.

Le service IA `ai-service` est un service FastAPI separe expose par defaut sur le port `8000`. Il fournit des endpoints de chat, de voix, de sante, de generation de documents, ainsi qu'un pipeline vocal. La configuration confirme l'utilisation de STT avec `faster-whisper`, VAD avec `webrtcvad`, TTS via le paquet `TTS`, RAG avec ChromaDB ou un fallback local, et un routage LLM local base sur Ollama. Les agents et outils sont organises autour de `app/agents`, `app/tools`, `app/policy`, `app/providers`, `app/guards` et `voice`. Le `ToolRegistry` controle l'acces aux outils selon le role, les permissions, le contexte utilisateur et la confirmation des actions sensibles.

Le service `ml-service` est egalement un service FastAPI. Il expose des routes liees a la detection d'anomalies et a l'approbation, et utilise des bibliotheques de machine learning telles que scikit-learn, pandas, NumPy et joblib.

| Service / module | Type | Port / endpoint detecte | Responsabilite principale | Preuves |
|---|---|---:|---|---|
| `weentime-frontend/angular-weentime` | Frontend Angular | `4200` selon CORS gateway | Interface utilisateur multi-roles | `package.json`, `angular.json`, `src/app/features` |
| `gateway` | Spring Cloud Gateway | `8322` | Point d'entree API, routage REST et WebSocket | `gateway/src/main/resources/application.yml` |
| `config-server` | Spring Cloud Config | `8988` | Configuration centralisee | `config-server/src/main/resources/application.yml` |
| `discovery` | Eureka Server | `8861` | Decouverte de services | `discovery/pom.xml`, `discovery/application.yml` |
| `auth-service` | Spring Boot | `8181` | Authentification, JWT, 2FA, mail | `auth-service/pom.xml`, `auth-service/application.yml` |
| `organisation-service` | Spring Boot | `8190` | Organisation, utilisateurs, roles, notifications | `organisation-service/pom.xml`, `application.yml`, packages Java |
| `rh-service` | Spring Boot | `8192` | Conges, teletravail, autorisations, documents, reunions, planning | `rh-service/pom.xml`, `application.yml`, packages Java |
| `presence-service` | Spring Boot | `8193` | Pointage, presence, horaires | `presence-service/pom.xml`, `application.yml`, packages Java |
| `communication-service` | Spring Boot | `8194` | Messagerie, canaux, pieces jointes, WebSocket | `communication-service/pom.xml`, `application.yml`, packages Java |
| `ai-service` | FastAPI | `8000` | Chatbot, vocal, RAG, ToolRegistry, agents IA | `ai-service/main.py`, `requirements.txt`, `config.py` |
| `ml-service` | FastAPI | `8001` | Detection d'anomalies et approbation ML | `ml-service/app/main.py`, `requirements.txt` |
| PostgreSQL | SGBD | `5435:5432` dans Docker Compose ; services configures aussi sur `5433` | Persistance metier | `weentime-backend/docker-compose.yml`, `application.yml` |
| Redis | Cache / events | `6380:6379` et `6379:6379` selon compose | Cache, evenements, temps reel | `weentime-backend/docker-compose.yml`, `docker-compose.redis.yml` |

### 2.8.1 Modele de conception Backend (MVC)

Les microservices Spring Boot suivent une organisation proche du modele MVC applique aux APIs REST. La couche `controller` represente l'entree HTTP et expose les endpoints. La couche `service` contient les regles metier et l'orchestration applicative. La couche `repository` encapsule l'acces aux donnees via Spring Data JPA. Les packages `entity` decrivent les objets persistants, tandis que les packages `dto` servent au transport des donnees entre API, frontend et services. Les packages `config` regroupent les configurations transversales telles que la securite, OpenAPI, WebSocket ou l'initialisation.

| Service Spring Boot | Controller | Service | Repository | Entity | DTO | Config | Responsabilite |
|---|---|---|---|---|---|---|---|
| `auth-service` | `com.weentime.weentimeapp.controller` | `com.weentime.weentimeapp.security.services` | non confirmé dans le dépôt actif | non confirmé dans le dépôt actif | `com.weentime.weentimeapp.dto` | non confirmé comme package `config` | Authentification, JWT, 2FA, mail |
| `organisation-service` | `com.weentime.weentimeproject.controller` | `com.weentime.weentimeproject.service`, `service.impl` | `com.weentime.weentimeproject.repository` | `com.weentime.weentimeproject.entity` | `com.weentime.weentimeproject.dto`, `dto.request`, `dto.response` | `com.weentime.weentimeproject.config` | Entreprises, utilisateurs, roles, equipes, departements, notifications |
| `rh-service` | `com.weentime.weentimeapp.controller` | `com.weentime.weentimeapp.service`, `service.impl` | `com.weentime.weentimeapp.repository` | `com.weentime.weentimeapp.entity` | `com.weentime.weentimeapp.dto`, `client.dto`, `dto.response` | `com.weentime.weentimeapp.config` | Conges, soldes, documents, autorisations, teletravail, reunions, planning |
| `presence-service` | `com.weentime.weentimeapp.controller` | `com.weentime.weentimeapp.service` | `com.weentime.weentimeapp.repository` | `com.weentime.weentimeapp.entity` | `com.weentime.weentimeapp.dto`, `dto.horaire`, `dto.response` | `com.weentime.weentimeapp.config` | Pointage, horaires, presence et overtime |
| `communication-service` | `com.weentime.communication.controller` | `com.weentime.communication.service` | `com.weentime.communication.repository` | `com.weentime.communication.entity` | `com.weentime.communication.dto` | `com.weentime.communication.config` | Messagerie interne, channels, pieces jointes, notifications temps reel |

Dans cette architecture, la vue graphique n'est pas produite par le backend lui-meme. Le role de presentation est assure par Angular. Les controllers Spring Boot constituent donc la facette API du modele MVC, les DTO jouent le role de modeles d'echange, et les entites JPA representent le modele persistant. Les services assurent la separation entre la logique metier et les endpoints HTTP, ce qui facilite la maintenance et les tests.

## 3. Code LaTeX complet pret a integrer

```latex
\section{Environnement de développement}

L'environnement de développement du projet WEENTIME réunit des outils adaptés à la réalisation d'une application web distribuée, composée d'un frontend Angular, de microservices Spring Boot, d'un service d'intelligence artificielle FastAPI et de composants d'infrastructure locaux. Les éléments présentés dans cette section sont issus des fichiers réellement présents dans le dépôt du projet.

\subsection{Environnement matériel}

Les caractéristiques matérielles exactes du poste de développement ne sont pas toutes confirmées dans le dépôt. Les documents existants indiquent cependant un environnement Windows et le service d'intelligence artificielle prévoit un fonctionnement local en mode CPU.

\begin{table}[H]
\centering
\begin{tabular}{|p{4cm}|p{8cm}|}
\hline
\textbf{Élément} & \textbf{Caractéristique confirmée} \\
\hline
Poste de développement & Ordinateur de développement sous Windows \\
\hline
Processeur & non confirmé dans le dépôt \\
\hline
Mémoire RAM & non confirmé dans le dépôt \\
\hline
GPU & non confirmé dans le dépôt ; le service IA est configuré pour un mode CPU local par défaut \\
\hline
Stockage & non confirmé dans le dépôt \\
\hline
\end{tabular}
\caption{Environnement matériel du projet}
\end{table}

\subsection{Environnement logiciel}

L'environnement logiciel regroupe les outils de conception, de rédaction, de test, d'intégration, de stockage et les technologies utilisées pour développer WEENTIME.

\subsubsection{Outils de conception}

\begin{table}[H]
\centering
\begin{tabular}{|p{4cm}|p{8cm}|}
\hline
\textbf{Outil} & \textbf{Utilisation} \\
\hline
UML & Modélisation de l'analyse et de l'architecture du système \\
\hline
PlantUML / draw.io & Production ou export des diagrammes UML et des figures du rapport \\
\hline
Jira Software & Mentionné dans les documents PFE comme outil possible de pilotage agile ; usage effectif non confirmé dans le dépôt \\
\hline
Figma & non confirmé dans le dépôt \\
\hline
\end{tabular}
\caption{Outils de conception}
\end{table}

\subsubsection{Outils de rédaction}

\begin{table}[H]
\centering
\begin{tabular}{|p{4cm}|p{8cm}|}
\hline
\textbf{Outil} & \textbf{Utilisation} \\
\hline
LaTeX & Mise en forme finale du rapport PFE \\
\hline
Overleaf & Rédaction et compilation possibles du rapport \\
\hline
Markdown & Documentation technique et rapports intermédiaires du projet \\
\hline
Prism & non confirmé dans le dépôt \\
\hline
\end{tabular}
\caption{Outils de rédaction}
\end{table}

\subsubsection{Outils de tests et intégration}

\begin{table}[H]
\centering
\begin{tabular}{|p{4cm}|p{8cm}|}
\hline
\textbf{Outil} & \textbf{Rôle dans le projet} \\
\hline
Postman & Tests manuels des APIs REST \\
\hline
Swagger / OpenAPI & Documentation et test des endpoints via springdoc-openapi \\
\hline
Git / GitHub & Gestion de versions et collaboration autour du dépôt \\
\hline
Docker / Docker Compose & Lancement local de PostgreSQL, Redis, pgAdmin et MailDev \\
\hline
Maven & Build et gestion des dépendances des microservices Spring Boot \\
\hline
npm / Angular CLI & Installation, build, test et exécution de l'application Angular \\
\hline
Pytest & Tests du service IA et du service ML \\
\hline
Vitest & Tests frontend selon les dépendances déclarées \\
\hline
\end{tabular}
\caption{Outils de tests et d'intégration}
\end{table}

\subsubsection{Système de Gestion de bases de Données}

\begin{table}[H]
\centering
\begin{tabular}{|p{4cm}|p{8cm}|}
\hline
\textbf{Système} & \textbf{Usage} \\
\hline
PostgreSQL & Base principale des microservices organisation, RH, présence et communication \\
\hline
Redis & Cache, événements et temps réel selon les modules \\
\hline
ChromaDB & Stockage vectoriel local pour le RAG du service IA \\
\hline
H2 & Base embarquée utilisée dans certains tests backend \\
\hline
pgAdmin & Administration visuelle de PostgreSQL en local \\
\hline
MailDev & Outil de test mail local, non considéré comme SGBD \\
\hline
MinIO & Configuration de stockage objet présente pour les justificatifs RH, non considéré comme SGBD \\
\hline
\end{tabular}
\caption{Systèmes de gestion et composants de stockage}
\end{table}

\subsubsection{Technologies utilisées}

\begin{table}[H]
\centering
\begin{tabular}{|p{4cm}|p{8cm}|}
\hline
\textbf{Couche} & \textbf{Technologies} \\
\hline
Frontend & Angular 21, TypeScript 5.9, RxJS, Angular Router, Angular Material/CDK, TailwindCSS, STOMP/SockJS \\
\hline
Backend Java & Java 17, Spring Boot 3.4.0, Spring Security, Spring Data JPA, Spring Web, Spring WebSocket, Maven, Lombok, MapStruct \\
\hline
Microservices & Spring Cloud Gateway, Spring Cloud Config Server, Eureka Discovery, OpenFeign, Resilience4j \\
\hline
Données & PostgreSQL, Flyway, Redis, H2 pour tests \\
\hline
Service IA & Python, FastAPI, Uvicorn, Pydantic, httpx, ToolRegistry, agents métier, ResponseGuard \\
\hline
Vocal IA & faster-whisper, ctranslate2, webrtcvad, pydub, imageio-ffmpeg, TTS \\
\hline
RAG et LLM & ChromaDB, RAG, Ollama, qwen2.5:3b, qwen2.5-coder:3b-instruct, phi3 \\
\hline
Observabilité IA & Braintrust, traces applicatives, redaction des secrets \\
\hline
Service ML & FastAPI, scikit-learn, pandas, NumPy, SQLAlchemy, psycopg2, joblib \\
\hline
\end{tabular}
\caption{Technologies utilisées dans WEENTIME}
\end{table}

\section{Architecture logicielle du projet}

WEENTIME adopte une architecture distribuée. Le frontend Angular constitue la couche présentation et communique avec le backend à travers le Spring Cloud Gateway exposé sur le port 8322. Ce gateway route les appels REST vers les microservices Spring Boot et expose aussi les routes WebSocket configurées pour les notifications, la présence, les fonctionnalités RH et la communication.

Le backend est organisé en microservices. Le service \texttt{auth-service} gère l'authentification, les jetons JWT et la double authentification. Le service \texttt{organisation-service} prend en charge les entreprises, utilisateurs, rôles, départements, équipes et notifications organisationnelles. Le service \texttt{rh-service} couvre les congés, soldes, autorisations, télétravail, documents, réunions et plannings RH. Le service \texttt{presence-service} traite le pointage, les horaires et la présence. Le service \texttt{communication-service} gère les canaux, messages, pièces jointes et événements temps réel.

L'infrastructure locale repose principalement sur PostgreSQL pour la persistance métier, Redis pour certains mécanismes de cache, d'événements et de temps réel, ainsi que Docker Compose pour lancer les composants nécessaires au développement. Le projet contient également un Config Server et un serveur Discovery/Eureka, même si l'enregistrement Eureka est désactivé dans plusieurs configurations locales.

Le service \texttt{ai-service}, développé avec FastAPI, ajoute une couche d'assistance intelligente. Il fournit des endpoints de chat et de voix, un pipeline STT/TTS, un système RAG avec ChromaDB ou fallback local, des agents métier, un \texttt{ToolRegistry} et des mécanismes de contrôle des réponses. Le service \texttt{ml-service}, également basé sur FastAPI, regroupe les traitements de machine learning liés notamment aux anomalies et à l'approbation.

\subsection{Modèle de conception Backend (MVC)}

Les microservices Spring Boot appliquent une organisation proche du modèle MVC pour des APIs REST. Les contrôleurs exposent les endpoints HTTP, les services contiennent la logique métier, les repositories assurent l'accès aux données, les entités représentent le modèle persistant et les DTO servent au transport des données. La vue au sens graphique est portée par l'application Angular.

\begin{table}[H]
\centering
\begin{tabular}{|p{3cm}|p{3cm}|p{3cm}|p{3cm}|}
\hline
\textbf{Service} & \textbf{Controller / Service} & \textbf{Repository / Entity} & \textbf{DTO / Config} \\
\hline
auth-service & controller confirmé ; services dans security.services & repository et entity non confirmés dans le dépôt actif & dto confirmé ; package config non confirmé \\
\hline
organisation-service & controller, service et service.impl confirmés & repository et entity confirmés & dto, dto.request, dto.response et config confirmés \\
\hline
rh-service & controller, service et service.impl confirmés & repository et entity confirmés & dto, client.dto, dto.response et config confirmés \\
\hline
presence-service & controller et service confirmés & repository et entity confirmés & dto, dto.horaire, dto.response et config confirmés \\
\hline
communication-service & controller et service confirmés & repository et entity confirmés & dto et config confirmés \\
\hline
\end{tabular}
\caption{Architecture backend MVC des services Spring Boot}
\end{table}
```

## 4. Liste des fichiers utilises comme preuves

| Fichier / dossier | Information extraite |
|---|---|
| `weentime-frontend/angular-weentime/package.json` | Angular 21, TypeScript, RxJS, STOMP/SockJS, TailwindCSS, Angular Material/CDK, Vitest, npm scripts |
| `weentime-frontend/angular-weentime/angular.json` | Configuration Angular CLI, build, serve, test |
| `weentime-frontend/angular-weentime/src/environments/environment.ts` | Gateway `8322`, AI service via gateway, ML service `8001`, WebSocket URLs |
| `weentime-backend/docker-compose.yml` | PostgreSQL, Redis, pgAdmin, MailDev |
| `docker-compose.redis.yml` | Redis local separe |
| `weentime-backend/services/*/pom.xml` | Java 17, Spring Boot 3.4.0, Spring Cloud 2024.0.0, Spring Security, JPA, WebSocket, OpenFeign, Flyway, Redis, OpenAPI |
| `weentime-backend/services/*/src/main/resources/application.yml` | Ports, routes gateway, datasource PostgreSQL, Redis, JWT, logging, Config Server, Eureka |
| `weentime-backend/services/*/src/main/java` | Packages MVC : controllers, services, repositories, entities, DTO, configs |
| `ai-service/requirements.txt` | FastAPI, Uvicorn, faster-whisper, ctranslate2, webrtcvad, TTS, ChromaDB, Braintrust, Redis |
| `ai-service/config.py` | Ports, backend gateway, ML service, Ollama, STT/TTS, RAG, ChromaDB, Braintrust, Redis events |
| `ai-service/main.py` | Application FastAPI, endpoints chat, voice, audio-stream, TTS, health |
| `ai-service/app/api` | Routes API modernes du service IA |
| `ai-service/app/tools` | ToolRegistry et outils metier IA |
| `ai-service/app/agents` | Agents metier IA |
| `ai-service/app/policy` | RAG, ChromaDB, ingestion et citations |
| `ai-service/app/guards` | ResponseGuard et validation des reponses |
| `ai-service/voice` | STT, TTS, VAD, conversion audio |
| `ml-service/requirements.txt` | FastAPI, scikit-learn, pandas, SQLAlchemy, psycopg2, pytest |
| `ml-service/app/main.py` | Service ML FastAPI, routes health, anomalies et approval |
| `docs/pfe/chapter2_sprint0/08_environnement_developpement.md` | Outils PFE : Postman, GitHub, Docker Compose, PlantUML/draw.io, LaTeX/Overleaf, Jira mentionne |
| `docs/pfe/chapter2_sprint0/01_analyse_synthetique_projet.md` | Synthese existante des modules et composants d'infrastructure |
