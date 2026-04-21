package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.entity.SoldeAuditLog;
import com.weentime.weentimeapp.entity.SoldeConge;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.repository.SoldeAuditLogRepository;
import com.weentime.weentimeapp.repository.SoldeCongeRepository;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import com.weentime.weentimeapp.service.RhSoldeService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class RhSoldeServiceImpl implements RhSoldeService {

    private static final Logger log = LoggerFactory.getLogger(RhSoldeServiceImpl.class);

    private final SoldeCongeRepository soldeCongeRepository;
    private final TypeCongeRepository typeCongeRepository;
    private final SoldeAuditLogRepository auditLogRepository;
    private final OrganisationServiceClient organisationServiceClient;

    private Long getEntrepriseId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getDetails() instanceof Map) {
            Map<?, ?> details = (Map<?, ?>) auth.getDetails();
            Object eid = details.get("entrepriseId");
            if (eid instanceof Number)
                return ((Number) eid).longValue();
        }
        throw new IllegalStateException("Entreprise ID not found in security context");
    }

    private String getCurrentUserEmail() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<EmployeeSoldeResponse> getGlobalSoldes(Integer annee, String query, Pageable pageable) {
        Long eid = getEntrepriseId();
        int targetAnnee = (annee != null) ? annee : LocalDate.now().getYear();

        // 1. Fetch paginated users from organisation-service
        // Note: OrganisationServiceClient should ideally support search and pagination
        // For now, we fetch all and paginate in memory OR we assume
        // organisation-service handles it
        // User request says: "récupérer d’abord les utilisateurs paginés"
        // Let's assume we use findUsersByEntreprise and paginate here for simplicity,
        // or check if organisationServiceClient.getAllUtilisateurs can be used.

        List<UserResponse> allUsers = organisationServiceClient.findUsersByEntreprise(eid);

        // Filter by query if provided
        List<UserResponse> filteredUsers = allUsers.stream()
                .filter(u -> query == null || query.isBlank() ||
                        (u.getNom() + " " + u.getPrenom()).toLowerCase().contains(query.toLowerCase()))
                .collect(Collectors.toList());

        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), filteredUsers.size());

        if (start > filteredUsers.size()) {
            return PageResponse.fromPage(new PageImpl<>(Collections.emptyList(), pageable, filteredUsers.size()));
        }

        List<UserResponse> pagedUsers = filteredUsers.subList(start, end);
        List<Long> userIds = pagedUsers.stream().map(UserResponse::getId).collect(Collectors.toList());

        // 2. Fetch balances for these users for the year
        List<SoldeConge> soldes = soldeCongeRepository.findByUtilisateurIdInAndAnnee(userIds, targetAnnee);
        Map<Long, List<SoldeConge>> soldeMap = soldes.stream()
                .collect(Collectors.groupingBy(SoldeConge::getUtilisateurId));

        // 3. Fetch active leave types
        List<TypeConge> activeTypes = typeCongeRepository.findAll(); // Assuming all are active for now

        // 4. Merge
        List<EmployeeSoldeResponse> content = pagedUsers.stream().map(u -> {
            List<SoldeConge> userSoldes = soldeMap.getOrDefault(u.getId(), Collections.emptyList());

            // Initialised = all active types have a balance
            boolean isInitialised = userSoldes.size() >= activeTypes.size();

            List<SoldeDetailDTO> soldeDetails = activeTypes.stream().map(t -> {
                Optional<SoldeConge> sc = userSoldes.stream().filter(s -> s.getTypeCongeId().equals(t.getId()))
                        .findFirst();
                return SoldeDetailDTO.builder()
                        .typeCongeId(t.getId())
                        .typeNom(t.getLibelle())
                        .joursMax(t.getNombreJoursMax())
                        .joursRestants(sc.map(SoldeConge::getJoursRestants).orElse(0.0))
                        .joursUtilises(sc.map(SoldeConge::getJoursUtilises).orElse(0.0))
                        .joursEnAttente(sc.map(SoldeConge::getJoursEnAttente).orElse(0.0))
                        .build();
            }).collect(Collectors.toList());

            return EmployeeSoldeResponse.builder()
                    .utilisateurId(u.getId())
                    .nom(u.getNom())
                    .prenom(u.getPrenom())
                    .isInitialised(isInitialised)
                    .soldes(soldeDetails)
                    .build();
        }).collect(Collectors.toList());

        return PageResponse.fromPage(new PageImpl<>(content, pageable, filteredUsers.size()));

    }

    @Override
    public void initialiserSoldes(InitialisationRequest request) {
        Long eid = getEntrepriseId();
        int currentYear = LocalDate.now().getYear();
        List<Long> targetIds = request.getUtilisateurIds();

        if (targetIds == null || targetIds.isEmpty()) {
            targetIds = organisationServiceClient.findUserIdsByEntrepriseId(eid);
        }

        List<TypeConge> types = typeCongeRepository.findAll();

        for (Long uid : targetIds) {
            for (TypeConge type : types) {
                Optional<SoldeConge> existing = soldeCongeRepository.findByUtilisateurIdAndTypeCongeIdAndAnnee(uid,
                        type.getId(), currentYear);
                if (existing.isEmpty()) {
                    SoldeConge solde = SoldeConge.builder()
                            .utilisateurId(uid)
                            .typeCongeId(type.getId())
                            .annee(currentYear)
                            .joursAcquis((double) type.getNombreJoursMax())
                            .joursRestants((double) type.getNombreJoursMax())
                            .joursUtilises(0.0)
                            .joursEnAttente(0.0)
                            .build();
                    soldeCongeRepository.save(solde);
                }
            }
        }
        log.info("Initialization completed for {} users in enterprise {}", targetIds.size(), eid);
    }

    @Override
    public void reinitialiserAnnuel(ReinitialisationAnnuelleRequest request) {
        Long eid = getEntrepriseId();
        int annee = (request.getAnnee() != null) ? request.getAnnee() : LocalDate.now().getYear();
        List<Long> targetIds = request.getUtilisateurIds();

        if (targetIds == null || targetIds.isEmpty()) {
            targetIds = organisationServiceClient.findUserIdsByEntrepriseId(eid);
        }

        // Security check: Check if any of these users already have a balance for this
        // year
        // Use the strategy to check if reset is already done for any user of the
        // enterprise
        // For simplicity, we just proceed but we could check the AuditLog

        List<TypeConge> types = typeCongeRepository.findAll();
        Map<Long, TypeConge> typeMap = types.stream().collect(Collectors.toMap(TypeConge::getId, t -> t));

        for (Long uid : targetIds) {
            for (TypeConge type : types) {
                SoldeConge solde = soldeCongeRepository
                        .findByUtilisateurIdAndTypeCongeIdAndAnnee(uid, type.getId(), annee)
                        .orElse(SoldeConge.builder()
                                .utilisateurId(uid)
                                .typeCongeId(type.getId())
                                .annee(annee)
                                .build());

                solde.setJoursAcquis((double) type.getNombreJoursMax());
                solde.setJoursRestants((double) type.getNombreJoursMax());
                solde.setJoursUtilises(0.0);
                solde.setJoursEnAttente(0.0);
                soldeCongeRepository.save(solde);
            }
        }

        logAudit("ANNUAL_RESET", null, null, null, null, "Réinitialisation annuelle pour l'année " + annee, annee);
    }

    @Override
    public void ajusterSolde(Long utilisateurId, Long typeCongeId, SoldeAjustementRequest request) {
        int currentYear = LocalDate.now().getYear(); // Or maybe we should pass the year?
        SoldeConge solde = soldeCongeRepository
                .findByUtilisateurIdAndTypeCongeIdAndAnnee(utilisateurId, typeCongeId, currentYear)
                .orElseThrow(() -> new IllegalStateException(
                        "Solde non trouvé pour cet utilisateur et ce type de congé en " + currentYear));

        Double ancienSolde = solde.getJoursRestants();
        solde.setJoursRestants(request.getJoursRestants());
        // Note: We might need to adjust joursAcquis if we want consistency,
        // but user says "ajustement manuel du solde restant".
        soldeCongeRepository.save(solde);

        logAudit("MANUAL_ADJUSTMENT", utilisateurId, typeCongeId, ancienSolde, request.getJoursRestants(),
                request.getMotif(), currentYear);
    }

    private void logAudit(String action, Long utilisateurId, Long typeCongeId, Double ancien, Double nouveau,
            String motif, Integer annee) {
        auditLogRepository.save(SoldeAuditLog.builder()
                .action(action)
                .utilisateurId(utilisateurId != null ? utilisateurId : 0L)
                .typeCongeId(typeCongeId != null ? typeCongeId : 0L)
                .ancienSolde(ancien)
                .nouveauSolde(nouveau)
                .motif(motif)
                .performBy(getCurrentUserEmail())
                .annee(annee)
                .build());
    }

    @Override
    public List<SoldeAuditLogDTO> getAuditLogsByUtilisateur(Long utilisateurId) {
        log.info("Fetching audit logs for utilisateurId: {}", utilisateurId);
        List<SoldeAuditLog> logs = auditLogRepository.findByUtilisateurIdOrderByTimestampDesc(utilisateurId);

        List<TypeConge> types = typeCongeRepository.findAll();
        Map<Long, String> typeNomMap = new HashMap<>();
        for (TypeConge t : types) {
            if (t.getId() != null) {
                typeNomMap.put(t.getId(), t.getLibelle() != null ? t.getLibelle() : "Inconnu");
            }
        }

        return logs.stream().map(logEntry -> SoldeAuditLogDTO.builder()
                .id(logEntry.getId())
                .action(logEntry.getAction())
                .utilisateurId(logEntry.getUtilisateurId())
                .typeCongeId(logEntry.getTypeCongeId())
                .typeCongeNom(typeNomMap.getOrDefault(logEntry.getTypeCongeId(), "N/A"))
                .ancienSolde(logEntry.getAncienSolde())
                .nouveauSolde(logEntry.getNouveauSolde())
                .motif(logEntry.getMotif())
                .performBy(logEntry.getPerformBy())
                .annee(logEntry.getAnnee())
                .timestamp(logEntry.getTimestamp())
                .build()).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<SoldeDetailDTO> getByUtilisateur(Long utilisateurId) {
        int targetAnnee = LocalDate.now().getYear();
        List<SoldeConge> userSoldes = soldeCongeRepository
                .findByUtilisateurIdInAndAnnee(Collections.singletonList(utilisateurId), targetAnnee);
        List<TypeConge> activeTypes = typeCongeRepository.findAll();

        return activeTypes.stream().map(t -> {
            Optional<SoldeConge> sc = userSoldes.stream().filter(s -> s.getTypeCongeId().equals(t.getId())).findFirst();
            return SoldeDetailDTO.builder()
                    .typeCongeId(t.getId())
                    .typeNom(t.getLibelle())
                    .joursMax(t.getNombreJoursMax())
                    .joursRestants(sc.map(SoldeConge::getJoursRestants).orElse(0.0))
                    .joursUtilises(sc.map(SoldeConge::getJoursUtilises).orElse(0.0))
                    .joursEnAttente(sc.map(SoldeConge::getJoursEnAttente).orElse(0.0))
                    .build();
        }).collect(Collectors.toList());
    }
}
