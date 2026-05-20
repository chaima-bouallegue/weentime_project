# 4. Sprint Backlogs ? WEENTIME

## Sprint Backlog ? Sprint 0 : Analyse et sp?cification des besoins

| ID t?che | User Story li?e | T?che technique | Description d?taill?e | Responsable | Priorit? | Complexit? | Statut | Crit?res d'acceptation |
|---|---|---|---|---|---|---:|---|---|
| S0-T01 | Cadrage | ?tudier le contexte m?tier | Identifier les objectifs RH, les profils utilisateurs et les processus ? digitaliser. | Scrum Team | Haute | 3 | R?alis? | Les acteurs et besoins principaux sont d?crits. |
| S0-T02 | Cadrage | Analyser le d?p?t existant | Inspecter frontend Angular, microservices Spring Boot, AI Service et infrastructure. | Scrum Team | Haute | 5 | R?alis? | L'architecture r?elle est synth?tis?e. |
| S0-T03 | Cadrage | Identifier les acteurs | D?finir Administrateur, Responsable RH, Manager et Employ?. | Scrum Master | Haute | 2 | R?alis? | Les acteurs UML sont limit?s aux vrais utilisateurs. |
| S0-T04 | Cadrage | R?diger le Product Backlog | Formaliser les user stories avec priorit?, complexit?, statut et sprint. | Product Owner | Haute | 5 | R?alis? | Le backlog couvre les modules principaux du projet. |
| S0-T05 | Cadrage | Planifier les sprints | R?partir les stories en six sprints coh?rents. | Scrum Master | Haute | 3 | R?alis? | Chaque sprint poss?de objectif, valeur m?tier et livrables. |
| S0-T06 | UML | Produire diagrammes globaux | Cr?er cas d'utilisation global et classe globale ? partir des entit?s r?elles. | Scrum Team | Haute | 8 | R?alis? | Les diagrammes PlantUML sont compilables. |
| S0-T07 | UML | Produire diagrammes par sprint | Pr?parer cas d'utilisation, classes, s?quences et activit? par sprint. | Scrum Team | Moyenne | 8 | R?alis? | Chaque sprint poss?de ses diagrammes. |
| S0-T08 | Rapport | R?diger le chapitre 2 | R?diger introduction, besoins, Scrum, architecture, environnement et conclusion. | Scrum Team | Haute | 5 | R?alis? | Le texte est r?utilisable dans LaTeX. |

## Sprint Backlog ? Sprint 1 : Authentification, r?les et organisation

| ID t?che | User Story li?e | T?che technique | Description d?taill?e | Responsable | Priorit? | Complexit? | Statut | Crit?res d'acceptation |
|---|---|---|---|---|---|---:|---|---|
| S1-T01 | US-01 | Impl?menter connexion JWT | Exposer login c?t? auth-service et conserver le token c?t? Angular. | Backend/Frontend | Haute | 5 | R?alis? | Un utilisateur authentifi? acc?de ? son espace. |
| S1-T02 | US-02 | Ajouter v?rification 2FA | Mettre en place la page `verify-2fa` et le DTO backend `Verify2faRequest`. | Backend/Frontend | Moyenne | 5 | R?alis? | Le flux 2FA existe dans le code. |
| S1-T03 | US-03 | Prot?ger routes par r?le | Utiliser guards Angular et r?gles Spring Security. | Frontend/Backend | Haute | 5 | R?alis? | Les routes sont filtr?es selon le r?le. |
| S1-T04 | US-04 | G?rer r?les | Cr?er endpoints et UI de gestion des r?les. | Backend/Frontend | Haute | 8 | R?alis? | Les r?les sont list?s et modifiables. |
| S1-T05 | US-05 | G?rer entreprises | CRUD entreprises dans organisation-service et pages admin. | Backend/Frontend | Haute | 8 | R?alis? | L'administrateur peut consulter/g?rer les entreprises. |
| S1-T06 | US-06 | Affecter responsable RH | Impl?menter RH owner et rattachement ? entreprise. | Backend/Frontend | Haute | 8 | R?alis? | Un RH owner peut ?tre rattach? ? une entreprise. |
| S1-T07 | US-07 | G?rer utilisateurs | CRUD utilisateurs, activation, statut, profil. | Backend/Frontend | Haute | 13 | R?alis? | Les comptes sont administrables via UI et API. |
| S1-T08 | US-45 | S?curiser secrets et JWT | Centraliser la validation JWT et ?viter l'exposition de secrets. | Backend | Haute | 5 | R?alis? | Les endpoints prot?g?s n?cessitent un JWT. |

## Sprint Backlog ? Sprint 2 : Gestion RH de base et pointage

