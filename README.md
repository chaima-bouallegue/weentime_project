# 🏢 WeenTime — Plateforme SIRH Intelligente & Distribuée

<p align="center">
  <img src="https://img.shields.io/badge/Release-v2.4.0-blue?style=for-the-badge" alt="Release v2.4.0" />
  <img src="https://img.shields.io/badge/Architecture-Microservices-orange?style=for-the-badge&logo=apache" alt="Microservices" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Spring%20Boot-3.2-6DB33F?style=flat-square&logo=springboot&logoColor=white" />
  <img src="https://img.shields.io/badge/Angular-17+-DD0031?style=flat-square&logo=angular&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.109-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-15+-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-Cache-DC382D?style=flat-square&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/ChromaDB-VectorStore-yellow?style=flat-square" />
  <img src="https://img.shields.io/badge/Whisper-Voice%20STT-violet?style=flat-square&logo=openai" />
</p>

---

## 📌 Présentation du Projet

**WeenTime** est une solution complète de **Gestion des Ressources Humaines (SIRH)** en mode **SaaS Multi-Tenant**, couplée à un écosystème d'**Intelligence Artificielle générative, conversationnelle et prédictive**.

Conçue pour répondre aux défis organisationnels des entreprises modernes, la plateforme unifie le suivi des présences, la gestion des congés et documents administratifs, le recrutement automatisé, la communication interne et la prise de décision assistée par IA.

---

## ✨ Fonctionnalités Principales

### 1. 🛡️ Sécurité & Gestion des Accès (Zero Trust)
* **Authentification sans état** par JWT (HMAC-SHA512) avec Refresh Tokens.
* **Double Authentification (2FA)** :
  * TOTP standard Google Authenticator / FreeOTP avec génération de QR Code (ZXing) et chiffrement AES-GCM des clés secrètes.
  * OTP par Email et SMS en fallback.
* **Appareils de Confiance (`TrustedDeviceService`)** : Mémorisation d'appareils de confiance pendant 30 jours via empreinte numérique sécurisée.
* **Contrôle d'accès basé sur les rôles (RBAC)** : Employé, Manager, Responsable RH, Super Administrateur.

### 2. 📍 Présence, Pointage & Geofencing Temps Réel
* **Pointage intelligent** (Check-in / Check-out) supportant le mode **multi-sessions journalières**.
* **Moteur de Geofencing** :
  * Calcul de distance géodésique (formule de Haversine) autour du siège (`36.899450, 10.188448`, rayon de 200m).
  * Classification automatique des statuts : `OFFICE` (Siège), `REMOTE` (Télétravail autorisé), `OUT_OF_BOUNDS` (Hors périmètre).
* Calcul automatique du temps de présence effectif, des retards, des départs anticipés et des heures supplémentaires.

### 3. 🤖 Copilote RH Vocal & Multilingue (RAG & Multi-Agents)
* **Reconnaissance vocale temps réel** (STT Whisper) traitant le Français, l'Anglais et le Dialecte tunisien.
* **Pipeline RAG (Retrieval-Augmented Generation)** alimenté par **ChromaDB** pour interroger les règlements intérieurs, conventions d'entreprise et politiques RH.
* **Architecture Multi-Agents** avec slot-filling autonome pour planifier les congés, vérifier les soldes et demander des pièces justificatives.
* **Cache Haute Performance & External Copilot API** : Temps de réponse optimisés (< 100 ms) via cache à double niveau (Redis + LRU in-memory fallback).

### 4. 📊 Machine Learning Prédictif
* **Détection d'Anomalies de Présence** : Modèles *Isolation Forest* identifiant les comportements atypiques de pointage et calculant des scores de risque.
* Visualisation analytique des tendances de ponctualité et des corrélations RH.

### 5. 👥 Gestion RH, Documents & Recrutement IA
* **Gestion des Congés & Absences** : Workflow de validation hiérarchique à 2 niveaux (Manager puis RH) avec verrouillage optimiste JPA (`@Version`).
* **Génération Automatisée de Documents RH** : Templates dynamiques pour attestations de travail, fiches de paie et contrats avec export PDF certifié.
* **Recrutement Intelligent** : Parsing de CV (PDF/DOCX), extraction de compétences et scoring sémantique d'adéquation candidat-poste.

---

## 🏛️ Architecture du Système

```
                              ┌───────────────────────────────────┐
                              │     Navigateur Web / Mobile       │
                              │     Angular 17+ (SPA Moderne)     │
                              └─────────────────┬─────────────────┘
                                                │ (HTTPS / REST / WS)
                                                ▼
                              ┌───────────────────────────────────┐
                              │      Spring Cloud API Gateway     │ (Port 8080)
                              │  Filtres JWT, CORS, Rate Limiting │
                              └─────────────────┬─────────────────┘
                                                │
         ┌─────────────────────┬────────────────┼────────────────────┬─────────────────────┐
         ▼                     ▼                ▼                    ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│   Auth Service   │  │ Presence Service │  │  RH Service  │  │ Organisation │  │    Communication     │
│  (Port 8081)     │  │   (Port 8083)    │  │ (Port 8084)  │  │ (Port 8082)  │  │     (Port 8085)      │
│  JWT, 2FA, Trust │  │ Geo, Pointages   │  │ Congés, Docs │  │ Tenants, RH  │  │  WebSocket, Messages │
└────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘
         │                     │                   │                 │                     │
         └─────────────────────┴─────────┬─────────┴─────────────────┴─────────────────────┘
                                         │
                   ┌─────────────────────┼─────────────────────┐
                   ▼                                           ▼
      ┌──────────────────────────────┐            ┌──────────────────────────────┐
      │          AI Service          │            │          ML Service          │
      │    FastAPI / Python 3.11     │            │    FastAPI / Scikit-learn    │
      │ Whisper, LangChain, ChromaDB │            │   Isolation Forest Anomaly   │
      └──────────────┬───────────────┘            └──────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
┌──────────────────┐  ┌──────────────────┐
│   Redis Cache    │  │  ChromaDB Store  │
└──────────────────┘  └──────────────────┘
```

