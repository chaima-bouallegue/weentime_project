# CHAPITRE 4. SPRINT 2 : GESTION ORGANISATIONNELLE, DES HORAIRES, DU POINTAGE, DES RÉUNIONS ET DU PLANNING

## 4.1 Spécification des besoins

Le Sprint 2 a pour objectif principal la mise en place de la structure organisationnelle, la planification du temps de travail, le suivi de présence en temps réel et la gestion collaborative des réunions au sein de la plateforme WEENTIME. D'une durée de quatre semaines, ce sprint marque une étape majeure dans la digitalisation des processus opérationnels de l'entreprise, en traduisant les liens hiérarchiques et les règles de gestion du temps en fonctionnalités logicielles concrètes.

Ce sprint couvre principalement la modélisation de la structure de l'entreprise en départements et équipes, l'affectation des collaborateurs et de leurs managers associés, la gestion avancée des modèles horaires, le pointage quotidien d'arrivée et de départ avec détection des anomalies, la planification des réunions d'équipe avec système d'invitation/RSVP, ainsi que la vue d'ensemble du planning RH d'entreprise.

Les besoins fonctionnels détaillés réalisés et implémentés au sein de notre application durant ce sprint sont structurés autour des modules clés suivants :

*   **Gestion de la structure organisationnelle (Départements) :**
    *   **Consultation et supervision :** Visualisation dynamique de la liste des départements de l'entreprise en temps réel, incluant des indicateurs synthétiques de charge tels que le nombre d'équipes opérationnelles rattachées et l'effectif global d'employés sous chaque département.
    *   **Ajout et création automatisée :** Formulaire de création de nouveaux départements (nom et description). À la validation, l'application génère automatiquement un code interne standardisé unique (par normalisation de la casse et filtrage des caractères spéciaux, sous la forme `NOM-DEPARTEMENT`) assurant l'unicité fonctionnelle.
    *   **Modification et mise à jour :** Édition fluide du nom et de la description des départements existants, tout en conservant l'intégrité de l'isolation multi-tenant pour garantir la sécurité des données propres à chaque entreprise.
    *   **Suppression contrôlée :** Retrait d'un département de la structure de l'entreprise après vérification de l'absence de liaisons actives (équipes ou employés rattachés) afin d'éviter tout enregistrement orphelin.
*   **Gestion des équipes (Teams) :**
    *   **Création et structuration :** Ajout de nouvelles équipes de travail caractérisées par un nom, une description, un effectif maximum conseillé (plafonné à 50 membres par défaut) et un rattachement obligatoire à un département parent.
    *   **Attribution et modification hiérarchique :** Désignation ou modification dynamique du manager responsable de l'équipe (`managerId` / `responsableId`) assurant le chaînage d'approbation et de supervision.
    *   **Gestion des membres :** Affectation rapide et modification du rattachement des collaborateurs aux différentes équipes opérationnelles avec possibilité de filtrage et recherche textuelle.
    *   **Consultation globale :** Tableau de bord affichant le statut (active/inactive), l'effectif actuel, le nom du manager responsable, ainsi que la liste nominative détaillée de tous les collaborateurs membres de chaque équipe.
    *   **Suppression sécurisée :** Retrait d'une équipe active de l'organigramme avec désaffectation automatique et réaffectation sécurisée de ses membres.
