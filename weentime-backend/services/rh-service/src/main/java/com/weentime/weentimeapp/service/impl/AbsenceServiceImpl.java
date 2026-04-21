package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.entity.Absence;
import com.weentime.weentimeapp.entity.TypeAbsence;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.mapper.AbsenceMapper;
import com.weentime.weentimeapp.repository.AbsenceRepository;
import com.weentime.weentimeapp.repository.TypeAbsenceRepository;
import com.weentime.weentimeapp.service.AbsenceService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.access.AccessDeniedException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

@Service
@RequiredArgsConstructor
@Transactional
@Slf4j
@SuppressWarnings("null")
public class AbsenceServiceImpl implements AbsenceService {

    private final AbsenceRepository absenceRepository;
    private final TypeAbsenceRepository typeAbsenceRepository;
    private final AbsenceMapper absenceMapper;
    private final OrganisationServiceClient organisationClient;
    private final com.weentime.weentimeapp.service.AsyncNotificationService asyncNotificationService;

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEE — Déclarer
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public AbsenceResponse declarer(AbsenceRequest request, String userEmail) {

        // 1. Résolution utilisateur via JWT email
        UtilisateurAuthResponse user = resolveUser(userEmail);

        // 2. Validation dates
        if (request.getDateFin().isBefore(request.getDateDebut())) {
            throw new IllegalArgumentException("La date de fin doit être postérieure ou égale à la date de début.");
        }

        // 3. Vérification chevauchement
        boolean overlap = absenceRepository.existsOverlap(
                user.getId(),
                user.getEntrepriseId(),
                request.getDateDebut(),
                request.getDateFin(),
                null);
        if (overlap) {
            throw new IllegalStateException(
                    "Une absence existe déjà sur cette période. Vérifiez vos dates.");
        }

        // 4. Type d'absence
        TypeAbsence typeAbsence = typeAbsenceRepository.findById(request.getTypeAbsenceId())
                .orElseThrow(() -> new EntityNotFoundException(
                        "Type d'absence introuvable : id=" + request.getTypeAbsenceId()));

        // 5. Justificatif obligatoire ?
        if (Boolean.TRUE.equals(typeAbsence.getRequireJustificatif())
                && (request.getJustificatif() == null || request.getJustificatif().isBlank())) {
            throw new IllegalStateException(
                    "Un justificatif est obligatoire pour le type d'absence : " + typeAbsence.getLibelle());
        }

        // 6. Calcul durée calendaire
        int dureeJours = (int) ChronoUnit.DAYS.between(request.getDateDebut(), request.getDateFin()) + 1;

        // 7. Construction entité
        Absence absence = absenceMapper.toEntity(request);
        absence.setTypeAbsence(typeAbsence);
        absence.setUtilisateurId(user.getId());
        absence.setEntrepriseId(user.getEntrepriseId());
        absence.setManagerId(user.getManagerId());
        absence.setStatut(StatutDemandeEnum.EN_ATTENTE_RH);
        absence.setDureeJours(dureeJours);
        absence.setDateCreation(LocalDateTime.now());
        absence.setDateDeclaration(LocalDate.now());

        log.info("Déclaration absence — userId={} type={} période=[{},{}] durée={}j",
                user.getId(), typeAbsence.getType(), request.getDateDebut(), request.getDateFin(), dureeJours);

        Absence saved = absenceRepository.save(absence);
        
        asyncNotificationService.sendToRole("ROLE_RH", NotificationPayload.of(
            "ABSENCE_DECLAREE", "Nouvelle absence",
            "Déclaration de " + user.getPrenom() + " " + user.getNom(),
            "clock", "blue", saved.getId(), "ABSENCE", "/app/rh/absences"
        ), user.getEntrepriseId());

        return absenceMapper.toResponse(saved);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEE — Mes absences (paginé)
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public PageResponse<AbsenceResponse> mesAbsences(String userEmail, int page, int size,
            String statut, String typeCode) {
        UtilisateurAuthResponse user = resolveUser(userEmail);
        Pageable pageable = PageRequest.of(page, size);
        StatutDemandeEnum statutEnum = parseStatut(statut);

        Page<Absence> absencePage = absenceRepository.findByUtilisateurIdAndEntrepriseId(
                user.getId(), user.getEntrepriseId(), statutEnum, typeCode, pageable);

        return PageResponse.fromPage(absencePage, absenceMapper::toResponse);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RH — Absences entreprise (paginé)
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public PageResponse<AbsenceResponse> absencesEntreprise(String rhEmail, int page, int size, String statut) {
        UtilisateurAuthResponse rh = resolveUser(rhEmail);
        Pageable pageable = PageRequest.of(page, size);
        StatutDemandeEnum statutEnum = parseStatut(statut);

        Page<Absence> absencePage = absenceRepository.findByEntrepriseId(rh.getEntrepriseId(), statutEnum, pageable);

        return PageResponse.fromPage(absencePage, absenceMapper::toResponse);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RH — Valider
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public AbsenceResponse valider(Long id, String rhEmail) {
        Absence absence = findAbsenceOrThrow(id);

        if (absence.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH) {
            throw new IllegalStateException("Seules les absences EN_ATTENTE_RH peuvent être validées.");

        }

        UtilisateurAuthResponse rh = resolveUser(rhEmail);
        absence.setStatut(StatutDemandeEnum.APPROUVE);
        absence.setManagerId(rh.getId());
        absence.setDateDecision(LocalDateTime.now());

        log.info("Validation absence id={} par RH id={}", id, rh.getId());
        Absence saved = absenceRepository.save(absence);

        asyncNotificationService.sendToUser(absence.getUtilisateurId(), NotificationPayload.of(
            "ABSENCE_VALIDEE", "Absence validée",
            "Votre absence a été validée",
            "check-circle", "green", saved.getId(), "ABSENCE", "/app/employee/absences"
        ), rh.getEntrepriseId());

        return absenceMapper.toResponse(saved);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RH — Rejeter
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public AbsenceResponse rejeter(Long id, String rhEmail, String motifRefus) {
        Absence absence = findAbsenceOrThrow(id);

        if (absence.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH) {
            throw new IllegalStateException("Seules les absences EN_ATTENTE peuvent être rejetées.");
        }

        UtilisateurAuthResponse rh = resolveUser(rhEmail);
        absence.setStatut(StatutDemandeEnum.REFUSE);
        absence.setManagerId(rh.getId());
        absence.setMotifRefus(motifRefus);
        absence.setCommentaireValidateur(motifRefus);
        absence.setDateDecision(LocalDateTime.now());

        log.info("Rejet absence id={} par RH id={} — motif='{}'", id, rh.getId(), motifRefus);
        Absence saved = absenceRepository.save(absence);

        asyncNotificationService.sendToUser(absence.getUtilisateurId(), NotificationPayload.of(
            "ABSENCE_REFUSEE", "Absence refusée",
            "Votre absence a été refusée par " + rh.getPrenom() + " " + rh.getNom(),
            "x-circle", "red", saved.getId(), "ABSENCE", "/app/employee/absences"
        ), rh.getEntrepriseId());

        return absenceMapper.toResponse(saved);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEE — Annuler (soft delete)
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public void annuler(Long id, String userEmail) {
        Absence absence = findAbsenceOrThrow(id);
        UtilisateurAuthResponse user = resolveUser(userEmail);

        if (!absence.getUtilisateurId().equals(user.getId())) {
            throw new AccessDeniedException("Vous n'êtes pas autorisé à annuler cette absence.");

        }
        if (absence.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH) {
            throw new IllegalStateException("Seules les absences EN_ATTENTE peuvent être annulées.");
        }

        absence.setStatut(StatutDemandeEnum.ANNULE);
        absence.setDateDecision(LocalDateTime.now());
        absenceRepository.save(absence);

        log.info("Annulation absence id={} par userId={}", id, user.getId());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers privés
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public UtilisateurAuthResponse resolveUser(String email) {
        UtilisateurAuthResponse user = organisationClient.getUtilisateurForAuth(email);
        if (user == null) {
            throw new EntityNotFoundException("Utilisateur introuvable pour email : " + email);
        }
        return user;
    }

    private Absence findAbsenceOrThrow(Long id) {
        return absenceRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Absence introuvable : id=" + id));
    }

    private StatutDemandeEnum parseStatut(String statut) {
        if (statut == null || statut.isBlank())
            return null;
        try {
            return StatutDemandeEnum.valueOf(statut.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Statut invalide : " + statut);
        }
    }
}
