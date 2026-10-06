-- ==============================================================================
-- Seed Script: Données Démo Soutenance WeenTime (Télétravail, Autorisations, Congés)
-- Entreprise : IT Serv (ID: 2)
-- Manager    : Molka Bouallegue (ID: 10)
-- Collaborateurs : Assia Sannen (23), Firas Bouallegue (11), Marwa Wechtati (14),
--                  Hayet Medini (9), Yahya Bouallegue (17)
-- ==============================================================================

DO $$
DECLARE
    d_id bigint;
    now_ts timestamp := '2026-09-16 10:00:00';
BEGIN
    -- --------------------------------------------------------------------------
    -- 1. DEMANDES DE TÉLÉTRAVAIL
    -- --------------------------------------------------------------------------

    -- T1: Assia Sannen - EN_ATTENTE_MANAGER (Demain 17/09)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire, statut, type_demande, date_creation, version)
    VALUES (23, 10, 2, 'Finalisation du module de reporting et préparation de la démo', NULL, 'EN_ATTENTE_MANAGER', 'TELETRAVAIL', '2026-09-16 08:30:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO teletravails (demande_id, date_debut, date_fin, nombre_jours, type_teletravail, periode, etape_actuelle, adresse)
    VALUES (d_id, '2026-09-17', '2026-09-17', 1.0, 'JOURNEE_COMPLETE', NULL, 'MANAGER', 'Télétravail à domicile');

    -- T2: Firas Bouallegue - EN_ATTENTE_MANAGER (Vendredi 18/09)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire, statut, type_demande, date_creation, version)
    VALUES (11, 10, 2, 'Optimisation des requêtes SQL et tests de charge de la base', NULL, 'EN_ATTENTE_MANAGER', 'TELETRAVAIL', '2026-09-16 09:15:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO teletravails (demande_id, date_debut, date_fin, nombre_jours, type_teletravail, periode, etape_actuelle, adresse)
    VALUES (d_id, '2026-09-18', '2026-09-18', 1.0, 'JOURNEE_COMPLETE', NULL, 'MANAGER', 'Télétravail à domicile');

    -- T3: Marwa Wechtati - EN_ATTENTE_RH (Lundi 21/09) [Manager a validé, RH peut valider pendant la démo]
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire, commentaire_validateur, statut, type_demande, date_creation, version)
    VALUES (14, 10, 2, 'Rédaction de la documentation technique et architecture', NULL, 'Validé par le manager Molka', 'EN_ATTENTE_RH', 'TELETRAVAIL', '2026-09-15 14:00:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO teletravails (demande_id, date_debut, date_fin, nombre_jours, type_teletravail, periode, etape_actuelle, commentaire_manager, adresse)
    VALUES (d_id, '2026-09-21', '2026-09-21', 1.0, 'JOURNEE_COMPLETE', NULL, 'RH', 'Objectifs de sprint atteints. Avis favorable.', 'Télétravail à domicile');

    -- T4: Hayet Medini - EN_ATTENTE_RH (Mardi 22/09) [RH peut valider pendant la démo]
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire, commentaire_validateur, statut, type_demande, date_creation, version)
    VALUES (9, 10, 2, 'Intégration continue et recettes des services RH', NULL, 'Accordé côté équipe backend', 'EN_ATTENTE_RH', 'TELETRAVAIL', '2026-09-15 16:30:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO teletravails (demande_id, date_debut, date_fin, nombre_jours, type_teletravail, periode, etape_actuelle, commentaire_manager, adresse)
    VALUES (d_id, '2026-09-22', '2026-09-22', 1.0, 'JOURNEE_COMPLETE', NULL, 'RH', 'Validé pour la recette technique.', 'Télétravail à domicile');

    -- T5: Yahya Bouallegue - EN_ATTENTE_RH (Mercredi 23/09, Demi-journée matin)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire, commentaire_validateur, statut, type_demande, date_creation, version)
    VALUES (17, 10, 2, 'Passage technicien fibre optique à domicile', NULL, 'Accordé pour le matin', 'EN_ATTENTE_RH', 'TELETRAVAIL', '2026-09-16 08:00:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO teletravails (demande_id, date_debut, date_fin, nombre_jours, type_teletravail, periode, etape_actuelle, commentaire_manager, adresse)
    VALUES (d_id, '2026-09-23', '2026-09-23', 0.5, 'DEMI_JOURNEE_MATIN', 'MATIN', 'RH', 'Pas d impact sur le standup de l après-midi.', 'Télétravail à domicile');

    -- T6: Assia Sannen - APPROUVEE (Mardi 08/09 - passé récent ce mois)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, date_decision, version)
    VALUES (23, 10, 2, 'Conception ergonomique et maquettage des interfaces', 'Validé par RH et Manager', 'APPROUVEE', 'TELETRAVAIL', '2026-09-04 10:00:00', '2026-09-05 16:30:00', 1)
    RETURNING id INTO d_id;
    INSERT INTO teletravails (demande_id, date_debut, date_fin, nombre_jours, type_teletravail, periode, etape_actuelle, commentaire_manager, commentaire_rh, adresse)
    VALUES (d_id, '2026-09-08', '2026-09-08', 1.0, 'JOURNEE_COMPLETE', NULL, 'TERMINE', 'Favorable', 'Approuvé par le service RH', 'Télétravail à domicile');

    -- T7: Firas Bouallegue - APPROUVEE (Vendredi 11/09 - passé récent ce mois)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, date_decision, version)
    VALUES (11, 10, 2, 'Refactorisation de la persistance JPA et benchmarks', 'Approuvé', 'APPROUVEE', 'TELETRAVAIL', '2026-09-07 11:00:00', '2026-09-09 14:20:00', 1)
    RETURNING id INTO d_id;
    INSERT INTO teletravails (demande_id, date_debut, date_fin, nombre_jours, type_teletravail, periode, etape_actuelle, commentaire_manager, commentaire_rh, adresse)
    VALUES (d_id, '2026-09-11', '2026-09-11', 1.0, 'JOURNEE_COMPLETE', NULL, 'TERMINE', 'Accordé', 'Validé par RH', 'Télétravail à domicile');

    -- T8: Yahya Bouallegue - REFUSEE (Vendredi 04/09)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, date_decision, version)
    VALUES (17, 10, 2, 'Télétravail de convenance personnelle', 'Présence physique requise en plénière', 'REFUSEE', 'TELETRAVAIL', '2026-09-02 09:30:00', '2026-09-03 15:00:00', 1)
    RETURNING id INTO d_id;
    INSERT INTO teletravails (demande_id, date_debut, date_fin, nombre_jours, type_teletravail, periode, etape_actuelle, commentaire_manager, commentaire_rh, adresse)
    VALUES (d_id, '2026-09-04', '2026-09-04', 1.0, 'JOURNEE_COMPLETE', NULL, 'TERMINE', 'Présence obligatoire pour la plénière trimestrielle.', 'Refusé selon avis manager.', 'Télétravail à domicile');

    -- --------------------------------------------------------------------------
    -- 2. DEMANDES D'AUTORISATION DE SORTIE / COURTE DURÉE
    -- Types pour Entreprise 2 :
    --   1: Sortie anticipé
    --   3: Rendez-vous médical
    --   4: Démarche administrative
    --   5: Absence temporaire
    -- --------------------------------------------------------------------------

    -- A1: Assia Sannen - EN_ATTENTE_MANAGER (17/09, 15:30 - 17:30, 2h)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire, statut, type_demande, date_creation, version)
    VALUES (23, 10, 2, 'Démarche administrative impérative en mairie (renouvellement passeport)', NULL, 'EN_ATTENTE_MANAGER', 'AUTORISATION', '2026-09-16 09:10:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO autorisations (demande_id, type_autorisation_id, date_autorisation, heure_debut, heure_fin, duree)
    VALUES (d_id, 4, '2026-09-17', '15:30:00', '17:30:00', 120);

    -- A2: Firas Bouallegue - EN_ATTENTE_MANAGER (18/09, 10:00 - 11:30, 1h30)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire, statut, type_demande, date_creation, version)
    VALUES (11, 10, 2, 'Consultation médicale spécialisée ophtalmologique', NULL, 'EN_ATTENTE_MANAGER', 'AUTORISATION', '2026-09-16 09:45:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO autorisations (demande_id, type_autorisation_id, date_autorisation, heure_debut, heure_fin, duree)
    VALUES (d_id, 3, '2026-09-18', '10:00:00', '11:30:00', 90);

    -- A3: Marwa Wechtati - EN_ATTENTE_RH (17/09, 16:00 - 17:30, 1h30) [Manager validé, prêt pour démo RH]
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, version)
    VALUES (14, 10, 2, 'Sortie anticipée pour obligation parentale urgente', 'Accordé par Molka - rattrapage convenu vendredi matin.', 'EN_ATTENTE_RH', 'AUTORISATION', '2026-09-15 15:30:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO autorisations (demande_id, type_autorisation_id, date_autorisation, heure_debut, heure_fin, duree)
    VALUES (d_id, 1, '2026-09-17', '16:00:00', '17:30:00', 90);

    -- A4: Hayet Medini - EN_ATTENTE_RH (21/09, 09:00 - 11:00, 2h) [Manager validé, prêt pour démo RH]
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, version)
    VALUES (9, 10, 2, 'Signature chez le notaire pour acquisition immobilière', 'Favorable - pas de réunion impactée', 'EN_ATTENTE_RH', 'AUTORISATION', '2026-09-15 11:00:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO autorisations (demande_id, type_autorisation_id, date_autorisation, heure_debut, heure_fin, duree)
    VALUES (d_id, 4, '2026-09-21', '09:00:00', '11:00:00', 120);

    -- A5: Assia Sannen - APPROUVEE (07/09, 14:00 - 15:30, 1h30)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, date_decision, version)
    VALUES (23, 10, 2, 'Visite médicale de contrôle annuelle', 'Approuvé avec justificatif', 'APPROUVEE', 'AUTORISATION', '2026-09-04 14:00:00', '2026-09-05 17:00:00', 1)
    RETURNING id INTO d_id;
    INSERT INTO autorisations (demande_id, type_autorisation_id, date_autorisation, heure_debut, heure_fin, duree)
    VALUES (d_id, 3, '2026-09-07', '14:00:00', '15:30:00', 90);

    -- A6: Yahya Bouallegue - APPROUVEE (10/09, 16:00 - 18:00, 2h)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, date_decision, version)
    VALUES (17, 10, 2, 'Départ anticipé pour transport exceptionnel', 'Validé par RH', 'APPROUVEE', 'AUTORISATION', '2026-09-08 16:00:00', '2026-09-09 17:30:00', 1)
    RETURNING id INTO d_id;
    INSERT INTO autorisations (demande_id, type_autorisation_id, date_autorisation, heure_debut, heure_fin, duree)
    VALUES (d_id, 1, '2026-09-10', '16:00:00', '18:00:00', 120);

    -- A7: Firas Bouallegue - APPROUVEE (14/09, 11:00 - 12:30, 1h30)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, date_decision, version)
    VALUES (11, 10, 2, 'Consultation dentaire urgente', 'Validé', 'APPROUVEE', 'AUTORISATION', '2026-09-11 11:30:00', '2026-09-12 14:00:00', 1)
    RETURNING id INTO d_id;
    INSERT INTO autorisations (demande_id, type_autorisation_id, date_autorisation, heure_debut, heure_fin, duree)
    VALUES (d_id, 3, '2026-09-14', '11:00:00', '12:30:00', 90);

    -- A8: Marwa Wechtati - REFUSEE (02/09, 14:00 - 17:00, 3h)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, date_decision, version)
    VALUES (14, 10, 2, 'Sortie anticipée pour convenance personnelle', 'Durée trop longue (3h) pendant la livraison du sprint. Poser une demi-journée de congé.', 'REFUSEE', 'AUTORISATION', '2026-09-01 10:00:00', '2026-09-01 16:30:00', 1)
    RETURNING id INTO d_id;
    INSERT INTO autorisations (demande_id, type_autorisation_id, date_autorisation, heure_debut, heure_fin, duree)
    VALUES (d_id, 1, '2026-09-02', '14:00:00', '17:00:00', 180);

    -- --------------------------------------------------------------------------
    -- 3. DEMANDES DE CONGÉS EN SEPTEMBRE 2026 (Complément pour Dashboard/Calendrier)
    -- Type Congé 1: Annuel (Entreprise 2)
    -- --------------------------------------------------------------------------

    -- C1: Assia Sannen - EN_ATTENTE_RH (24/09 au 25/09, 2 jours)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, version)
    VALUES (23, 10, 2, 'Congé annuel de fin de semaine prolongé', 'Favorable - manager', 'EN_ATTENTE_RH', 'CONGE', '2026-09-16 08:45:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO conges (demande_id, type_conge_id, date_debut, date_fin, nombre_jours, justificatif_fourni)
    VALUES (d_id, 1, '2026-09-24', '2026-09-25', 2, false);

    -- C2: Firas Bouallegue - EN_ATTENTE_MANAGER (28/09 au 30/09, 3 jours)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, statut, type_demande, date_creation, version)
    VALUES (11, 10, 2, 'Congé annuel pour repos personnel', 'EN_ATTENTE_MANAGER', 'CONGE', '2026-09-16 09:00:00', 0)
    RETURNING id INTO d_id;
    INSERT INTO conges (demande_id, type_conge_id, date_debut, date_fin, nombre_jours, justificatif_fourni)
    VALUES (d_id, 1, '2026-09-28', '2026-09-30', 3, false);

    -- C3: Hayet Medini - APPROUVEE (03/09 au 04/09, 2 jours)
    INSERT INTO demandes (utilisateur_id, manager_id, entreprise_id, motif, commentaire_validateur, statut, type_demande, date_creation, date_decision, version)
    VALUES (9, 10, 2, 'Repos estival et récupération', 'Validé RH', 'APPROUVEE', 'CONGE', '2026-08-28 10:00:00', '2026-08-29 15:00:00', 1)
    RETURNING id INTO d_id;
    INSERT INTO conges (demande_id, type_conge_id, date_debut, date_fin, nombre_jours, justificatif_fourni)
    VALUES (d_id, 1, '2026-09-03', '2026-09-04', 2, false);

END $$;

-- Mise à jour de la séquence auto-incrémentée de demandes
SELECT setval('demandes_id_seq', (SELECT max(id) FROM demandes));
