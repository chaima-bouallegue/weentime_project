package com.weentime.weentimeapp.seed;

import com.weentime.weentimeapp.client.OrganisationInternalClient;
import com.weentime.weentimeapp.entity.Conge;
import com.weentime.weentimeapp.entity.SoldeConge;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.repository.CongeRepository;
import com.weentime.weentimeapp.repository.SoldeCongeRepository;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.stream.Collectors;

@Component
@Order(5)
@RequiredArgsConstructor
@Slf4j
public class CongeSeedData implements CommandLineRunner {

    private static final Random RANDOM = new Random(42);

    private final OrganisationInternalClient organisationInternalClient;
    private final TypeCongeRepository typeCongeRepository;
    private final CongeRepository congeRepository;
    private final SoldeCongeRepository soldeCongeRepository;

    @Override
    @Transactional
    public void run(String... args) {
        log.info("[SEED][CONGE] Démarrage...");

        List<TypeConge> allTypes = typeCongeRepository.findAll();
        if (allTypes.isEmpty()) {
            log.warn("[SEED][CONGE] Aucun type de congé trouvé — seed ignoré. Créez d'abord les types de congés (manuelle ou TypeCongeSeedData).");
            return;
        }

        Map<Long, List<TypeConge>> typesByEntreprise = allTypes.stream()
                .collect(Collectors.groupingBy(TypeConge::getEntrepriseId));

        log.info("[SEED][CONGE] Entreprises détectées via type_conges : {}", typesByEntreprise.keySet());

        for (Map.Entry<Long, List<TypeConge>> entry : typesByEntreprise.entrySet()) {
            Long entrepriseId = entry.getKey();
            List<TypeConge> types = entry.getValue();

            List<Long> userIds;
            try {
                userIds = organisationInternalClient.findUserIdsByEntrepriseId(entrepriseId);
                log.info("[SEED][CONGE] Entreprise {} : {} utilisateurs trouvés", entrepriseId, userIds.size());
            } catch (Exception e) {
                log.warn("[SEED][CONGE] Impossible de récupérer les utilisateurs pour entrepriseId={} : {} — seed ignoré pour cette entreprise. Vérifiez la clé INTERNAL_API_KEY / INTERNAL_SECRET dans .env",
                        entrepriseId, e.getMessage());
                continue;
            }

            List<Long> managerIds;
            try {
                managerIds = organisationInternalClient.findUserIdsByEntrepriseAndRole(entrepriseId, "MANAGER");
                log.info("[SEED][CONGE] Entreprise {} : {} managers trouvés", entrepriseId, managerIds.size());
            } catch (Exception e) {
                log.warn("[SEED][CONGE] Impossible de récupérer les managers pour entrepriseId={} : {}", entrepriseId, e.getMessage());
                managerIds = List.of();
            }

            seedCongesForEntreprise(entrepriseId, userIds, managerIds, types);
        }

        log.info("[SEED][CONGE] Terminé.");
    }

    private void seedCongesForEntreprise(Long entrepriseId, List<Long> userIds, List<Long> managerIds, List<TypeConge> types) {
        TypeConge annuel = findType(types, "Congé Annuel");
        TypeConge maladie = findType(types, "Congé Maladie");
        TypeConge exceptionnel = findType(types, "Congé Exceptionnel");
        TypeConge maternite = findType(types, "Congé Maternité");
        TypeConge sansSolde = findType(types, "Congé Sans Solde");

        int created = 0;
        for (Long userId : userIds) {
            if (managerIds.contains(userId)) {
                created += seedCongesForUser(userId, entrepriseId, true, managerIds, annuel, maladie, exceptionnel, maternite, sansSolde);
            } else {
                created += seedCongesForUser(userId, entrepriseId, false, managerIds, annuel, maladie, exceptionnel, maternite, sansSolde);
            }
        }

        log.info("[SEED][CONGE] Entreprise {} : {} congés créés", entrepriseId, created);
    }

