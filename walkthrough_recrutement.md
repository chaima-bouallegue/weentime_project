# ══════════════════════════════════════════════════════════════════════════
# DOCUMENT DE RÉFÉRENCE TECHNIQUE : MODULE RECRUTEMENT & PRÉSÉLECTION IA
# ══════════════════════════════════════════════════════════════════════════

Ce document sert de référence technique exhaustive décrivant la conception, l'architecture, l'implémentation et les protocoles de sécurité du module de recrutement de la plateforme WeenTime, incluant la présélection de CV en temps réel par l'intelligence artificielle Gemini.

---

## 1. VUE D'ENSEMBLE DU FLUX BOUT EN BOUT

Le cycle de vie complet d'une candidature au sein du module recrutement s'organise selon un pipeline asynchrone, sécurisé et réactif en temps réel :

```mermaid
sequenceDiagram
    autonumber
    actor C as Candidat
    actor RH as Recruteur RH
    participant FE as Frontend Angular
    participant GW as API Gateway (8222)
    participant JV as Backend Java (8192)
    participant PY as AI Service Python (8000)
    participant GEM as Google Gemini API

    C->>FE: Soumet sa candidature (Infos + Fichier CV PDF)
    FE->>GW: POST /api/v1/public/recrutement/jobs/{id}/apply (Form-Data)
    GW->>JV: Reroute la candidature
    Note over JV: Enregistrement initial en DB (Statut: APPLIED)
    Note over JV: Changement immédiat du statut -> AI_ANALYZING
    JV-->>FE: HTTP 201 Created (Candidature enregistrée)
    
    rect rgb(240, 248, 255)
        Note over JV: Déclenchement Asynchrone (@Async)
        JV->>PY: POST /recruitment/evaluate-cv (Multipart: File + Form Params)
    end
    
    FE->>RH: Affiche la carte candidat avec un spinner animé (AI_ANALYZING)
    
    Note over PY: Extraction du texte du PDF en mémoire vive (RAM)
    PY->>GEM: Appel API avec prompt structuré & contraintes JSON
    GEM-->>PY: Retourne l'analyse structurée
    Note over PY: Validation & Normalisation des scores (0-100)
    
    rect rgb(255, 240, 245)
        Note over PY: Callback HTTP Sécurisé
        PY->>JV: POST /api/v1/internal/recruitment/applications/{id}/ai-result (Secret Header)
    end

    Note over JV: Persistance des 12 dimensions de l'analyse en DB
    Note over JV: Changement statut -> AI_ANALYZED
    
    par Envoi Notification Temps Réel
        JV->>FE: STOMP WebSocket sur /topic/role/rh (Type: RECRUITMENT_AI_RESULT)
        FE->>RH: Met à jour dynamiquement la carte candidat (Score + Badges) sans rechargement
    and Envoi Email Confirmation
        JV->>JV: Envoi de l'email de confirmation de candidature sans mention de l'IA
    end
    
    RH->>FE: Clique sur le bouton "Voir le CV"
    FE->>JV: GET /api/v1/recrutement/applications/{id}/cv (JWT RH)
    Note over JV: Vérification stricte d'isolation Tenant (Entreprise ID)
    JV-->>FE: Stream du PDF (inline; Content-Type: application/pdf)
    FE->>RH: Ouvre le CV natif dans un nouvel onglet
```