*   **Gestion des modèles et des affectations horaires (Schedules) :**
    *   **Configuration de modèles horaires (CRUD) :**
        *   Création de modèles d'horaires personnalisés avec nom, type (`FIXE` ou `FLEXIBLE`), cible d'heures hebdomadaires standard (ex. 35h) et statut de validité (`ACTIF` / `INACTIF`).
        *   Planification détaillée jour par jour (du lundi au dimanche) : activation individuelle des jours travaillés et configuration de plages horaires définies par type (`TRAVAIL`, `PAUSE` ou `REPOS`) avec saisie stricte des heures de début et de fin.
        *   Calcul instantané et automatique des heures cumulées hebdomadaires basées exclusivement sur les plages de type `TRAVAIL`.
        *   Outil de duplication rapide ("Appliquer à tous") permettant de copier instantanément les plages horaires du lundi sur l'ensemble des jours ouvrés de la semaine (mardi au vendredi).
        *   Validateur anti-chevauchement intégré pour empêcher l'enregistrement de plages conflictuelles pour une même journée.
        *   Possibilité de marquer un modèle d'horaire comme "Horaire par défaut" pour l'ensemble de l'organisation.
    *   **Affectation dynamique des horaires :**
        *   Ciblage flexible : Affectation de plannings au niveau global de l'organisation (`ENTREPRISE`), au niveau d'un groupe de travail (`EQUIPE`), ou de manière nominative et individuelle (`UTILISATEUR`).
        *   Résolution automatique des priorités (3 niveaux) : Priorité 1 (Entreprise - modèle par défaut), Priorité 2 (Équipe - écrase l'entreprise), Priorité 3 (Utilisateur - écrase l'équipe et l'entreprise) pour une flexibilité maximale dans la gestion opérationnelle.
        *   Gestion temporelle : Paramétrage d'une période d'application (date de début et date de fin optionnelle) accompagnée d'un motif administratif.
        *   Détection des chevauchements d'affectations : Contrôle automatique en temps réel à la soumission. En cas de conflit avec un planning déjà actif sur la période demandée, le système propose un avertissement interactif demandant à l'utilisateur de forcer ou d'annuler l'opération.
*   **Gestion de présence et Pointage quotidien (Attendance) :**
    *   **Pointage d'arrivée et de départ (Check-in / Check-out) :**
        *   Enregistrement quotidien en un clic depuis le portail web de l'heure précise d'arrivée et de départ.
        *   Suivi et stockage de la source de pointage (ex. `WEB`) et des détails de localisation.
        *   Prise en charge de sessions multiples de présence (`AttendanceSession`) sur une même journée permettant de gérer les temps de pause ou de coupure.
        *   Chronomètre dynamique en temps réel affiché au format digital (hh:mm:ss) sur l'interface, affichant la durée de travail écoulée de la session active cumulée aux sessions précédentes de la journée.
    *   **Détection automatique d'anomalies :**
        *   Calcul automatique du retard d'arrivée (`lateArrival`) en comparant l'heure de pointage réel de l'employé avec l'heure de début prévue dans le modèle horaire actif qui lui est assigné pour le jour concerné.
    *   **Tableaux de bord et Statistiques de présence :**
        *   *Vue Employé* : Historique complet des pointages personnels, affichage des statuts journaliers (Présent, Absent, Retard), et calcul automatique de statistiques consolidées (total des heures effectuées sur la semaine, heures supplémentaires cumulées, moyenne de l'heure d'arrivée, décompte des retards).
        *   *Vue Manager (Équipe)* : Supervision en temps réel de l'état de présence de son équipe (collaborateurs actuellement en cours de travail, en pause, ou absents) pour piloter l'activité au quotidien.
        *   *Vue RH (Entreprise)* : Console de supervision globale agrégeant les statistiques de présence à l'échelle de toute l'entreprise (volume horaire global effectué, anomalies de pointage, taux d'absentéisme).
*   **Gestion collaborative des réunions (Meetings) :**
    *   **Assistant de planification (3 étapes) :**
        *   *Étape 1 (Informations générales)* : Saisie des données de base de la réunion (Titre, description, date, heure de début/fin, périodicité [aucune, quotidienne, hebdomadaire, mensuelle] et ordre du jour/agenda).
        *   *Étape 2 (Sélection des participants)* : Filtrage intelligent selon les rôles. Un RH a accès à l'intégralité de l'annuaire d'entreprise, tandis qu'un Manager accède automatiquement aux membres des équipes qu'il supervise en direct.
        *   *Étape 3 (Détection automatique des conflits)* : Analyse de disponibilité en temps réel (`checkConflicts`) interrogeant les plannings de tous les participants invités afin d'alerter immédiatement en cas d'overlap de réunions.
        *   *Finalisation* : Choix du type de réunion (Présentiel avec adresse/lieu physique, ou Distanciel/Visioconférence avec intégration d'un lien de téléconférence unique).
    *   **Invitation, Suivi des invitations (RSVP) et Intégration Conversationnelle :**
        *   **Envoi d'invitations personnalisées** : Lors de la création de la réunion, l'organisateur (RH ou Manager) dispose d'un champ d'édition pré-rempli avec une suggestion de message professionnel (ex. *"Bonjour, une réunion est planifiée : [Titre] le [Date] à [Heure]. Merci de confirmer votre présence."*). L'organisateur a le plein contrôle pour modifier et personnaliser ce message avant la validation finale.
        *   **Publication automatique dans le module Discussion** : En plus des notifications applicatives standards, le système se synchronise avec le module de communication pour publier automatiquement le message d'invitation personnalisé dans une discussion de groupe regroupant tous les invités, ou dans le canal d'équipe concerné, favorisant les échanges directs et accélérant le RSVP.
        *   **Suivi visuel interactif des réponses** : Visualisation en temps réel des réponses des participants (Accepté/Confirmé, Refusé, En attente) avec des statistiques de réponse claires sur la fiche détaillée de la réunion.
        *   **Compte à rebours dynamique** : Notification et compte à rebours de la "Prochaine réunion" (ex. *"dans 2h 45m"*) affiché de manière premium directement sur le tableau de bord personnel de chaque utilisateur.
        *   **Édition en ligne** : Possibilité pour l'organisateur de modifier en temps réel la description ou l'agenda de la réunion.
    *   **Clôture et Compte-rendu de réunion (Minutes & Report) :**
        *   *Feuille d'émargement* : Déclaration nominative des participants effectivement présents lors de la session.
        *   *Rédaction structurée* : Saisie guidée des minutes articulée autour de trois axes fondamentaux : "Points discutés", "Décisions prises" et "Actions à suivre".
        *   *Génération intelligente par IA* : Intégration du modèle Gemini de Google (`aiService.generateMeetingReport`) pour rédiger de façon autonome et premium le compte-rendu sur la base des informations descriptives de la réunion et de son ordre du jour.
        *   *Export PDF Professionnel* : Générateur de mise en page premium permettant d'imprimer ou de sauvegarder le compte-rendu officiel et la liste d'émargement au format PDF en un clic.
*   **Mise en place d'une vue planning RH consolidée :**
    *   Visualisation graphique interactive de type frise chronologique (timeline) pour piloter le planning de l'ensemble de l'organisation en temps réel, avec des filtres multicritères par équipe ou par département.

Ainsi, ce sprint consolide les fondations métiers de WEENTIME et fournit aux managers et responsables RH les outils de supervision nécessaires pour piloter le capital humain et organiser efficacement le quotidien des équipes.

### 4.1.1 Backlog du Sprint 2

Le Sprint 2 a pour objectif la mise en place de la gestion organisationnelle, de la planification du temps, du pointage et des réunions sur la plateforme WEENTIME. Ce backlog détaille les user stories associées, découpées en tâches techniques avec leur niveau de priorité et leur estimation de charge.

Table 4.1 – Backlog du Sprint 2 (Durée : 4 semaines)

| ID | User Story | ID tâche | Tâches | Priorité | Estimation |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **US08** | En tant que responsable RH, je souhaite gérer les départements afin de structurer les divisions de l'entreprise. | US08.1 <br> US08.2 <br> US08.3 | Créer l'interface de gestion des départements. <br> Développer les endpoints CRUD de département (`organisation-service`). <br> Tester la cohérence et l'isolation multi-tenant. | 1 <br> 1 <br> 2 | 3 jours |
| **US09** | En tant que responsable RH, je souhaite gérer les équipes afin d'organiser les groupes de travail. | US09.1 <br> US09.2 <br> US09.3 | Créer l'interface de gestion des équipes. <br> Développer les endpoints CRUD d'équipe. <br> Développer la liste et l'affichage des membres par équipe. | 1 <br> 1 <br> 2 | 3 jours |
| **US10** | En tant que responsable RH, je souhaite gérer les fiches employés afin de maintenir à jour les informations des collaborateurs. | US10.1 <br> US10.2 <br> US10.3 | Créer l'interface de consultation et liste des employés. <br> Implémenter la fiche profil détaillée du collaborateur. <br> Tester les liaisons avec l'organisation globale. | 1 <br> 1 <br> 2 | 3 jours |
| **US11** | En tant que responsable RH, je souhaite affecter les employés à des équipes afin de définir leur rattachement opérationnel. | US11.1 <br> US11.2 | Développer l'interface d'affectation rapide des employés. <br> Implémenter la logique d'affectation backend dans `organisation-service`. | 1 <br> 1 | 2 jours |
| **US12** | En tant que responsable RH ou Administrateur, je souhaite affecter un manager à une équipe afin de désigner un responsable hiérarchique. | US12.1 <br> US12.2 | Créer la vue d'attribution des managers et responsables d'équipes. <br> Développer la logique de mise à jour des liaisons manager/équipe. | 1 <br> 1 | 2 jours |
| **US13** | En tant qu'employé, je souhaite pointer mon arrivée et mon départ afin d'enregistrer mes heures de travail. | US13.1 <br> US13.2 <br> US13.3 <br> US13.4 | Créer l'interface de pointage (check-in / check-out). <br> Développer la logique de session de présence (`attendance_sessions`). <br> Implémenter la détection de retard (`lateArrival`) par rapport au planning. <br> Tester la sécurité des flux de pointage. | 1 <br> 1 <br> 2 <br> 2 | 4 jours |
| **US14** | En tant qu'employé, je souhaite consulter mon historique de pointage afin de vérifier mes heures travaillées. | US14.1 <br> US14.2 | Développer l'interface de consultation de l'historique personnel. <br> Implémenter le calcul et l'affichage des statistiques de présence. | 1 <br> 1 | 2 jours |
| **US15** | En tant que manager, je souhaite consulter la présence de mon équipe afin de piloter l'activité quotidienne. | US15.1 <br> US15.2 | Créer l'interface de suivi de présence équipe. <br> Développer l'API de récupération des états de présence de l'équipe. | 1 <br> 1 | 3 jours |
| **US16** | En tant que responsable RH, je souhaite consulter la présence globale de l'entreprise afin d'assurer la supervision administrative. | US16.1 <br> US16.2 | Créer la page de supervision de présence entreprise (RH). <br> Développer les endpoints d'agrégation de statistiques globales. | 1 <br> 2 | 2 jours |
| **US17** | En tant que responsable RH, je souhaite configurer les horaires de travail et les affecter aux collaborateurs. | US17.1 <br> US17.2 <br> US17.3 <br> US17.4 | Créer l'interface de configuration des modèles horaires. <br> Développer la gestion des plages et jours travaillés (`work_schedule_days`). <br> Développer la logique d'affectation horaire (`AffectationHoraire`). <br> Tester les chevauchements et conflits d'horaires. | 1 <br> 1 <br> 1 <br> 2 | 4 jours |
| **US18** | En tant qu'utilisateur, je souhaite planifier et consulter les réunions afin de faciliter la collaboration d'équipe. | US18.1 <br> US18.2 <br> US18.3 <br> US18.4 | Créer l'interface utilisateur de planification de réunion. <br> Développer l'API de création et d'invitation des participants (`Reunion`). <br> Développer le système de réponse RSVP. <br> Gérer l'affichage de la prochaine réunion sur le dashboard personnel. | 1 <br> 1 <br> 2 <br> 2 | 4 jours |
| **US19** | En tant que responsable RH, je souhaite consulter le planning global afin d'avoir une vue consolidée de l'organisation. | US19.1 <br> US19.2 | Créer le composant de visualisation graphique (timeline) du planning. <br> Développer les API de regroupement et de filtrage du planning RH. | 1 <br> 2 | 3 jours |