    private int seedCongesForUser(Long userId, Long entrepriseId, boolean isManager, List<Long> managerIds,
                                  TypeConge annuel, TypeConge maladie, TypeConge exceptionnel,
                                  TypeConge maternite, TypeConge sansSolde) {
        int currentYear = LocalDate.now().getYear();
        int count = 0;

        Long managerId = isManager ? null : pickRandom(managerIds);

        if (isManager) {
            count += createConge(userId, managerId, entrepriseId, annuel,
                    LocalDate.of(currentYear, 6, 1), LocalDate.of(currentYear, 6, 5),
                    3, StatutDemandeEnum.APPROUVE, "Congé annuel d'été", null);
            count += createConge(userId, managerId, entrepriseId, maladie,
                    LocalDate.of(currentYear, 2, 10), LocalDate.of(currentYear, 2, 11),
                    2, StatutDemandeEnum.APPROUVE, null, null);
            count += createConge(userId, managerId, entrepriseId, exceptionnel,
                    LocalDate.of(currentYear, 4, 15), LocalDate.of(currentYear, 4, 15),
                    1, StatutDemandeEnum.APPROUVE, "Événement familial", null);
        } else {
            count += createConge(userId, managerId, entrepriseId, annuel,
                    LocalDate.of(currentYear, 7, 15), LocalDate.of(currentYear, 7, 26),
                    9, StatutDemandeEnum.APPROUVE, "Vacances d'été", null);

            count += createConge(userId, managerId, entrepriseId, maladie,
                    LocalDate.of(currentYear, 3, 3), LocalDate.of(currentYear, 3, 4),
                    2, StatutDemandeEnum.APPROUVE, null, null);

            if (RANDOM.nextDouble() < 0.4) {
                count += createConge(userId, managerId, entrepriseId, sansSolde,
                        LocalDate.of(currentYear, 5, 19), LocalDate.of(currentYear, 5, 23),
                        5, StatutDemandeEnum.APPROUVE, "Raisons personnelles", null);
            }

            if (RANDOM.nextDouble() < 0.3) {
                count += createConge(userId, managerId, entrepriseId, annuel,
                        LocalDate.of(currentYear, 1, 20), LocalDate.of(currentYear, 1, 24),
                        5, StatutDemandeEnum.EN_ATTENTE_MANAGER, "Congé hivernal", null);
            }

            if (RANDOM.nextDouble() < 0.2) {
                count += createConge(userId, managerId, entrepriseId, exceptionnel,
                        LocalDate.of(currentYear, 1, 10), LocalDate.of(currentYear, 1, 10),
                        1, StatutDemandeEnum.REFUSE, "Demande de dernière minute",
                        "Période de forte activité, veuillez reprogrammer.");
            }

            if (RANDOM.nextDouble() < 0.15) {
                count += createConge(userId, managerId, entrepriseId, annuel,
                        LocalDate.of(currentYear, 8, 5), LocalDate.of(currentYear, 8, 9),
                        5, StatutDemandeEnum.ANNULE, null, null);
            }
        }

        return count;
    }

    private int createConge(Long userId, Long managerId, Long entrepriseId, TypeConge type,
                            LocalDate dateDebut, LocalDate dateFin, int nombreJours,
                            StatutDemandeEnum statut, String motif, String commentaireValidateur) {
        if (type == null) {
            log.warn("[SEED][CONGE] Type de congé introuvable pour entrepriseId={} — skip", entrepriseId);
            return 0;
        }

        if (congeRepository.findByUtilisateurId(userId).stream()
                .anyMatch(c -> c.getTypeCongeId().equals(type.getId())
                        && c.getDateDebut().equals(dateDebut)
                        && c.getDateFin().equals(dateFin))) {
            return 0;
        }

        Conge conge = Conge.builder()
                .utilisateurId(userId)
                .managerId(managerId)
                .entrepriseId(entrepriseId)
                .typeCongeId(type.getId())
                .dateDebut(dateDebut)
                .dateFin(dateFin)
                .nombreJours(nombreJours)
                .statut(statut)
                .motif(motif)
                .commentaireValidateur(commentaireValidateur)
                .dateCreation(LocalDateTime.now())
                .build();

        boolean requiresJustif = Boolean.TRUE.equals(type.getRequireJustificatif())
                || (type.getLibelle() != null && type.getLibelle().toLowerCase().contains("maladie"));

        if (requiresJustif) {
            conge.setJustificatifFourni(true);
            conge.setJustificatifUrl("/uploads/" + entrepriseId + "/justificatifs/certificat_medical_" + userId + ".pdf");
        }

        if (statut == StatutDemandeEnum.APPROUVE || statut == StatutDemandeEnum.REFUSE || statut == StatutDemandeEnum.ANNULE) {
            conge.setDateDecision(LocalDateTime.now());
        }

        Conge saved = congeRepository.save(conge);
        log.debug("[SEED][CONGE] Créé : userId={}, type={}, {}→{}, statut={}",
                userId, type.getLibelle(), dateDebut, dateFin, statut);

        if (statut == StatutDemandeEnum.APPROUVE && Boolean.TRUE.equals(type.getDecompteJours())) {
            seedSoldeConge(userId, entrepriseId, type, nombreJours);
        }

        return 1;
    }

    private void seedSoldeConge(Long userId, Long entrepriseId, TypeConge type, int joursPris) {
        int annee = LocalDate.now().getYear();

        if (soldeCongeRepository.findByUtilisateurIdAndTypeCongeIdAndAnnee(userId, type.getId(), annee).isPresent()) {
            return;
        }

        double maxJours = type.getNombreJoursMax() != null ? type.getNombreJoursMax().doubleValue() : 25.0;

        SoldeConge solde = SoldeConge.builder()
                .utilisateurId(userId)
                .entrepriseId(entrepriseId)
                .typeCongeId(type.getId())
                .annee(annee)
                .joursAcquis(maxJours)
                .joursUtilises((double) joursPris)
                .joursRestants(maxJours - joursPris)
                .joursEnAttente(0.0)
                .build();

        soldeCongeRepository.save(solde);
        log.debug("[SEED][CONGE] Solde créé : userId={}, type={}, restant={}",
                userId, type.getLibelle(), solde.getJoursRestants());
    }

    private TypeConge findType(List<TypeConge> types, String libelle) {
        return types.stream()
                .filter(t -> t.getLibelle() != null && t.getLibelle().equalsIgnoreCase(libelle))
                .findFirst().orElse(null);
    }

    private Long pickRandom(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return null;
        return ids.get(RANDOM.nextInt(ids.size()));
    }
}