---

## 💻 Stack Technologique

| Couche | Technologies |
| :--- | :--- |
| **Frontend** | Angular 17+, TypeScript, SCSS, RxJS, Signals, Chart.js |
| **Backend Microservices** | Java 17/21, Spring Boot 3.2, Spring Cloud (Gateway, Eureka, Config Server), Spring Security |
| **Sécurité & Auth** | JWT HMAC-512, Google Authenticator TOTP (com.warrenstrange), ZXing QR, AES-GCM |
| **IA & Data Science** | Python 3.11, FastAPI, OpenAI Whisper, LangChain, ChromaDB, PyTorch, Scikit-learn, Pandas |
| **Persistance & Cache** | PostgreSQL 15+, Redis 7+, Flyway (migrations de schéma) |
| **DevOps & Conteneurs** | Docker, Docker Compose, Jenkins CI/CD, Git |

---

## 📂 Structure du Répertoire

```bash
weentime_project/
├── ai-service/                   # Service FastAPI d'IA (Copilote vocal, RAG, Recrutement)
│   ├── app/
│   │   ├── agents/               # Agents autonomes (LeaveAgent, PolicyAgent...)
│   │   ├── api/                  # Endpoints REST (External Copilot, Recrutement, Voix)
│   │   ├── core/                 # Moteur Copilote, Cache Redis/LRU, Slot Filling
│   │   └── policy/               # RAG ChromaDB & politiques RH
│   └── tests/                    # Tests unitaires & intégration IA
├── ml-service/                   # Service Machine Learning (Détection d'anomalies de présence)
├── weentime-backend/             # Écosystème des microservices Spring Boot
│   ├── services/
│   │   ├── auth-service/         # Authentification, 2FA, Appareils de confiance
│   │   ├── config-server/        # Serveur de configuration centralisée
│   │   ├── discovery-server/     # Registre Eureka
│   │   ├── gateway/              # Spring Cloud API Gateway
│   │   ├── organisation-service/ # Structure multi-tenant et collaborateurs
│   │   ├── presence-service/     # Pointage, Geofencing, sessions
│   │   ├── rh-service/           # Demandes de congés, documents, contrats
│   │   └── communication-service/# Messagerie d'entreprise et notifications
├── weentime-frontend/
│   └── angular-weentime/         # Application Frontend Angular 17+
├── AUDIT_SOUTENANCE_FINAL.md     # Rapport officiel d'audit et bilan de soutenance
├── DOCUMENTATION_PROJET_WEENTIME.md # Spécifications et documentation complète
├── docker-compose.redis.yml      # Déploiement Redis
├── Jenkinsfile                   # Pipeline CI/CD multi-étapes
├── run-all-services.ps1          # Script d'orchestration local PowerShell
└── install-weentime.ps1          # Script d'installation et de dépendances
```

---

## 🚀 Démarrage Rapide

### Prérequis
* **JDK 17 ou 21**
* **Node.js 18+** & npm
* **Python 3.11** & pip
* **Docker Desktop** (avec Docker Compose)

### 1. Cloner le projet
```bash
git clone https://github.com/chaima-bouallegue/weentime_project.git
cd weentime_project
```

### 2. Lancer l'infrastructure (Bases de données & Cache)
```bash
# Lancement de Redis pour le cache IA
docker compose -f docker-compose.redis.yml up -d
```

### 3. Démarrer les Microservices Backend
```powershell
# Démarrage automatique de l'ensemble des services via le script PowerShell
./run-all-services.ps1
```
*Ou démarrer manuellement chaque service dans l'ordre recommandé :*
1. `config-server` (Port 8888)
2. `discovery-server` (Port 8761)
3. `gateway` (Port 8080)
4. `auth-service` (Port 8081)
5. `organisation-service` (Port 8082)
6. `presence-service` (Port 8083)
7. `rh-service` (Port 8084)
8. `communication-service` (Port 8085)

### 4. Démarrer le Service d'IA
```bash
cd ai-service
python -m venv venv
venv\Scripts\activate          # Sur Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 5. Démarrer le Frontend Angular
```bash
cd weentime-frontend/angular-weentime
npm install
npm start
```
L'application est accessible sur : **`http://localhost:4200`**

---

## 🧪 Tests & Qualité de Code

```bash
# Tests unitaires Backend Spring Boot
mvn clean test

# Tests IA (Pytest)
cd ai-service
pytest tests/ -v

# Tests Frontend Angular
cd weentime-frontend/angular-weentime
ng test --watch=false
```

---

## 🎓 Soutenance & Validation
* **Rapport d'audit complet** : Voir [`AUDIT_SOUTENANCE_FINAL.md`](./AUDIT_SOUTENANCE_FINAL.md)

---

## 👩‍💻 Auteur

* **Chaima Bouallegue** — Concepteur & Développeur


---

<p align="center">
  <b>WeenTime</b> — L'intelligence artificielle au service de la gestion humaine.
</p>
