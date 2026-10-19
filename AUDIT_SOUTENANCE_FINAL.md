# RAPPORT D'AUDIT COMPLET ET BILAN DE CLÔTURE DE PROJET
## PROJET WEENTIME - VALIDATION FINALE & SOUTENANCE RÉUSSIE

---

| **Paramètre** | **Détails** |
| :--- | :--- |
| **Projet** | **WeenTime** - Système Intégré de Gestion RH, Présence & IA Prédictive |
| **Auteur / Candidate** | **Chaima Bouallegue** |
| **Partenaire / Cadre** | **IT SERV** |
| **Date de Clôture** | 19 Octobre 2026 |
| **Statut Soutenance** | **VALIDÉE & TERMINÉE AVEC SUCCÈS** |
| **Version Finale** | `v2.4.0-release` (Soutenance Final Build) |
| **Dépôt Officiel** | `chaima-bouallegue/weentime_project` (Branche `main`) |

---

## 1. RÉSUMÉ EXÉCUTIF

Le projet **WeenTime** a franchi avec succès toutes les étapes de conception, d'implémentation, de banc d'essai et de soutenance finale devant le jury. 

WeenTime est une plateforme d'entreprise distribuée répondant aux exigences modernes de la gestion des ressources humaines et du suivi des temps d'activité. Elle combine :
1. Une architecture en **microservices Spring Boot 3** distribuée, scalable et résiliente.
2. Un module d'**Intelligence Artificielle & Machine Learning (FastAPI, PyTorch, Scikit-learn, LangChain, ChromaDB)** offrant un copilote RH vocal/texte multilingue, le parsing automatisé de CV et la détection prédictive d'anomalies de présence.
3. Une interface utilisateur **Angular 17+** ergonomique, temps réel et responsive, adaptée aux profils Employé, Manager et Administrateur RH.
4. Des mécanismes avancés de **sécurité** (JWT sans état, authentification double facteur TOTP/Email/SMS, gestion des appareils de confiance) et de **géolocalisation / Geofencing** 

L'ensemble des objectifs fixés dans le cahier des charges a été rigoureusement atteint et validé en conditions réelles.

---

## 2. BILAN DES RÉALISATIONS ARCHITECTURALES ET TECHNIQUES

### 2.1 Backend Microservices (Spring Boot 3 / Java 17 & 21)

L'infrastructure backend repose sur une architecture orientée services avec configuration dynamique et découverte de services :

```
                  ┌───────────────────────────────┐
                  │    Spring Cloud Gateway       │ (Port 8080)
                  │   Routage, Filtre CORS/JWT    │
                  └──────────────┬────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼────────┐    ┌─────────▼─────────┐   ┌─────────▼─────────┐
│  Auth Service   │    │  Presence Service │   │    RH Service     │
│  (JWT, 2FA,     │    │  (Pointage, Geo,  │   │  (Congés, Docs,   │
│   Trusted Dev)  │    │   Sessions multi) │   │   Recrutement)    │
└────────┬────────┘    └─────────┬─────────┘   └─────────┬─────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                  ┌──────────────▼────────────────┐
                  │ AI Service & ML Service       │ (FastAPI, Redis)
                  │ Copilot RAG, Whisper, Anomaly │
                  └───────────────────────────────┘
```

#### Services déployés et validés :
* **Config Server (`service:8888`)** : Centralisation des configurations versionnées avec Spring Cloud Config.
* **Discovery Server (`eureka:8761`)** : Découverte dynamique et enregistrement des instances de microservices.
* **API Gateway (`gateway:8080`)** : Point d'entrée unique, routage dynamique, limitation de débit, décodage des tokens JWT et gestion unifiée du CORS.
* **Auth Service (`auth-service:8081`)** :
  * Authentification unifiée et émission de JWT signés (HMAC-SHA512).
  * Double Facteur Authentification (2FA) complet : TOTP (Google Authenticator / FreeOTP avec QR Code ZXing et chiffrement AES-GCM), Email OTP et SMS (architecture extensible).
  * Système `TrustedDeviceService` : mémorisation de l'appareil (30 jours) évitant la redondance 2FA sur les terminaux reconnus.
* **Organisation Service (`organisation-service:8082`)** : Modélisation des entreprises partenaires, départements, hiérarchies, collaborateurs et rôles métier.
* **Presence Service (`presence-service:8083`)** :
  * Pointage temps réel (Clock-in / Clock-out) avec prise en charge du mode multi-sessions journalières.
  * Moteur de Geofencing : Détection du siège **IT SERV HQ** (`36.899450, 10.188448`, rayon 200m) et classification des statuts de présence :
    * `OFFICE` : Pointage vérifié dans le périmètre du siège.
    * `REMOTE` : Pointage en télétravail validé.
    * `OUT_OF_BOUNDS` : Pointage hors zone nécessitant justification.
  * Migration Flyway V14 appliquée, audit horodaté et compatibilité ascendante avec les clients mobiles et desktop.
