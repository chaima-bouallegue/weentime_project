package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.entity.ParticipantReunion;
import com.weentime.weentimeapp.entity.Reunion;
import com.weentime.weentimeapp.enums.RSVPResponse;
import com.weentime.weentimeapp.enums.ReunionRecurrence;
import com.weentime.weentimeapp.enums.ReunionStatut;
import com.weentime.weentimeapp.repository.CongeRepository;
import com.weentime.weentimeapp.repository.ParticipantReunionRepository;
import com.weentime.weentimeapp.repository.ReunionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class ReunionService {

    private final ReunionRepository reunionRepository;
    private final ParticipantReunionRepository participantRepository;
    private final CongeRepository congeRepository;
    private final AsyncNotificationService notificationService;
    private final OrganisationServiceClient organisationClient;

    public ReunionDTO createReunion(ReunionCreateRequest request, Long organisateurId, Long entrepriseId) {
        Reunion reunion = Reunion.builder()
                .titre(request.getTitre())
                .description(request.getDescription())
                .dateReunion(request.getDateReunion())
                .heureDebut(request.getHeureDebut())
                .heureFin(request.getHeureFin())
                .type(request.getType())
                .lieu(request.getLieu())
                .lienVisio(request.getLienVisio())
                .recurrence(request.getRecurrence())
                .organisateurId(organisateurId)
                .entrepriseId(entrepriseId)
                .agenda(request.getAgenda())
                .statut(ReunionStatut.PLANIFIEE)
                .uuid(UUID.randomUUID().toString())
                .build();

        List<Long> pIds = request.getParticipantIds() != null ? new ArrayList<>(request.getParticipantIds()) : new ArrayList<>();
        if (!pIds.contains(organisateurId)) {
            pIds.add(organisateurId);
        }

        for (Long uid : pIds) {
            ParticipantReunion participant = ParticipantReunion.builder()
                    .id(ParticipantReunion.ParticipantReunionId.builder()
                            .utilisateurId(uid)
                            .build())
                    .reponse(uid.equals(organisateurId) ? RSVPResponse.CONFIRME : RSVPResponse.EN_ATTENTE)
                    .present(false)
                    .rappelMinutes(30)
                    .build();
            reunion.addParticipant(participant);
        }

        Reunion saved = reunionRepository.save(reunion);

        // Notifier les participants
        notifyParticipants(saved, "REUNION_INVITATION", "Nouvelle réunion : " + saved.getTitre());

        if (saved.getRecurrence() != ReunionRecurrence.AUCUNE) {
            handleRecurrence(saved, pIds);
        }

        return mapToDto(saved);
    }

    private void handleRecurrence(Reunion parent, List<Long> participantIds) {
        LocalDate nextDate = parent.getDateReunion();
        int maxOccurrences = 52;
        
        for (int i = 1; i < maxOccurrences; i++) {
            if (parent.getRecurrence() == ReunionRecurrence.QUOTIDIEN) {
                nextDate = nextDate.plusDays(1);
            } else if (parent.getRecurrence() == ReunionRecurrence.HEBDOMADAIRE) {
                nextDate = nextDate.plusWeeks(1);
            } else if (parent.getRecurrence() == ReunionRecurrence.MENSUEL) {
                nextDate = nextDate.plusMonths(1);
            }

            Reunion occurrence = Reunion.builder()
                    .titre(parent.getTitre())
                    .description(parent.getDescription())
                    .dateReunion(nextDate)
                    .heureDebut(parent.getHeureDebut())
                    .heureFin(parent.getHeureFin())
                    .type(parent.getType())
                    .lieu(parent.getLieu())
                    .lienVisio(parent.getLienVisio())
                    .recurrence(parent.getRecurrence())
                    .organisateurId(parent.getOrganisateurId())
                    .entrepriseId(parent.getEntrepriseId())
                    .agenda(parent.getAgenda())
                    .statut(ReunionStatut.PLANIFIEE)
                    .uuid(UUID.randomUUID().toString())
                    .build();

            if (participantIds != null) {
                for (Long uid : participantIds) {
                    ParticipantReunion p = ParticipantReunion.builder()
                            .id(ParticipantReunion.ParticipantReunionId.builder().utilisateurId(uid).build())
                            .reponse(uid.equals(parent.getOrganisateurId()) ? RSVPResponse.CONFIRME : RSVPResponse.EN_ATTENTE)
                            .build();
                    occurrence.addParticipant(p);
                }
            }
            reunionRepository.save(occurrence);
        }
    }

    public List<ReunionDTO> getMesReunions(Long userId) {
        return reunionRepository.findByParticipantIdOrderByDateDesc(userId).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    public ReunionDTO getProchaine(Long userId) {
        return reunionRepository.findNextReunionForUser(userId)
                .map(this::mapToDto)
                .orElse(null);
    }

    public ReunionDTO getDetail(String uuid) {
        Reunion r = reunionRepository.findByUuid(uuid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Réunion non trouvée"));
        return mapToDto(r);
    }

    public void repondre(String uuid, ReunionResponseRequest request, Long userId) {
        Reunion r = reunionRepository.findByUuid(uuid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Réunion non trouvée"));
        
        ParticipantReunion p = participantRepository.findById_ReunionIdAndId_UtilisateurId(r.getId(), userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Vous ne faites pas partie de cette réunion"));

        p.setReponse(request.getReponse());
        if (request.getRappelMinutes() != null) {
            p.setRappelMinutes(request.getRappelMinutes());
        }
        participantRepository.save(p);

        notificationService.sendToUser(r.getOrganisateurId(), NotificationPayload.of(
                "REUNION_RSVP", "Réponse réunion",
                "Un participant a répondu : " + request.getReponse().name(),
                "info", "blue", r.getId(), "REUNION", "/app/reunions/" + r.getUuid()
        ), r.getEntrepriseId());
    }

    public void cloturer(String uuid, ClotureReunionRequest request, Long userId) {
        Reunion r = reunionRepository.findByUuid(uuid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Réunion non trouvée"));

        if (!r.getOrganisateurId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Seul l'organisateur peut clôturer la réunion");
        }

        r.setStatut(ReunionStatut.CLOTUREE);
        r.setCompteRendu(request.getCompteRendu());

        if (request.getParticipantsPresents() != null) {
            for (ParticipantReunion p : r.getParticipants()) {
                if (request.getParticipantsPresents().contains(p.getId().getUtilisateurId())) {
                    p.setPresent(true);
                }
            }
        }
        reunionRepository.save(r);
    }

    public void annuler(String uuid, Long userId) {
        Reunion r = reunionRepository.findByUuid(uuid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Réunion non trouvée"));

        r.setStatut(ReunionStatut.ANNULEE);
        reunionRepository.save(r);

        notifyParticipants(r, "REUNION_ANNULEE", "Réunion annulée : " + r.getTitre());
    }

    public ConflictResponseDTO checkConflicts(LocalDate date, LocalTime start, LocalTime end, List<Long> userIds, Long entrepriseId) {
        List<ConflictResponseDTO.ConflictDetail> conflicts = new ArrayList<>();

        for (Long uid : userIds) {
            if (congeRepository.existsOverlappingConge(uid, date, date)) {
                UserResponse user = organisationClient.getUtilisateurById(uid);
                conflicts.add(ConflictResponseDTO.ConflictDetail.builder()
                        .userId(uid)
                        .nom(user != null ? user.getNom() + " " + user.getPrenom() : "Utilisateur " + uid)
                        .raison("En congé ce jour")
                        .build());
            }
            
            List<Reunion> overlaps = reunionRepository.findConflicts(List.of(uid), date, start, end);
            if (!overlaps.isEmpty()) {
                UserResponse user = organisationClient.getUtilisateurById(uid);
                conflicts.add(ConflictResponseDTO.ConflictDetail.builder()
                        .userId(uid)
                        .nom(user != null ? user.getNom() + " " + user.getPrenom() : "Utilisateur " + uid)
                        .raison("Déjà en réunion (" + overlaps.get(0).getHeureDebut() + "-" + overlaps.get(0).getHeureFin() + ")")
                        .build());
            }
        }

        return ConflictResponseDTO.builder().conflicts(conflicts).build();
    }

    public Long getMeetingMinutesToday(Long userId, LocalDate date) {
        return reunionRepository.findByParticipantIdOrderByDateDesc(userId).stream()
                .filter(r -> r.getDateReunion().equals(date) && r.getStatut() != ReunionStatut.ANNULEE)
                .mapToLong(r -> java.time.Duration.between(r.getHeureDebut(), r.getHeureFin()).toMinutes())
                .sum();
    }

    private void notifyParticipants(Reunion r, String type, String msg) {
        for (ParticipantReunion p : r.getParticipants()) {
            if (p.getId().getUtilisateurId().equals(r.getOrganisateurId()) && "REUNION_INVITATION".equals(type)) {
                continue; // Ne pas s'auto-inviter par notification
            }
            
            NotificationPayload payload;
            
            if ("REUNION_INVITATION".equals(type)) {
                List<NotificationPayload.NotificationAction> actions = new ArrayList<>();
                actions.add(new NotificationPayload.NotificationAction(
                        "Confirmer", "/api/v1/rh/reunions/" + r.getUuid() + "/repondre", 
                        "PATCH", "primary", Map.of("reponse", "CONFIRME")));
                actions.add(new NotificationPayload.NotificationAction(
                        "Décliner", "/api/v1/rh/reunions/" + r.getUuid() + "/repondre", 
                        "PATCH", "warn", Map.of("reponse", "DECLINE")));
                
                payload = NotificationPayload.withActions(
                        type, r.getTitre(), msg, "calendar", "purple",
                        r.getId(), "REUNION", "/app/reunions/" + r.getUuid(), actions
                );
            } else {
                payload = NotificationPayload.of(
                        type, r.getTitre(), msg, "calendar", "purple",
                        r.getId(), "REUNION", "/app/reunions/" + r.getUuid()
                );
            }
            
            notificationService.sendToUser(p.getId().getUtilisateurId(), payload, r.getEntrepriseId());
        }
    }

    private ReunionDTO mapToDto(Reunion r) {
        return ReunionDTO.builder()
                .id(r.getId())
                .uuid(r.getUuid())
                .titre(r.getTitre())
                .description(r.getDescription())
                .dateReunion(r.getDateReunion())
                .heureDebut(r.getHeureDebut())
                .heureFin(r.getHeureFin())
                .type(r.getType())
                .lieu(r.getLieu())
                .lienVisio(r.getLienVisio())
                .statut(r.getStatut())
                .recurrence(r.getRecurrence())
                .organisateurId(r.getOrganisateurId())
                .entrepriseId(r.getEntrepriseId())
                .compteRendu(r.getCompteRendu())
                .agenda(r.getAgenda())
                .participants(r.getParticipants().stream().map(this::mapParticipantToDto).collect(Collectors.toList()))
                .build();
    }

    private ParticipantReunionDTO mapParticipantToDto(ParticipantReunion p) {
        ParticipantReunionDTO dto = ParticipantReunionDTO.builder()
                .utilisateurId(p.getId().getUtilisateurId())
                .reponse(p.getReponse())
                .present(p.isPresent())
                .rappelMinutes(p.getRappelMinutes())
                .build();
        
        try {
            UserResponse user = organisationClient.getUtilisateurById(p.getId().getUtilisateurId());
            if (user != null) {
                dto.setNom(user.getNom());
                dto.setPrenom(user.getPrenom());
                dto.setPhoto(user.getPhoto());
            }
        } catch (Exception e) {
            log.warn("Impossible de récupérer les infos du participant {}", p.getId().getUtilisateurId());
        }
        
        return dto;
    }
}
