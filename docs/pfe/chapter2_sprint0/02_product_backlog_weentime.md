# 2. Product Backlog ? WEENTIME

| ID | Epic / Module | User Story | Description | Acteur principal | Priorit? | Complexit? | Statut | Release propos?e | Sprint propos? |
|---|---|---|---|---|---|---:|---|---|---|
| US-01 | Authentification | En tant qu'utilisateur, je veux m'authentifier afin d'acc?der ? mon espace s?curis?. | Connexion, JWT, protection des routes et r?cup?ration du profil courant. | Employ? | Haute | 5 | R?alis? | R1 | Sprint 1 |
| US-02 | Authentification | En tant qu'utilisateur, je veux utiliser une v?rification 2FA afin de renforcer la s?curit?. | Page Angular `verify-2fa`, DTO `Verify2faRequest`, d?pendance Google Authenticator. | Employ? | Moyenne | 5 | R?alis? | R1 | Sprint 1 |
| US-03 | S?curit? | En tant qu'administrateur, je veux g?rer les r?les afin de contr?ler les acc?s. | Entit? `Role`, contr?leurs r?les, guards Angular et JWT. | Administrateur | Haute | 8 | R?alis? | R1 | Sprint 1 |
| US-04 | S?curit? | En tant qu'administrateur, je veux attribuer un r?le ? un utilisateur. | Gestion admin utilisateurs et r?les ; outils AI admin pour changement de r?le. | Administrateur | Haute | 5 | R?alis? | R1 | Sprint 1 |
| US-05 | Organisation | En tant qu'administrateur, je veux g?rer les entreprises. | CRUD entreprises dans `organisation-service`, pages admin entreprises. | Administrateur | Haute | 8 | R?alis? | R1 | Sprint 1 |
| US-06 | Organisation | En tant qu'administrateur, je veux affecter un responsable RH ? une entreprise. | RH owner pages/services et endpoints de gestion RH owner. | Administrateur | Haute | 8 | R?alis? | R1 | Sprint 1 |
| US-07 | Utilisateurs | En tant qu'administrateur, je veux g?rer les comptes utilisateurs. | Cr?ation, consultation, modification, suppression et statut utilisateur. | Administrateur | Haute | 13 | R?alis? | R1 | Sprint 1 |
| US-08 | Structure | En tant que RH, je veux g?rer les d?partements. | Entit? `Departement`, contr?leur, pages RH structure et outils AI RH. | Responsable RH | Haute | 8 | R?alis? | R1 | Sprint 2 |
| US-09 | Structure | En tant que RH, je veux g?rer les ?quipes. | Entit? `Equipe`, contr?leur, pages ?quipes, affectation manager/membres. | Responsable RH | Haute | 8 | R?alis? | R1 | Sprint 2 |
| US-10 | Employ?s | En tant que RH, je veux g?rer les employ?s. | Liste, profil, activation/d?sactivation partielle selon endpoints et UI. | Responsable RH | Haute | 13 | R?alis? | R1 | Sprint 2 |
| US-11 | Organisation | En tant que RH, je veux affecter un employ? ? une ?quipe. | Affectation via mise ? jour utilisateur ; outil AI RH connect?. | Responsable RH | Haute | 5 | R?alis? | R1 | Sprint 2 |
| US-12 | Organisation | En tant que RH/Admin, je veux affecter un manager ? une ?quipe. | Mise ? jour ?quipe avec responsable ; pages structure managers. | Responsable RH | Haute | 5 | R?alis? | R1 | Sprint 2 |
| US-13 | Pointage | En tant qu'employ?, je veux pointer mon arriv?e et mon d?part. | Endpoints presence check-in/check-out et composants pointage. | Employ? | Haute | 8 | R?alis? | R1 | Sprint 2 |
| US-14 | Pointage | En tant qu'employ?, je veux consulter mon historique de pointage. | Historique pr?sence personnel et statistiques de pr?sence. | Employ? | Haute | 5 | R?alis? | R1 | Sprint 2 |
| US-15 | Pointage ?quipe | En tant que manager, je veux consulter la pr?sence de mon ?quipe. | Endpoints team presence, pages manager presence. | Manager | Haute | 8 | R?alis? | R1 | Sprint 2 |
| US-16 | Pointage RH | En tant que RH, je veux consulter la pr?sence globale. | Endpoints company presence/stats, pages RH pointage. | Responsable RH | Haute | 8 | R?alis? | R1 | Sprint 2 |
| US-17 | Horaires | En tant que RH, je veux configurer les horaires de travail. | Entit?s `HoraireModele`, `HoraireJour`, `AffectationHoraire`, pages horaires. | Responsable RH | Haute | 13 | R?alis? | R1 | Sprint 2 |
| US-18 | Heures suppl?mentaires | En tant que manager/RH, je veux suivre les heures suppl?mentaires. | Entit? `Overtime` pr?sente dans `presence-service`; exposition fonctionnelle partielle. | Manager | Moyenne | 8 | En cours | R2 | Sprint 2 |
| US-19 | Cong?s | En tant qu'employ?, je veux soumettre une demande de cong?. | Entit? `Conge`, endpoints cong?s, UI employ?, outils AI leave. | Employ? | Haute | 8 | R?alis? | R1 | Sprint 3 |
| US-20 | Cong?s | En tant qu'employ?, je veux consulter mon solde de cong?s. | Entit? `SoldeConge`, endpoints soldes, cartes solde frontend. | Employ? | Haute | 5 | R?alis? | R1 | Sprint 3 |
| US-21 | Cong?s | En tant que manager, je veux valider ou refuser une demande de cong?. | Workflow manager et endpoints validation manager. | Manager | Haute | 8 | R?alis? | R1 | Sprint 3 |
| US-22 | Cong?s | En tant que RH, je veux effectuer la validation RH finale. | Endpoints RH pending/validate/reject et pages RH cong?s. | Responsable RH | Haute | 8 | R?alis? | R1 | Sprint 3 |
| US-23 | Absences | En tant qu'employ?, je veux d?clarer une absence. | Pages absences et services RH ; entit? d?di?e non observ?e, g?r?e avec workflows RH. | Employ? | Haute | 8 | En cours | R1 | Sprint 3 |
| US-24 | Autorisations | En tant qu'employ?, je veux demander une autorisation. | Entit? `Autorisation`, endpoints, UI employ?/manager/RH, outils AI. | Employ? | Haute | 8 | R?alis? | R1 | Sprint 3 |
| US-25 | T?l?travail | En tant qu'employ?, je veux demander du t?l?travail. | Entit? `Teletravail`, quota, validation manager/RH. | Employ? | Moyenne | 8 | R?alis? | R1 | Sprint 3 |
| US-26 | Documents RH | En tant qu'employ?, je veux demander un document RH. | Entit? `Document`, demandes, t?l?chargement et suivi. | Employ? | Moyenne | 8 | R?alis? | R1 | Sprint 3 |
| US-27 | Documents RH | En tant que RH, je veux traiter et g?n?rer les documents demand?s. | Workload RH, upload, validation, refus, g?n?ration IA. | Responsable RH | Haute | 13 | R?alis? | R1 | Sprint 3 |
| US-28 | R?unions | En tant qu'utilisateur, je veux consulter mes r?unions. | `Reunion`, `ParticipantReunion`, routes r?union et outils AI read. | Employ? | Moyenne | 8 | R?alis? | R2 | Sprint 3 |
| US-29 | Planning | En tant que RH, je veux consulter le planning RH. | `RhPlanningController` et page RH planning, outils AI partiels. | Responsable RH | Moyenne | 8 | En cours | R2 | Sprint 3 |
| US-30 | Dashboards | En tant qu'administrateur, je veux consulter un dashboard plateforme. | Dashboard admin, statistiques et diagnostics. | Administrateur | Moyenne | 8 | R?alis? | R2 | Sprint 4 |
| US-31 | Dashboards | En tant que RH, je veux consulter les indicateurs RH. | RH dashboard, stats RH, documents, pr?sence, t?l?travail. | Responsable RH | Haute | 8 | R?alis? | R2 | Sprint 4 |
| US-32 | Dashboards | En tant que manager, je veux suivre mon ?quipe. | Manager dashboard, pr?sence, demandes, approbations. | Manager | Moyenne | 8 | R?alis? | R2 | Sprint 4 |
| US-33 | Dashboards | En tant qu'employ?, je veux consulter mon espace personnel. | Employee dashboard, r?sum? quotidien et alertes personnelles. | Employ? | Moyenne | 5 | R?alis? | R2 | Sprint 4 |
| US-34 | Notifications | En tant qu'utilisateur, je veux recevoir des notifications. | Entit?s notification, page notifications, WebSocket/Redis. | Employ? | Haute | 8 | R?alis? | R2 | Sprint 4 |
| US-35 | Communication | En tant qu'utilisateur, je veux communiquer par messages et channels. | `CommChannel`, `CommMessage`, WebSocket, attachments, unread. | Employ? | Moyenne | 13 | R?alis? | R2 | Sprint 4 |
| US-36 | Reporting | En tant que RH/Admin, je veux consulter des statistiques. | Endpoints stats RH, pr?sence globale, documents, t?l?travail. | Responsable RH | Moyenne | 8 | R?alis? | R2 | Sprint 4 |
| US-37 | Audit | En tant qu'administrateur, je veux tracer les actions sensibles. | `UserAuditLog`, `CommAuditLog`, logs et observabilit?. | Administrateur | Moyenne | 8 | En cours | R2 | Sprint 4 |
| US-38 | AI Chatbot | En tant qu'utilisateur, je veux interagir avec un assistant IA. | FastAPI `/v2/chat`, agents par domaine, ToolRegistry, ResponseGuard. | Employ? | Moyenne | 13 | R?alis? | R2 | Sprint 5 |
| US-39 | Assistant vocal | En tant qu'utilisateur, je veux utiliser une commande vocale. | FastAPI `/v2/voice`, STT, routage, ToolRegistry, TTS optionnel. | Employ? | Moyenne | 13 | R?alis? | R2 | Sprint 5 |
| US-40 | STT/TTS | En tant qu'utilisateur, je veux que la voix soit transcrite et lue. | faster-whisper, VAD, conversion audio, Coqui/Piper fallback. | Employ? | Moyenne | 13 | R?alis? | R2 | Sprint 5 |
| US-41 | Multilingue | En tant qu'utilisateur, je veux utiliser FR/EN/AR/TN. | Normalisation, d?tection langue, intents multilingues. | Employ? | Moyenne | 8 | R?alis? | R2 | Sprint 5 |
| US-42 | RAG politique RH | En tant qu'utilisateur, je veux poser des questions sur les politiques RH. | RAG local/Chroma, citations obligatoires, sources approuv?es. | Employ? | Moyenne | 8 | R?alis? | R2 | Sprint 5 |
| US-43 | Observabilit? IA | En tant qu'admin, je veux suivre la sant? du module IA. | Health v2, Braintrust, m?triques provider/tools/RAG/voice. | Administrateur | Faible | 8 | R?alis? | R2 | Sprint 5 |
| US-44 | Supervision syst?me | En tant qu'admin, je veux consulter l'?tat Redis/RAG/provider. | Diagnostics admin et endpoint health deep. | Administrateur | Moyenne | 5 | R?alis? | R2 | Sprint 5 |
| US-45 | S?curit? avanc?e | En tant qu'admin, je veux ?viter les fuites de secrets. | Redaction, ResponseGuard, JWT, validation ToolRegistry. | Administrateur | Haute | 8 | R?alis? | R2 | Sprint 5 |
| US-46 | Recrutement/formation | En tant que RH, je veux g?rer recrutement et formation. | Aucun module complet v?rifi? dans le d?p?t. | Responsable RH | Faible | 13 | ? compl?ter | R3 | Hors sprint actuel |
| US-47 | Signature ?lectronique | En tant que RH, je veux envoyer des documents ? signer. | Non v?rifi? comme module op?rationnel. | Responsable RH | Faible | 13 | ? compl?ter | R3 | Hors sprint actuel |
| US-48 | Sauvegarde/restauration DB | En tant qu'admin, je veux g?rer les sauvegardes. | Non expos? comme fonctionnalit? applicative. | Administrateur | Faible | 13 | ? compl?ter | R3 | Hors sprint actuel |