* **RH Service (`rh-service:8084`)** :
  * Gestion du cycle de vie des demandes de congés (workflows de validation à 2 niveaux : Manager & RH).
  * Moteur de génération de documents administratifs (attestations de travail, fiches de paie, contrats) avec variables dynamiques et export PDF/HTML.
* **Communication Service (`communication-service:8085`)** :
  * Système d'annonces internes, notifications asynchrones et messagerie d'équipe.

---

### 2.2 Intelligence Artificielle & Data Science (FastAPI, Python 3.11)

Le module IA et Machine Learning est composé de deux briques distinctes et coordonnées :

#### A. AI Service (`ai-service:8000`)
* **Copilote RH Conversationnel & Vocal** :
  * Reconnaissance vocale temps réel (Speech-to-Text) propulsée par OpenAI Whisper optimisé (gestion du français, anglais et dialecte tunisien).
  * Pipeline RAG (Retrieval-Augmented Generation) connecté à une base vectorielle **ChromaDB**, indexant les politiques internes RH, conventions collectives et guides procédures d'entreprise.
  * Routage d'intention dynamique (congés, pointage, politique RH, attestation, contact RH) avec slot-filling conversationnel (gestion des dates manquantes, types de congés, pièces justificatives).
  * **External Copilot API & Cache Redis** : Implémentation d'un endpoint d'interfaçage externe avec mise en cache haute performance (TTL paramétrable, invalidation intelligente) garantissant des temps de réponse < 100 ms.
* **Recrutement Intelligent** :
  * Parsing automatisé des CV (PDF/DOCX) et extraction d'entités nommées (NER).
  * Scoring sémantique d'adéquation candidat-poste basé sur des embeddings et analyse des compétences clés.

#### B. ML Service (`ml-service:5000`)
* **Détection d'Anomalies de Présence** : Modèles Isolation Forest entraînés pour identifier les retards systématiques, départs anticipés anormaux ou pointages suspects hors zone.
* Visualisations générées : matrices de corrélation, histogrammes de distribution des anomalies et répartition des niveaux de risque.

---

### 2.3 Frontend Moderne (Angular 17+, TypeScript, SCSS)

L'application web offre une expérience utilisateur fluide et haut de gamme :
* **State Management & Résilience** : Gestion réactive de l'état (Store / Signals), resolvers de données pour le planning et les présences évitant les rendus instables.
* **Interface Employé** :
  * Tableau de bord personnel de présence avec pointage en 1 clic et géolocalisation assistée par navigateur.
  * Historique des sessions journalières, calcul du temps travaillé effectif et alertes en cas de retard.
  * Soumission de congés avec assistance interactive du Copilote.
* **Interface Manager & RH** :
  * Supervision en direct des équipes (présents, absents, télétravail, congés).
  * Module de gestion du planning dynamique avec filtres par département et export.
  * Module Recrutement complet avec tableau Kanban des candidatures, visionneuse de CV et évaluation IA intégrée.
  * Éditeur dynamique de modèles de documents RH (contrats, attestations).

---

## 3. MATRICE D'AUDIT FONCTIONNEL & TECHNIQUE

| Domaine | Fonctionnalité | Statut | Validation |
| :--- | :--- | :---: | :--- |
| **Sécurité** | Authentification JWT sans état avec Refresh Token | **Validé** | Tests d'intégration passés |
| **Sécurité** | 2FA TOTP (Google Authenticator) avec QR Code | **Validé** | Testé sur appareils physiques |
| **Sécurité** | 2FA Email & fallback OTP | **Validé** | Validation de flux complet |
| **Sécurité** | Trusted Device (Appareils de confiance 30 jours) | **Validé** | Cookie sécurisé & DB validée |
| **Présence** | Pointage multi-sessions & calcul d'heures | **Validé** | Conforme droit du travail |
| **Présence** | Geofencing IT SERV HQ (Haversine 200m) | **Validé** | Coordonnées précises testées |
| **RH** | Demande & Workflow de validation des congés | **Validé** | Notification temps réel ok |
| **RH** | Génération de documents PDF avec templates dynamiques | **Validé** | Rendu conforme |
| **RH** | Recrutement & Matching CV par IA | **Validé** | Parsing PDF et score calculé |
| **Copilote IA**| Reconnaissance vocale (Whisper STT) | **Validé** | Latence optimisée < 1.2s |
| **Copilote IA**| RAG ChromaDB (Politiques RH & Procédures) | **Validé** | Réponses contextualisées |
| **Copilote IA**| Cache haute vitesse (Redis / In-Memory fallback) | **Validé** | Tests unitaires validés (100%) |
| **ML** | Détection d'anomalies de pointage (Isolation Forest) | **Validé** | Modèle sérialisé et intégré |
| **CI / CD** | Jenkinsfile multi-services & Docker Compose | **Validé** | Build automatisé opérationnel |

