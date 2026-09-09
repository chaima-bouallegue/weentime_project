# Guide d'Installation Complet — WeenTime (Environnement Local Windows)

Ce document fournit un guide étape par étape pour installer, configurer et exécuter l'intégralité de la plateforme HR SaaS multi-tenant **WeenTime** sur une nouvelle machine sous Windows.

---

## 1. Prérequis Système

| Composant | Version Requise | Fichier de Référence dans le Repo | Remarques |
| :--- | :--- | :--- | :--- |
| **Java (JDK)** | **JDK 17** | `pom.xml` (`<java.version>17</java.version>`), `Jenkinsfile` | Requis pour l'ensemble des 8 microservices Spring Boot 3.4.0. |
| **Node.js** | **Node.js 20+** | `weentime-frontend/Jenkinsfile` (`NodeJS20`) | Requis pour le frontend Angular 21. |
| **npm** | **npm 11.6.1** | `weentime-frontend/angular-weentime/package.json` (`"packageManager": "npm@11.6.1"`) | Utiliser `npm` (géré via `packageManager`). |
| **Python** | **Python 3.11** | `ai-service/.python-version`, `ml-service/Dockerfile` (`FROM python:3.11-slim`) | **ATTENTION** : Ne pas utiliser Python 3.13 (`scikit-learn` incompatible avec Python 3.13 sur Jenkins). |
| **Docker Desktop** | Engine 20.10+ / Compose v2 | `weentime-backend/docker-compose.yml`, `docker-compose.redis.yml` | Backend **WSL2** recommandé sous Windows. |
| **PostgreSQL** | **PostgreSQL 17** | `weentime-backend/docker-compose.yml` (`postgres:17`) | Géré via Docker Compose sur le port externe **5433** (pour éviter les conflits avec le port 5432 local). |
| **Maven** | Included Wrapper (`mvnw.cmd`) | `weentime-backend/services/*/mvnw.cmd` | Chaque microservice possède son propre Maven Wrapper. Aucun fichier `pom.xml` agrégateur à la racine du backend. |
| **Git** | 2.x+ | `.gitignore`, `Jenkinsfile` | Pour le versionnement du code. |
| **IDE Recommandé** | IntelliJ IDEA / VS Code | — | Extensions suggérées : Lombok Plugin, Angular Language Service, Python/Pylance. |

---

## 2. Dépendances et Bibliothèques Critiques

### A. Frontend Angular (`weentime-frontend/angular-weentime/package.json`)
- **Framework Core** : `@angular/core` `^21.2.0`, `@angular/router` `^21.2.0`, `@angular/forms` `^21.2.0` (Composants standalone & signals).
- **Tooling & Build** : `@angular/build` `^21.2.1` (Utilise Vitest en sous-jacent), `@angular/cli` `^21.2.1`, `typescript` `~5.9.2`.
- **Icônes & UI (Versions figées)** : `lucide-angular` `^0.577.0`, `lucide-react` `^0.577.0`.
- **Styles & Responsive** : `tailwindcss` `^3.4.15`, `postcss` `^8.5.8`, `autoprefixer` `^10.4.27`, `clsx` `^2.1.1`, `tailwind-merge` `^3.5.0`.
- **WebSockets & Temps Réel** : `@stomp/rx-stomp` `^2.3.0`, `sockjs-client` `^1.6.1`, `@types/sockjs-client` `^1.5.4`.
- **Cartographie & Export** : `leaflet` `^1.9.4`, `jspdf` `^4.2.1`, `jspdf-autotable` `^5.0.7`, `xlsx` `^0.18.5`.