| ID t?che | User Story li?e | T?che technique | Description d?taill?e | Responsable | Priorit? | Complexit? | Statut | Crit?res d'acceptation |
|---|---|---|---|---|---|---:|---|---|
| S2-T01 | US-08 | G?rer d?partements | CRUD `Departement`, pages RH structure et outils AI associ?s. | Backend/Frontend | Haute | 8 | R?alis? | Les d?partements sont listables, cr?ables, modifiables et supprimables. |
| S2-T02 | US-09 | G?rer ?quipes | CRUD `Equipe`, membres et responsable. | Backend/Frontend | Haute | 8 | R?alis? | Les ?quipes sont administrables. |
| S2-T03 | US-10 | G?rer employ?s | Liste, formulaire employ?, profil et rattachements. | Backend/Frontend | Haute | 13 | R?alis? | RH acc?de aux employ?s et ? leurs informations. |
| S2-T04 | US-11 | Affecter employ? ? ?quipe | Mettre ? jour l'utilisateur avec `equipeId`. | Backend/AI | Haute | 5 | R?alis? | L'affectation passe par backend et confirmation AI si vocale/chat. |
| S2-T05 | US-12 | Affecter manager ? ?quipe | Mettre ? jour l'?quipe avec responsable. | Backend/AI | Haute | 5 | R?alis? | Un manager peut ?tre associ? ? une ?quipe. |
| S2-T06 | US-13 | Pointer arriv?e/d?part | Cr?er endpoints check-in/check-out et composants pointage. | Backend/Frontend | Haute | 8 | R?alis? | Le pointage personnel fonctionne. |
| S2-T07 | US-14 | Historique pointage | Exposer historique et statistiques individuelles. | Backend/Frontend | Haute | 5 | R?alis? | L'utilisateur consulte son historique. |
| S2-T08 | US-15 | Pr?sence ?quipe | Exposer pr?sence ?quipe pour manager. | Backend/Frontend | Haute | 8 | R?alis? | Le manager consulte l'?tat de pr?sence de son ?quipe. |
| S2-T09 | US-16 | Pr?sence globale RH | Exposer pr?sence entreprise pour RH/Admin. | Backend/Frontend | Haute | 8 | R?alis? | Le RH consulte la pr?sence globale. |
| S2-T10 | US-17 | Horaires | Cr?er mod?les horaires et affectations. | Backend/Frontend | Haute | 13 | R?alis? | Les horaires peuvent ?tre configur?s et affect?s. |
| S2-T11 | US-18 | Overtime | Exploiter l'entit? `Overtime`. | Backend | Moyenne | 8 | En cours | L'entit? existe ; l'exposition fonctionnelle reste ? consolider. |

## Sprint Backlog ? Sprint 3 : Cong?s, demandes RH et validations

| ID t?che | User Story li?e | T?che technique | Description d?taill?e | Responsable | Priorit? | Complexit? | Statut | Crit?res d'acceptation |
|---|---|---|---|---|---|---:|---|---|
| S3-T01 | US-19 | Soumettre cong? | Impl?menter cr?ation demande cong? et suivi statut. | Backend/Frontend | Haute | 8 | R?alis? | L'employ? cr?e une demande de cong?. |
| S3-T02 | US-20 | Consulter solde cong?s | Exposer soldes par type et ann?e. | Backend/Frontend | Haute | 5 | R?alis? | Le solde est visible c?t? employ?/RH. |
| S3-T03 | US-21 | Validation manager cong? | Cr?er actions valider/refuser manager. | Backend/Frontend | Haute | 8 | R?alis? | Le manager peut statuer sur les demandes. |
| S3-T04 | US-22 | Validation RH cong? | Cr?er file RH et validation finale. | Backend/Frontend | Haute | 8 | R?alis? | Le RH valide ou refuse les demandes RH. |
| S3-T05 | US-23 | Absences | G?rer d?clarations d'absence. | Backend/Frontend | Haute | 8 | En cours | Pages et services existent ; entit? d?di?e non clairement isol?e. |
| S3-T06 | US-24 | Autorisations | Impl?menter demande et validation autorisation. | Backend/Frontend | Haute | 8 | R?alis? | Autorisations cr??es et valid?es selon r?le. |
| S3-T07 | US-25 | T?l?travail | Impl?menter quota, demande et validations. | Backend/Frontend | Moyenne | 8 | R?alis? | Les demandes t?l?travail suivent le workflow. |
| S3-T08 | US-26 | Demandes documents | Cr?er demande document RH c?t? employ?. | Backend/Frontend | Moyenne | 8 | R?alis? | L'employ? suit ses demandes de documents. |
| S3-T09 | US-27 | Traitement documents RH | Workload, validation, upload, g?n?ration. | Backend/Frontend/AI | Haute | 13 | R?alis? | RH traite et g?n?re des documents. |
| S3-T10 | US-28 | R?unions | Consulter r?unions et prochaine r?union. | Backend/Frontend | Moyenne | 8 | R?alis? | L'utilisateur consulte ses r?unions. |
| S3-T11 | US-29 | Planning RH | Exposer vue planning et actions RH. | Backend/Frontend | Moyenne | 8 | En cours | Endpoints existent ; AI/tooling partiel. |

