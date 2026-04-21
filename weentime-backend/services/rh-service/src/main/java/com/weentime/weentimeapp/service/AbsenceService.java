package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.*;

/**
 * Contrat métier complet pour la gestion des absences.
 */
public interface AbsenceService {

    /**
     * Déclare une absence (EMPLOYEE).
     * - utilisateurId, entrepriseId, managerId extraits du JWT via email
     * - Calcule dureeJours = dateFin - dateDebut + 1
     * - Vérifie qu'il n'y a pas de chevauchement
     * - Vérifie justificatif si requireJustificatif=true
     */
    AbsenceResponse declarer(AbsenceRequest request, String userEmail);

    /**
     * Liste paginée des absences de l'employé connecté.
     */
    PageResponse<AbsenceResponse> mesAbsences(
            String userEmail,
            int page, int size,
            String statut,
            String typeCode
    );

    /**
     * Liste paginée de toutes les absences de l'entreprise (vue RH).
     */
    PageResponse<AbsenceResponse> absencesEntreprise(
            String rhEmail,
            int page, int size,
            String statut
    );

    /**
     * Valide une absence (RH).
     */
    AbsenceResponse valider(Long id, String rhEmail);

    /**
     * Rejette une absence avec motif obligatoire (RH).
     */
    AbsenceResponse rejeter(Long id, String rhEmail, String motifRefus);

    /**
     * Annulation soft-delete par l'employé propriétaire (statut → ANNULE).
     * Vérifie que la demande est EN_ATTENTE_RH et appartient à l'utilisateur.
     */
    void annuler(Long id, String userEmail);

    /**
     * Résout l'utilisateur à partir de son email via le service Organisation.
     */
    UtilisateurAuthResponse resolveUser(String email);
}