### Détail des Étapes Clés du Workflow :
1. **Soumission** : Le candidat dépose ses informations et son fichier CV (PDF) via le portail de carrière public.
2. **Prise en charge asynchrone** : Le backend Java enregistre instantanément le candidat, lui attribue le statut temporaire `AI_ANALYZING` (ce qui déclenche un indicateur visuel de chargement côté RH) et libère la connexion du candidat.
3. **Analyse en Isolation** : Le service Java délègue de façon non-bloquante (`@Async`) le traitement binaire du PDF au service Python dédié.
4. **Interrogation IA** : Le service Python extrait textuellement le PDF en mémoire RAM (aucune écriture disque n'est faite pour éviter des failles de sécurité ou des congestions d'espace), puis interroge l'API Google Gemini avec des exigences de schéma JSON strictes.
5. **Callback Intégré** : L'analyse structurée est renvoyée au backend Java via un canal interne ultra-sécurisé par clé partagée.
6. **Mise à Jour Synchrone / Asynchrone** : La base de données PostgreSQL est mise à jour. Immédiatement, une notification WebSocket STOMP pousse l'événement au tableau de bord RH, qui redessine la carte candidat avec les scores et compétences en temps réel.
7. **Emails transactionnels** : Un email transactionnel, rédigé par un humain de manière bienveillante (sans mention algorithmique), est acheminé au candidat.

---

## 2. BACKEND JAVA — `rh-service`

L'ensemble du code Java réside sous le projet parent `weentime-backend/services/rh-service`. Les fichiers suivants ont été créés, enrichis ou modifiés pour supporter ce nouveau module :

### 📂 [1] `com.weentime.weentimeapp.enums.ApplicationStatus`
*   **Emplacement** : `src/main/java/com/weentime/weentimeapp/enums/ApplicationStatus.java`
*   **État initial** : Contenait uniquement les statuts standards `APPLIED`, `UNDER_REVIEW`, `SHORTLISTED`, `REJECTED`.
*   **Modifications apportées** : Ajout des constantes `AI_ANALYZING` et `AI_ANALYZED`.
*   **Raison** : Permettre au système de suivre l'état de l'évaluation IA. Le statut `AI_ANALYZING` sert à afficher le spinner animé sur le frontend, évitant ainsi l'effet "boîte noire", tandis que `AI_ANALYZED` indique la complétion réussie de l'analyse.

### 📂 [2] `com.weentime.weentimeapp.entity.Application`
*   **Emplacement** : `src/main/java/com/weentime/weentimeapp/entity/Application.java`
*   **État initial** : Possédait un modèle de persistance de base contenant uniquement les informations de contact, le statut et 4 champs IA rudimentaires (`aiOverallScore`, `aiTechnicalScore`, `aiRecommendation`, `aiRecommendationSummary`).
*   **Modifications apportées** : Ajout de 8 colonnes relationnelles typées et annotations JPA :
    ```java
    private BigDecimal aiExperienceScore;
    private BigDecimal aiCompetenceScore;

    @Column(columnDefinition = "TEXT")
    private String aiPointsForts;          // Stocké sous forme de tableau JSON

    @Column(columnDefinition = "TEXT")
    private String aiPointsFaibles;         // Stocké sous forme de tableau JSON

    @Column(columnDefinition = "TEXT")
    private String aiCompetencesTrouvees;   // Stocké sous forme de tableau JSON

    @Column(columnDefinition = "TEXT")
    private String aiCompetencesManquantes; // Stocké sous forme de tableau JSON

    private Integer aiExperienceDetectee;
    private Integer aiNiveauConfiance;
    ```