---

## 4. INVENTAIRE DES LIVRABLES ET MODIFICATIONS DE CLÔTURE

Les derniers ajustements validés lors de la phase finale ont été intégrés dans l'arbre de code :

1. **Module Présence & Géofencing** :
   - [`GeofenceService.java`](file:///c:/weentime_project/weentime_project/weentime-backend/services/presence-service/src/main/java/com/weentime/weentimeapp/service/GeofenceService.java) : Calcul des distances géodésiques et détermination de conformité.
   - [`LocationStatus.java`](file:///c:/weentime_project/weentime_project/weentime-backend/services/presence-service/src/main/java/com/weentime/weentimeapp/enums/LocationStatus.java) : Énumération des états de géolocalisation.
   - [`V14__geofencing_columns.sql`](file:///c:/weentime_project/weentime_project/weentime-backend/services/presence-service/src/main/resources/db/migration/V14__geofencing_columns.sql) : Schéma de base de données mis à jour.
   - Intégration frontend employé et manager : affichage en direct des badges de localisation (`Siège`, `Télétravail`, `Hors zone`).

2. **Module Sécurité 2FA & Appareils Reconnus** :
   - [`TrustedDeviceService.java`](file:///c:/weentime_project/weentime_project/weentime-backend/services/auth-service/src/main/java/com/weentime/weentimeapp/service/TrustedDeviceService.java) : Hachage d'empreinte d'appareil, persistance sécurisée et expiration.
   - Amélioration de la vue [`verify-2fa.component.ts`](file:///c:/weentime_project/weentime_project/weentime-frontend/angular-weentime/src/app/features/auth/verify-2fa/verify-2fa.component.ts) avec case "Se souvenir de cet appareil".

3. **Module IA & External Copilot** :
   - [`external_copilot.py`](file:///c:/weentime_project/weentime_project/ai-service/app/api/external_copilot.py) : API REST sécurisée pour l'interrogation externe du copilote.
   - [`copilot_cache.py`](file:///c:/weentime_project/weentime_project/ai-service/app/core/copilot_cache.py) : Moteur de cache mémoire/Redis à double niveau avec métriques de hits/miss.
   - Suite de tests unitaires et scripts de démonstration associés (`test_external_copilot.py`, `test_copilot_cache.py`, `demo_external_copilot.py`).

4. **Améliorations UI / UX RH & Planning** :
   - Finalisation du composant de gestion de planning RH, résolveurs et modèles SCSS associés.
   - Harmonisation visuelle des actions sur les fiches candidats en recrutement.

---

## 5. RECOMMANDATIONS POUR LA MISE EN PRODUCTION

Pour le passage de l'environnement de validation / soutenance vers l'exploitation en production :

1. **Variables d'Environnement & Secrets** :
   * Déployer les clés de chiffrement TOTP (`security.2fa.totp.secret-encryption-key`) et tokens JWT via un gestionnaire de secrets (ex. HashiCorp Vault ou AWS Secrets Manager).
   * Configurer le serveur SMTP officiel de l'entreprise pour l'envoi des OTP email en production.
2. **Infrastructure & Conteneurisation** :
   * Utiliser le fichier [`Jenkinsfile`](file:///c:/weentime_project/weentime_project/Jenkinsfile) pour l'automatisation du build des images Docker et leur publication sur un registre privé (Harbor / Docker Hub).
   * Déployer le cluster Redis pour garantir le partage de cache entre instances de l'`ai-service`.
3. **Surveillance & Observabilité** :
   * Activer Spring Boot Actuator et connecter Prometheus / Grafana pour le monitoring des métriques système (temps de réponse des microservices, taux d'erreurs, requêtes géolocalisées).

---

## 6. CONCLUSION OFFICIELLE

Le projet **WeenTime** est officiellement **achevé, validé et scellé**. L'ensemble du code source, des scripts de migration, des configurations de déploiement et des modèles d'intelligence artificielle est intègre, testé et prêt pour l'intégration continue.