### B. Microservices Java (`weentime-backend/services/*/pom.xml`)
- **Stack Commune** : Spring Boot `3.4.0`, Spring Cloud `2024.0.0`, Java 17.
- **Service Security & Auth (`auth-service`)** : `spring-boot-starter-security`, `jjwt-api` / `jjwt-impl` / `jjwt-jackson` (`0.11.5`), `dev.samstevens.totp:totp` (`1.7.1`), `zxing` (`3.5.3`), `spring-boot-starter-data-redis`, `caffeine`.
- **Organisation & Structure (`organisation-service`)** : `spring-boot-starter-data-jpa`, `mapstruct` (`1.5.5.Final`), `resilience4j-spring-boot3` / `resilience4j-feign` (`2.2.0`), `flyway-core` + `flyway-database-postgresql`, `postgresql` driver.
- **Ressources Humaines & Recrutement (`rh-service`)** : `spring-boot-starter-data-jpa`, `mapstruct` (`1.5.5.Final`), `itext7-core` (`7.2.5` pour l'impression/génération PDF), `spring-boot-starter-mail`, `flyway-core` + `flyway-database-postgresql`.
- **Gestion des Présences (`presence-service`)** : `spring-boot-starter-data-jpa`, `mapstruct` (`1.5.5.Final`), `springdoc-openapi-starter-webmvc-ui` (`2.8.5`), `flyway-core` + `flyway-database-postgresql`.
- **Communication & Temps Réel (`communication-service`)** : `spring-boot-starter-websocket`, `spring-boot-starter-data-redis`, `springdoc-openapi-starter-webmvc-ui` (`2.8.5`), `flyway-core` + `flyway-database-postgresql`.
- **Passerelle & Configuration (`gateway`, `config-server`, `discovery`)** : `spring-cloud-starter-gateway`, `spring-cloud-config-server`, `spring-cloud-starter-netflix-eureka-server` / `eureka-client`.

### C. Services Python (`ai-service` et `ml-service`)
- **`ai-service` (`ai-service/requirements.txt`)** :
  - `fastapi` `0.115.6`, `uvicorn[standard]` `0.32.1`, `pydantic` `2.10.3`
  - Voice / STT / TTS : `faster-whisper` `1.1.1`, `ctranslate2` `>=4.5.0`, `webrtcvad-wheels` `2.0.14`, `soundfile` `0.12.1`, `numpy` `1.26.4`, `pydub` `0.25.1`, `TTS` `0.22.0`, `num2words` `0.5.13`
  - RAG & Vector DB : `chromadb` `>=0.5.23,<0.7.0`, `pypdf` `5.1.0`
  - Event Store : `redis` `>=5.0.0,<6.0.0`
- **`ml-service` (`ml-service/requirements.txt`)** :
  - `fastapi` `0.111.0`, `uvicorn[standard]` `0.29.0`
  - Machine Learning & Analytics : `scikit-learn` `>=1.5.2`, `pandas` `>=2.2.3`, `numpy` `>=2.1.0`, `joblib` `1.4.0`, `matplotlib` `>=3.9.0`
  - Base de données & HTTP : `sqlalchemy` `2.0.29`, `psycopg2-binary` `2.9.9`, `pydantic` `2.7.1`, `httpx` `0.27.0`

---

## 3. Variables d'Environnement et Secrets

Plusieurs fichiers de configuration contiennent des secrets ou doivent être créés manuellement localement s'ils sont absents ou ignorés par Git.

### Fichiers de Configuration à Créer / Copier

1. **Racine du projet (`.env`)** :
   Copier `.env.example` vers `.env` à la racine :
   ```bash
   copy .env.example .env
   ```
   *Variables clés dans `.env`* :
   - `JWT_SECRET=404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970` (Clé Hex 256-bit)
   - `JWT_EXPIRATION_MS=86400000` (24 heures)
   - `GEMINI_API_KEY=<Votre_Cle_Google_Gemini>`
   - `INTERNAL_SECRET=WeenTimeInternalSecretKey2026`
   - `INTERNAL_API_KEY=communication-service-local`

2. **Frontend Angular (`environment.ts`)** :
   Copier `environment.example.ts` vers `environment.ts` dans `weentime-frontend/angular-weentime/src/environments/` :
   ```bash
   cd weentime-frontend/angular-weentime/src/environments
   copy environment.example.ts environment.ts
   ```
   *Contenu de `environment.ts`* :
   ```typescript
   export const environment = {
     production: false,
     apiUrl: 'http://localhost:8222/api/v1',
     gatewayUrl: 'http://localhost:8222',
     aiServiceUrl: 'http://127.0.0.1:8000',
     aiUrl: 'http://127.0.0.1:8000',
     mlServiceUrl: 'http://localhost:8222',
     chatbotPublicMode: false,
     smsOtpEnabled: false,
     wsUrl: 'http://localhost:8222',
     websocket: {
       notifications: 'http://localhost:8222/ws/notifications',
       rh: 'http://localhost:8222/ws-rh',
       presence: 'http://localhost:8222/ws-presence',
       organisation: 'http://localhost:8222/ws-org',
       communication: 'http://localhost:8222/ws-communication',
     },
   };
   ```

3. **Service AI (`ai-service/.env`)** :
   Copier `ai-service/.env.example` vers `ai-service/.env` :
   ```bash
   cd ai-service
   copy .env.example .env
   ```
   *Variables spécifiques à adapter si nécessaire* :
   - `PORT=8000`
   - `DEFAULT_AI_PROVIDER=gemini` (ou `ollama`)
   - `GEMINI_API_KEY=<Votre_Cle_API>`
   - `JAVA_RH_SERVICE_URL=http://localhost:8192`
   - `CHATBOT_PUBLIC_MODE=true` (pour dev local)

4. **Service ML (`ml-service/.env`)** :
   Copier `ml-service/.env.example` vers `ml-service/.env` :
   ```bash
   cd ml-service
   copy .env.example .env
   ```
   *Variables spécifiques* :
   - `PORT=8001`
   - `BACKEND_URL=http://localhost:8222`
   - `DATABASE_URL=postgresql://weentime:170502@localhost:5433/presence_db`

---

## 4. Ordre de Démarrage des Services et Ports

L'ordre de démarrage est strict pour permettre l'enregistrement auprès d'Eureka et la récupération des configurations via Config Server.

### Tableau Récapitulatif des Services et Ports

| Étape | Service | Technologie | Port Externe | Commande de Démarrage Précise |
| :---: | :--- | :--- | :---: | :--- |
| **0** | **PostgreSQL 17** | Docker | `5433` | `cd weentime-backend && docker-compose up -d postgres redis maildev` |
| **0** | **Redis 7** | Docker | `6380` | *(Inclus dans docker-compose up)* |
| **0** | **MailDev** | Docker | `1082` (UI), `1027` (SMTP) | *(Inclus dans docker-compose up)* |
| **0** | **pgAdmin4** | Docker | `5052` | *(Inclus dans docker-compose up)* |
| **1** | `config-server` | Spring Boot | `8988` | `cd weentime-backend/services/config-server && .\mvnw.cmd spring-boot:run` |
| **2** | `discovery` (Eureka) | Spring Boot | `8861` | `cd weentime-backend/services/discovery && .\mvnw.cmd spring-boot:run` |
| **3** | `auth-service` | Spring Boot | `8181` | `cd weentime-backend/services/auth-service && .\mvnw.cmd spring-boot:run` |
| **4** | `organisation-service` | Spring Boot | `8190` | `cd weentime-backend/services/organisation-service && .\mvnw.cmd spring-boot:run` |
| **5** | `rh-service` | Spring Boot | `8192` | `cd weentime-backend/services/rh-service && .\mvnw.cmd spring-boot:run` |
| **6** | `presence-service` | Spring Boot | `8193` | `cd weentime-backend/services/presence-service && .\mvnw.cmd spring-boot:run` |
| **7** | `communication-service` | Spring Boot | `8194` | `cd weentime-backend/services/communication-service && .\mvnw.cmd spring-boot:run` |
| **8** | `gateway` | Spring Cloud Gateway | `8222` | `cd weentime-backend/services/gateway && .\mvnw.cmd spring-boot:run` |
| **9** | `ai-service` | FastAPI (Python 3.11) | `8000` | `cd ai-service && .\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload` |
| **10** | `ml-service` | FastAPI (Python 3.11) | `8001` | `cd ml-service && .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload` |
| **11** | `angular-weentime` | Angular 21 | `4200` | `cd weentime-frontend/angular-weentime && npm start` |

> 💡 **Script Automatisé Tout-en-un PowerShell ("One-Click Dev")** :
> Pour automatiser la copie des `.env`, l'installation des dépendances, le démarrage de Docker, des 8 microservices Java, des 2 services Python et du frontend Angular en **une seule commande** :
> ```powershell
> powershell -ExecutionPolicy Bypass -File .\install-weentime.ps1
> ```

---

## 5. Base de Données et Migrations

### A. Initialisation du Container PostgreSQL
L'infrastructure PostgreSQL est exécutée dans Docker à partir de `weentime-backend/docker-compose.yml`.
- **Image** : `postgres:17`
- **Utilisateur** : `weentime`
- **Mot de passe** : `170502`
- **Port hôte** : `5433` (mappé vers le port container `5432`)

Au premier démarrage du conteneur, le script SQL `weentime-backend/db/init/01-create-databases.sql` s'exécute automatiquement et crée les bases de données nécessaires :
- `organisation`
- `organisation_db`
- `rh_db`
- `presence_db`
- `communication_db`

### B. Executer les Migrations Flyway
Les migrations Flyway sont exécutées **automatiquement par chaque microservice Spring Boot au démarrage**.

1. **`organisation-service`** : Migrations `V1__init.sql` à `V18__add_entreprise_brand_colors.sql`
   - Crée et configure les tables `entreprises`, `utilisateurs`, `departements`, `equipes`, `roles`, `tokens`, `user_audit_logs`, `two_factor_otps`.
2. **`rh-service`** : Migrations `V1__init.sql` à `V30__add_justificatif_url_to_conges.sql`
   - Crée et configure les tables `conges`, `demandes`, `teletravail`, `absences`, `documents`, `type_conges`, `recrutement` (`jobs`, `candidats`), etc.
3. **`presence-service`** : Migrations `V1__init_schema.sql` à `V13__overtime_request_decision_fields.sql`
   - Crée et configure les tables `attendance_sessions`, pointages, règles d'heures supplémentaires.
4. **`communication-service`** : Migrations `V1__init_communication_mvp.sql` à `V4__add_attachments.sql`
   - Crée le schéma `communication` et les tables associées (`channels`, `messages`, `attachments`, `outbox`).

---

## 6. Vérification et Dépannage

### A. Endpoints de Vérification Health Check

| Service / Composant | URL de Vérification | Résultat Attendu |
| :--- | :--- | :--- |
| **Eureka Server** | `http://localhost:8861` | Dashboard Eureka affichant les services enregistrés (status `UP`) |
| **API Gateway Swagger UI** | `http://localhost:8222/swagger-ui.html` | Agrégation Swagger des 5 services métiers |
| **Health API Gateway** | `http://localhost:8222/actuator/health` | `{"status":"UP"}` |
| **Health Auth Service** | `http://localhost:8181/actuator/health` | `{"status":"UP"}` |
| **Documentation AI Service** | `http://localhost:8000/docs` | Interface Swagger OpenAPI FastAPI |
| **Documentation ML Service** | `http://localhost:8001/docs` | Interface Swagger OpenAPI FastAPI |
| **MailDev UI** | `http://localhost:1082` | Webmail de test local |
| **pgAdmin UI** | `http://localhost:5052` | Connexion DB (`pgadmin@pgadmin.org` / `admin`) |
| **Application Angular** | `http://localhost:4200` | Page d'accueil / Connexion WeenTime |

---

### B. Erreurs Fréquentes et Solutions Rapidement Actionnables

#### 1. Erreur `mvnw` / `mvnw.cmd` introuvable ou erreur de politique PowerShell sous Windows
- **Symptôme** : `mvnw.cmd : File cannot be loaded because running scripts is disabled on this system.`
- **Solution** : Exécuter PowerShell en autorisant les scripts ou lancer la commande directement depuis le dossier du service :
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\run-all-services.ps1
  ```

#### 2. Service non visible ou `DefaultEndpoint` sur le port `8761`
- **Symptôme** : Un service Spring essaie de se connecter à `http://localhost:8761/eureka/` et échoue.
- **Raison** : Le serveur Eureka de ce projet tourne sur le port **8861** (pas le port 8761 par défaut).
- **Solution** : Vérifier que `config-server` est démarré en premier et que `EUREKA_DEFAULT_ZONE` vaut `http://localhost:8861/eureka/`.

#### 3. Erreur de connexion à PostgreSQL / Port 5432 déjà utilisé
- **Symptôme** : `Connection to localhost:5432 refused` ou conflit avec un PostgreSQL local.
- **Raison** : Docker mappe PostgreSQL sur le port externe **5433**.
- **Solution** : S'assurer que les URLs JDBC pointent bien sur le port 5433 (`jdbc:postgresql://localhost:5433/nom_db`).

#### 4. Déconnexions inactives HikariCP (Windows Docker NAT Disconnects)
- **Symptôme** : `HikariPool - Connection is not available, request timed out after 5000ms`.
- **Raison** : Le NAT Docker sous Windows coupe les connexions TCP inactives après ~18-20 min.
- **Solution** : La configuration Hikari inclut `keepalive-time: 240000` (4 minutes) et `max-lifetime: 1500000` dans les fichiers YAML du repo pour maintenir la connexion active.

#### 5. Incompatibilité Python 3.13 avec `scikit-learn`
- **Symptôme** : Erreur d'installation des dépendances ou échec du pipeline lors du build `ml-service` ou `ai-service`.
- **Solution** : Utiliser **Python 3.11** (comme spécifié dans `.python-version` et `Dockerfile`).

#### 6. Erreur Angular `environment.ts` manquant
- **Symptôme** : `Cannot find module './environments/environment'`.
- **Solution** : Copier `environment.example.ts` vers `environment.ts` dans `weentime-frontend/angular-weentime/src/environments/`.

---
*Guide généré automatiquement à partir de l'analyse statique exhaustive des fichiers du dépôt WeenTime.*