*   **Raison** : Modéliser avec précision l'évaluation multidimensionnelle de l'IA (scores segmentés, adéquation d'expérience, niveau de confiance de la décision et détails textuels sérialisés en JSON) pour alimenter l'interface RH riche.

### 📂 [3] `com.weentime.weentimeapp.dto.ApplicationDTO`
*   **Emplacement** : `src/main/java/com/weentime/weentimeapp/dto/ApplicationDTO.java`
*   **État initial** : Exposait un sous-ensemble limité des informations d'une candidature.
*   **Modifications apportées** : Alignement complet sur l'entité enrichie `Application.java` en y ajoutant les 8 nouvelles propriétés IA.
*   **Raison** : Transporter l'intégralité des dimensions analytiques depuis la couche de persistance jusqu'à l'API Gateway et le client Angular.

### 📂 [4] `com.weentime.weentimeapp.service.AiService`
*   **Emplacement** : `src/main/java/com/weentime/weentimeapp/service/AiService.java`
*   **État initial** : Service fictif effectuant des simulations de scores avec des threads bloquants.
*   **Modifications apportées** : Refonte totale pour implémenter un client HTTP asynchrone non-bloquant inter-microservices :
    *   **Annotation `@Async`** : Exécute le traitement dans un pool de threads dédié distinct de la requête HTTP principale.
    *   **Binary Stream Ingestion** : Lit le fichier PDF local sous forme de `FileSystemResource`.
    *   **Multipart Construction** : Compile une requête HTTP POST `multipart/form-data` comprenant le binaire du fichier, les compétences requises formatées en chaîne de tableau JSON, le niveau d'expérience et l'ID du candidat.
    *   **Fallback d'erreur unifié** : En cas de déconnexion réseau ou d'exception lors de l'appel au service IA Python, le service effectue un rollback sécurisé en ramenant le statut de la candidature à `APPLIED` pour que le recruteur puisse toujours traiter le dossier manuellement sans erreur bloquante.

### 📂 [5] `com.weentime.weentimeapp.service.RecruitmentService`
*   **Emplacement** : `src/main/java/com/weentime/weentimeapp/service/RecruitmentService.java`
*   **Modifications apportées** : Ajout des deux signatures de contrats d'interface indispensables :
    ```java
    void processAiResult(Long applicationId, java.util.Map<String, Object> aiResult);
    org.springframework.core.io.Resource getCvFile(Long applicationId, Long entrepriseId);
    ```
*   **Raison** : Déclarer la méthode de traitement des résultats du callback IA et la méthode d'extraction sécurisée du fichier CV d'un candidat.

### 📂 [6] `com.weentime.weentimeapp.service.impl.RecruitmentServiceImpl`
*   **Emplacement** : `src/main/java/com/weentime/weentimeapp/service/impl/RecruitmentServiceImpl.java`
*   **Modifications apportées** :
    1.  **Refonte de `submitApplication`** : 
        *   Calcul du chemin de stockage du CV dans `uploads/recrutement/{entrepriseId}/cvs/`.
        *   Sauvegarde de la candidature en statut `AI_ANALYZING` avec un statut d'analyse `ANALYZING`.
        *   Extraction dynamique des compétences requises du poste (`job.getCompetencesRequises()`) et délégation à `aiService.evaluateCvAsync()`.
    2.  **Implémentation de `processAiResult`** :
        *   Extraction et validation des scores segmentés et des tableaux JSON.
        *   Mise à jour de l'entité et transition du statut à `AI_ANALYZED`.
        *   Envoi d'un message WebSocket unifié via `NotificationSender` contenant le type d'action `RECRUITMENT_AI_RESULT` et l'ID de candidature.
    3.  **Implémentation robuste de `getCvFile`** :
        *   **Contrôle strict du Tenant** : Compare l'ID entreprise de la candidature avec celui du recruteur connecté. Lève une erreur `403 Forbidden` en cas d'accès illicite inter-entreprise.
        *   **Résolution relative en cascade (Dev Local)** : Si le fichier n'est pas présent directement sur le chemin relatif de la base de données, la méthode vérifie intelligemment les répertoires d'exécution alternatifs (`weentime-backend/services/rh-service/`, `services/rh-service/`, etc.), évitant toute erreur de dossier d'exécution en développement local.
        *   **Préservation des exceptions** : Utilisation d'un rattrapage d'erreur spécifique pour laisser se propager les exceptions `ResponseStatusException` (comme `404 Not Found`) sans les masquer sous forme d'une erreur standard `500`.

### 📂 [7] `com.weentime.weentimeapp.controller.RecruitmentController`
*   **Emplacement** : `src/main/java/com/weentime/weentimeapp/controller/RecruitmentController.java`
*   **Modifications apportées** : Ajout du endpoint de visualisation sécurisée :
    ```java
    @GetMapping("/applications/{id}/cv")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<org.springframework.core.io.Resource> getCv(@PathVariable Long id) {
        org.springframework.core.io.Resource resource = recruitmentService.getCvFile(id, getEntrepriseId());
        return ResponseEntity.ok()
                .contentType(org.springframework.http.MediaType.APPLICATION_PDF)
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }
    ```
*   **Raison** : Offrir aux recruteurs un accès fluide aux documents CV originaux sous format de streaming `inline`, permettant de lire le PDF nativement dans le navigateur sans forcer son téléchargement.

### 📂 [8] `com.weentime.weentimeapp.controller.InternalRecruitmentController`
*   **Emplacement** : `src/main/java/com/weentime/weentimeapp/controller/InternalRecruitmentController.java`
*   **Description** : Nouveau contrôleur interne créé.
*   **Modifications apportées** : Implémentation de la réception sécurisée du callback d'analyse :
    ```java
    @RestController
    @RequestMapping("/api/v1/internal/recruitment")
    @RequiredArgsConstructor
    public class InternalRecruitmentController {
        private final RecruitmentService recruitmentService;
        
        @Value("${weentime.internal.secret}")
        private String internalSecret;

        @PostMapping("/applications/{id}/ai-result")
        public ResponseEntity<Void> receiveAiResult(
                @PathVariable Long id, 
                @RequestHeader("X-Internal-Secret") String secret,
                @RequestBody Map<String, Object> body) {
            if (!internalSecret.equals(secret)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
            recruitmentService.processAiResult(id, body);
            return ResponseEntity.ok().build();
        }
    }
    ```
*   **Raison** : Exposer un endpoint performant destiné exclusivement aux appels inter-microservices en validant l'authenticité par secret partagé.

### 📂 [9] `com.weentime.weentimeapp.service.RecruitmentEmailService`
*   **Emplacement** : `src/main/java/com/weentime/weentimeapp/service/RecruitmentEmailService.java`
*   **Description** : Nouveau service d'envoi d'emails transactionnels pour le module recrutement, connecté au serveur MailDev local (ou Resend en production).
*   **Contrats d'emails implémentés** :
    1.  `sendApplicationConfirmation(...)` : Envoyé dès la réception de candidature. Fournit un numéro de référence unique et des conseils professionnels d'attente.
    2.  `sendShortlistEmail(...)` : Déclenché lorsque le statut passe à `SHORTLISTED`. Invite le candidat à planifier un entretien téléphonique.
    3.  `sendRejectionEmail(...)` : Rédigé de façon très encourageante en transmettant des ondes positives pour la suite des recherches.
    4.  > [!IMPORTANT]
        > **Règle d'or de communication** : Aucun email ne fait référence aux scores d'IA, aux algorithmes ou aux évaluations automatiques. Toutes les formulations présentent les décisions comme 100% humaines pour préserver la confiance des candidats.

### 📂 [10] `com.weentime.weentimeapp.config.SecurityConfig`
*   **Emplacement** : `src/main/java/com/weentime/weentimeapp/config/SecurityConfig.java`
*   **Modifications apportées** :
    *   Exemption de sécurité pour le endpoint de callback interne : `.requestMatchers("/api/v1/internal/recruitment/**").permitAll()`
    *   Toutes les routes d'administration `/api/v1/recrutement/**` restent sous authentification JWT obligatoire via `anyRequest().authenticated()`.
*   **Raison** : Permettre à Python d'appeler l'endpoint Java en interne sans jeton JWT utilisateur, tout en verrouillant la sécurité par le header `X-Internal-Secret`.

---

## 3. AI SERVICE PYTHON — `ai-service`

Le microservice d'intelligence artificielle est un serveur léger écrit avec **FastAPI** situé sous le répertoire `ai-service/`.

### 📂 [1] `app.api.recruitment_ia`
*   **Emplacement** : `ai-service/app/api/recruitment_ia.py`
*   **État initial** : Endpoint rudimentaire de simulation.
*   **Modifications apportées** : Réécriture complète avec intégration native de Gemini, parsing PDF résilient et callback de synchronisation :
    1.  **Ingestion Binaire en Mémoire** : Réception du fichier sous forme de type `UploadFile = File(...)` via FastAPI.
    2.  **Extraction PDF robuste** : Lecture et extraction du contenu textuel de chaque page du PDF directement en mémoire vive à l'aide de la librairie `pypdf` :
        ```python
        pdf_bytes = io.BytesIO(await file.read())
        reader = pypdf.PdfReader(pdf_bytes)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        ```
    3.  **Prompt Gemini Strictement Typé** : Envoi au modèle Gemini (avec une température fixe de `0.1` pour éviter toute dérive créative) avec des consignes strictes de formatage de sortie JSON :
        ```
        Vous êtes un expert en recrutement technique et analyse de CV.
        Analysez le CV fourni par rapport aux critères du poste :
        - Compétences requises : {competences_requises}
        - Niveau d'expérience minimum requis : {niveau_experience} ({experience_min_annees} ans)

        Retournez UNIQUEMENT un objet JSON plat sans balises markdown, avec la structure suivante :
        {
          "aiOverallScore": <float 0-100 (score d'adéquation global)>,
          "aiTechnicalScore": <float 0-100 (score technique sur les compétences clés)>,
          "aiExperienceScore": <float 0-100 (score basé sur la durée et le niveau de responsabilité)>,
          "aiCompetenceScore": <float 0-100 (score basé sur la correspondance des compétences)>,
          "aiRecommendation": "<'FORTEMENT_RECOMMANDE' | 'RECOMMANDE' | 'A_EVITER'>",
          "aiRecommendationSummary": "<synthèse de 3 phrases maximum évaluant le profil, points forts et lacunes par rapport au poste>",
          "aiPointsForts": ["point 1", "point 2", ...],
          "aiPointsFaibles": ["lacune 1", "lacune 2", ...],
          "aiCompetencesTrouvees": ["compétence 1", "compétence 2", ...],
          "aiCompetencesManquantes": ["compétence attendue manquante 1", ...],
          "aiExperienceDetectee": <integer (nombre d'années d'expérience identifiées dans le domaine)>,
          "aiNiveauConfiance": <integer 0-100 (indice de confiance de l'évaluation IA)>
        }
        ```
    4.  **Normalisation des scores** : Définition de verrous logiciels garantissant que tous les scores retournés sont bien des nombres réels encadrés dans l'intervalle `[0.0, 100.0]`.
    5.  **Mécanisme de Callback Robuste** : Transmission automatique des métadonnées vers Java en injectant le secret partagé :
        ```python
        headers = {"X-Internal-Secret": settings.INTERNAL_SECRET}
        # Envoi en tâche de fond asynchrone HTTP POST
        ```
    6.  **Gestionnaire d'Erreurs & Rollback** : En cas d'échec de lecture du PDF ou de rejet de l'API Gemini, une fonction de secours `_send_failure_callback` est immédiatement déclenchée pour notifier Java de l'erreur afin de restaurer le statut de la candidature à `FAILED` (permettant un traitement manuel).

### 📂 [2] Variables d'environnement ajoutées au fichier `.env`
*   **Emplacement** : `ai-service/.env`
*   **Variables ajoutées** :
    *   `INTERNAL_SECRET` : Clé secrète de sécurité partagée avec le service Java.
    *   `JAVA_RH_SERVICE_URL` : URL de communication HTTP vers Java (`http://localhost:8192` par défaut en local).

---

## 4. FRONTEND ANGULAR

Le code frontend réside au sein de l'application Angular sous le répertoire `angular-weentime/`.

### 📂 [1] `recrutement.service.ts`
*   **Emplacement** : `src/app/features/rh/recrutement/services/recrutement.service.ts`
*   **Modifications apportées** :
    *   **Enrichissement de l'interface `Application`** avec les 9 nouvelles propriétés analytiques de l'IA.
    *   **Ajout de la méthode de récupération binaire de CV** :
        ```typescript
        getApplicationCv(id: number): Observable<Blob> {
          return this.http.get(this.api.RECRUTEMENT.GET_APP_CV(id), {
            responseType: 'blob'
          });
        }
        ```

### 📂 [2] `job-detail.component.ts`
*   **Emplacement** : `src/app/features/rh/recrutement/components/job-detail/job-detail.component.ts`
*   **Modifications apportées** :
    1.  **Abonnement WebSocket Temps Réel** : Souscription dynamique au topic STOMP `/topic/role/rh` dès le démarrage. Lors de la réception d'un payload de type `RECRUITMENT_AI_RESULT`, le composant rafraîchit immédiatement la liste des candidats et affiche un toast toast de félicitations.
    2.  **Gestion de l'affichage sécurisé du CV** :
        ```typescript
        openCv(app: Application) {
          if (!app || !app.id) return;
          this.toast.info('Chargement du CV...');
          this.recruitmentService.getApplicationCv(app.id).subscribe({
            next: (blob) => {
              const url = window.URL.createObjectURL(blob);
              window.open(url, '_blank');
              setTimeout(() => window.URL.revokeObjectURL(url), 60000); // Évite les fuites mémoire
            },
            error: (err) => {
              this.toast.error('Impossible de charger le fichier du CV.');
            }
          });
        }
        ```
    3.  **Méthodes Helpers Cosmétiques** :
        *   `getScoreColor(score)` : Retourne un dégradé de vert si $> 80$, d'orange si $\ge 60$ et de rouge si $< 60$.
        *   `getRecommandationLabel(rec)` : Traduit les enums techniques (`FORTEMENT_RECOMMANDE`) en textes français élégants.
        *   `parseJsonArray(str)` : Parse de manière sécurisée les chaînes JSON persistées en DB pour les afficher sous forme de tags individuels.

### 📂 [3] `job-detail.component.html`
*   **Emplacement** : `src/app/features/rh/recrutement/components/job-detail/job-detail.component.html`
*   **Modifications apportées** :
    *   **Spinner d'évaluation IA** : Affiché si `app.status === 'AI_ANALYZING'`. Propose un message rassurant de chargement.
    *   **Cercle de score IA Conic-Gradient** : Un magnifique conteneur circulaire calculé dynamiquement en fonction du score d'adéquation global du candidat.
    *   **Conteneur d'Analyse Structurée** :
        *   Badge de recommandation coloré.
        *   Tags distincts pour les compétences trouvées (badge vert avec icône coche ✓) et compétences manquantes (badge rouge avec icône croix ✗).
        *   Bloc de citation pour le résumé de synthèse IA.
    *   **Disclaimer Légal Obligatoire** : Ajout d'une clause explicite en bas de page informant les utilisateurs que la décision finale est prise exclusivement par le recruteur.
    *   **Bouton d'action CV connecté** : Liaison de l'événement `(click)="openCv(app)"` au bouton CV.

### 📂 [4] `job-detail.component.scss`
*   **Emplacement** : `src/app/features/rh/recrutement/components/job-detail/job-detail.component.scss`
*   **Modifications apportées** :
    *   Design Premium doté de **glassmorphism** (effets de flou d'arrière-plan, bordures subtiles).
    *   Animations harmonieuses au survol de la souris.
    *   Typographie haut de gamme et gestion irréprochable du **mode sombre (Dark Mode)** via des variables CSS unifiées.

---

## 5. BASE DE DONNÉES (POSTGRESQL)

Les structures de persistance SQL ont été adaptées à la fois dans les schémas JPA et nettoyées en base de données de production :

### 📊 Colonnes Ajoutées à la table `applications` :
| Nom de colonne | Type SQL | Rôle |
| :--- | :--- | :--- |
| `ai_experience_score` | `NUMERIC(19,2)` | Score partiel sur la pertinence de l'expérience |
| `ai_competence_score` | `NUMERIC(19,2)` | Score partiel sur l'adéquation des compétences |
| `ai_points_forts` | `TEXT` | Tableau JSON des points forts du candidat |
| `ai_points_faibles` | `TEXT` | Tableau JSON des axes d'amélioration du candidat |
| `ai_competences_trouvees` | `TEXT` | Tableau JSON des compétences requises présentes |
| `ai_competences_manquantes`| `TEXT` | Tableau JSON des compétences clés absentes |
| `ai_experience_detectee` | `INTEGER` | Nombre d'années d'expérience calculées |
| `ai_niveau_confiance` | `INTEGER` | Indice de confiance de la prédiction (0-100%) |

### 🔄 Nettoyage de contraintes & Enums :
*   **Nouveaux statuts de l'enum `ApplicationStatus`** : `AI_ANALYZING`, `AI_ANALYZED`.
*   **Suppression de la contrainte obsolète** :
    Hibernate ne parvenait pas à ajouter de nouvelles valeurs d'enum en raison de la contrainte d'intégrité PostgreSQL d'origine nommée `applications_status_check`.
    * **Action effectuée** : Suppression physique de cette ancienne contrainte restrictive en DB :
      ```sql
      ALTER TABLE applications DROP CONSTRAINT applications_status_check;
      ```

---

## 6. ARCHITECTURE & COMMUNICATION INTER-SERVICES

Voici le détail complet des protocoles de communication réseau pour chaque flux :

```
[FLUX 1 : Candidature]
Angular (Client) === Form-Data avec Fichier CV ===> API Gateway (8222) ===> Java Backend (8192)
                                                                                  |
                                                                        (@Async non-bloquant)
                                                                                  |
                                                                      Multipart HTTP POST (PDF)
                                                                                  |
                                                                                  v
                                                                        Python Service (8000)

[FLUX 2 : Callback IA]
Python (FastAPI) === POST (Analyse JSON) + Header X-Internal-Secret ===> Java Backend (8192)

[FLUX 3 : Temps Réel]
Java Backend === STOMP over WebSocket (RECRUITMENT_AI_RESULT) ===> Angular Client (Mise à jour instantanée)

[FLUX 4 : Consultation CV]
Angular (Client) === Requête GET Authentifiée JWT ===> Java Backend (8192) ===> Lit PDF local ===> Stream Inline au Navigateur
```

---

## 7. PROTOCOLE DE SÉCURITÉ

La sécurité du module de recrutement repose sur un modèle à double barrière :

1.  **Isolation Multi-Tenant Strict** :
    *   Toutes les données de candidatures et de fichiers CV sont étiquetées par un `entreprise_id`.
    *   Lors de chaque appel RH (comme la consultation de CV), le backend extrait l'ID d'entreprise du token JWT sécurisé du recruteur connecté et le valide par rapport à la ressource demandée. Si les identifiants ne correspondent pas, un code `403 Forbidden` bloque immédiatement l'accès.
2.  **Secret Inter-Services Partagé (`X-Internal-Secret`)** :
    *   Les communications directes entre les serveurs s'affranchissent des tokens utilisateurs JWT (puisque le traitement s'effectue en arrière-plan en tâche de fond asynchrone).
    *   Pour authentifier les requêtes de callback de Python vers Java, les deux services s'échangent une clé secrète cryptographique forte définie sous la variable `INTERNAL_SECRET`.
    *   Java valide la clé reçue dans le header HTTP `X-Internal-Secret` de chaque requête et rejette instantanément tout appel malveillant externe.

---

## 8. EMAILS TRANSACTIONNELS TRANSACTIONNELS (MAILDEV & RESEND)

Trois types d'emails élégants et responsives ont été implémentés dans [RecruitmentEmailService.java](file:///c:/weentime_project/weentime_project/weentime-backend/services/rh-service/src/main/java/com/weentime/weentimeapp/service/RecruitmentEmailService.java) :

1.  **Email de Confirmation de Candidature** :
    *   *Déclencheur* : Soumission d'une candidature par le candidat.
    *   *Objet* : `Candidature reçue - [Titre du Poste] - Réf: #[IdCandidat]`
    *   *Contenu* : Remerciement poli, attribution de la référence unique, et explication des prochaines étapes de sélection.
2.  **Email de Candidat Présélectionné (Shortlist)** :
    *   *Déclencheur* : Le recruteur clique sur le bouton "Shortlister" dans le tableau de bord RH.
    *   *Objet* : `Bonne nouvelle concernant votre candidature chez WeenTime !`
    *   *Contenu* : Message d'enthousiasme positif, invitation officielle à planifier un premier échange téléphonique informel.
3.  **Email de Rejet (Refus)** :
    *   *Déclencheur* : Le recruteur clique sur le bouton "Rejeter".
    *   *Objet* : `Votre candidature pour le poste de [Titre du Poste]`
    *   *Contenu* : Message très chaleureux, poli et encourageant pour la suite de sa carrière professionnelle, tout en formulant une réponse de rejet constructive et 100% humaine.

---

## 9. VARIABLES D'ENVIRONNEMENT DE RÉFÉRENCE

Voici la liste exhaustive des variables à configurer pour le bon fonctionnement du module recrutement :

### 📂 Backend Java (`rh-service`)
*   `weentime.internal.secret` *(Défaut: "WnT-secret-internal-key-2026")* : Clé de validation des callbacks Python.
*   `weentime.ai.service-url` *(Défaut: "http://localhost:8000")* : Adresse réseau pour joindre le serveur Python FastAPI en local.
*   `spring.datasource.url` *(Défaut: "jdbc:postgresql://localhost:5435/rh_db")* : Chaîne de connexion à la base PostgreSQL de développement.

### 📂 AI Gateway (`ai-service`)
*   `INTERNAL_SECRET` *(Défaut: "WnT-secret-internal-key-2026")* : Clé secrète de validation à injecter dans le header `X-Internal-Secret`.
*   `JAVA_RH_SERVICE_URL` *(Défaut: "http://localhost:8192")* : Adresse réseau pour joindre le microservice Java en local.
*   `GEMINI_API_KEY` : Clé d'authentification officielle de l'API Google Gemini.

---

## 10. FEUILLE DE ROUTE - PERSPECTIVES D'ÉVOLUTION (V2)

Plusieurs fonctionnalités de pointe sont planifiées pour la phase V2 du module recrutement :

1.  **Extraction Intelligente de Profils Sociaux** : Analyse automatique des profils LinkedIn et GitHub des candidats via des agents d'exploration IA complémentaires pour affiner le score technique global.
2.  **Planification d'Entretiens Automatisée** : Connexion directe des emails de shortlist à un calendrier de disponibilité partagé (de type Calendly/WeenTime Calendar) pour permettre aux candidats de planifier automatiquement leurs créneaux.
3.  **Anonymisation des CV (RGPD)** : Possibilité de masquer les données nominatives (nom, prénom, photo, coordonnées) sur les documents CV en un clic pour assurer un processus de présélection 100% neutre et inclusif.
4.  **Mise à niveau de la messagerie instantanée (Redis)** : Activation du canal Redis de publication/souscription pour gérer des volumes de candidatures massifs à l'échelle de l'entreprise.