## Sprint Backlog ? Sprint 4 : Dashboards, notifications et communication

| ID t?che | User Story li?e | T?che technique | Description d?taill?e | Responsable | Priorit? | Complexit? | Statut | Crit?res d'acceptation |
|---|---|---|---|---|---|---:|---|---|
| S4-T01 | US-30 | Dashboard admin | Afficher sant? syst?me et indicateurs plateforme. | Frontend/Backend | Moyenne | 8 | R?alis? | Admin dispose d'une vue de synth?se. |
| S4-T02 | US-31 | Dashboard RH | Afficher backlog, stats, documents, pr?sence. | Frontend/Backend | Haute | 8 | R?alis? | RH suit l'activit? op?rationnelle. |
| S4-T03 | US-32 | Dashboard manager | Afficher approbations et ?tat ?quipe. | Frontend/Backend | Moyenne | 8 | R?alis? | Manager dispose d'un r?sum? ?quipe. |
| S4-T04 | US-33 | Dashboard employ? | Afficher actions personnelles et alertes. | Frontend/Backend/AI | Moyenne | 5 | R?alis? | Employ? consulte son espace personnel. |
| S4-T05 | US-34 | Notifications | Impl?menter notification page, cloche et temps r?el. | Backend/Frontend | Haute | 8 | R?alis? | Notifications re?ues et consultables. |
| S4-T06 | US-35 | Communication | Impl?menter channels, messages, attachments, r?actions. | Backend/Frontend | Moyenne | 13 | R?alis? | Utilisateurs communiquent via messagerie. |
| S4-T07 | US-36 | Reporting/stats | Produire indicateurs RH, pr?sence, documents. | Backend/Frontend | Moyenne | 8 | R?alis? | Les statistiques principales sont disponibles. |
| S4-T08 | US-37 | Audit/logging | Tracer actions sensibles et ?v?nements communication. | Backend | Moyenne | 8 | En cours | Entit?s audit pr?sentes ; exploitation globale ? renforcer. |

## Sprint Backlog ? Sprint 5 : Assistant IA, vocal et observabilit?

| ID t?che | User Story li?e | T?che technique | Description d?taill?e | Responsable | Priorit? | Complexit? | Statut | Crit?res d'acceptation |
|---|---|---|---|---|---|---:|---|---|
| S5-T01 | US-38 | Chatbot texte | Impl?menter `/v2/chat`, agents et routage par r?le. | AI/Frontend | Moyenne | 13 | R?alis? | L'utilisateur interagit en langage naturel. |
| S5-T02 | US-38 | ToolRegistry | Connecter les outils backend et confirmations. | AI/Backend | Haute | 13 | R?alis? | Les actions r?elles passent par ToolRegistry. |
| S5-T03 | US-39 | Commande vocale | Impl?menter `/v2/voice` et traitement vocal. | AI/Frontend | Moyenne | 13 | R?alis? | Une commande vocale produit une r?ponse s?re. |
| S5-T04 | US-40 | STT | Stabiliser conversion audio, VAD et faster-whisper. | AI | Moyenne | 8 | R?alis? | Les transcriptions FR/EN/AR/TN sont rout?es. |
| S5-T05 | US-40 | TTS fallback | G?n?rer audio si disponible, sinon texte s?r. | AI | Moyenne | 5 | R?alis? | L'?chec TTS ne bloque pas la r?ponse. |
| S5-T06 | US-41 | Multilingue | Normaliser FR, EN, AR, TN/Tounsi. | AI | Moyenne | 8 | R?alis? | Les intentions ?quivalentes sont reconnues. |
| S5-T07 | US-42 | RAG cit? | R?pondre aux politiques RH avec citations. | AI | Moyenne | 8 | R?alis? | Pas de citation = r?ponse indisponible. |
| S5-T08 | US-43 | Observabilit? | Tracer provider, outils, RAG, voix et requ?tes. | AI/Admin | Faible | 8 | R?alis? | Les diagnostics AI sont consultables. |
| S5-T09 | US-44 | Supervision syst?me | Exposer provider, Redis, RAG, Braintrust. | AI/Admin | Moyenne | 5 | R?alis? | Admin obtient un statut non secret. |
| S5-T10 | US-45 | ResponseGuard | Emp?cher fausses donn?es, secrets, SQL brut. | AI | Haute | 8 | R?alis? | Les r?ponses non s?res sont rejet?es. |
