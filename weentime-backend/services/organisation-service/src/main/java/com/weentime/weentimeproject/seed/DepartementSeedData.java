package com.weentime.weentimeproject.seed;

import com.weentime.weentimeproject.dto.request.DepartementRequest;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.repository.DepartementRepository;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.service.DepartementService;
import lombok.RequiredArgsConstructor;
import lombok.Value;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@Order(2)
@RequiredArgsConstructor
@Slf4j
public class DepartementSeedData implements CommandLineRunner {

    private final EntrepriseRepository entrepriseRepository;
    private final DepartementRepository departementRepository;
    private final DepartementService departementService;

    private static final Map<String, List<DepartementSeed>> SEED_DATA = Map.of(
            "TechCorp", List.of(
                    new DepartementSeed("Développement", "Développement logiciel et plateforme", "TECH-001"),
                    new DepartementSeed("Infrastructure", "Infrastructure et DevOps", "TECH-002"),
                    new DepartementSeed("Design", "Design UX/UI et identité visuelle", "TECH-003")
            ),
            "MediPlus", List.of(
                    new DepartementSeed("Clinique", "Services cliniques et soins", "MEDI-001"),
                    new DepartementSeed("Pharmacie", "Gestion pharmaceutique et stocks", "MEDI-002"),
                    new DepartementSeed("Administration", "Administration et gestion", "MEDI-003")
            ),
            "GreenEnergy", List.of(
                    new DepartementSeed("R&D", "Recherche et développement énergétique", "GREEN-001"),
                    new DepartementSeed("Production", "Production et distribution", "GREEN-002"),
                    new DepartementSeed("Commercial", "Commercial et relation clients", "GREEN-003")
            )
    );

    @Override
    public void run(String... args) {
        log.info("[SEED][DEPARTEMENT] Démarrage...");
        int created = 0;
        int skipped = 0;

        for (var entry : SEED_DATA.entrySet()) {
            String entrepriseNom = entry.getKey();
            List<DepartementSeed> departements = entry.getValue();

            var optEntreprise = entrepriseRepository.findByNomIgnoreCase(entrepriseNom);
            if (optEntreprise.isEmpty()) {
                log.warn("[SEED][DEPARTEMENT] Entreprise {} introuvable — départements ignorés", entrepriseNom);
                skipped += departements.size();
                continue;
            }

            Entreprise entreprise = optEntreprise.get();
            log.info("[SEED][DEPARTEMENT] Entreprise {} trouvée (id={})", entreprise.getNom(), entreprise.getId());

            for (DepartementSeed seed : departements) {
                if (departementRepository.existsByCodeInterne(seed.codeInterne)) {
                    log.info("[SEED][DEPARTEMENT] Déjà existant : {} ({})", seed.nom, seed.codeInterne);
                    skipped++;
                    continue;
                }

                DepartementRequest request = DepartementRequest.builder()
                        .nom(seed.nom)
                        .description(seed.description)
                        .codeInterne(seed.codeInterne)
                        .entrepriseId(entreprise.getId())
                        .build();

                departementService.createDepartement(request);
                log.info("[SEED][DEPARTEMENT] Création : {} ({})", seed.nom, seed.codeInterne);
                created++;
            }
        }

        log.info("[SEED][DEPARTEMENT] Fin : {} créés, {} ignorés", created, skipped);
    }

    @Value
    private static class DepartementSeed {
        String nom;
        String description;
        String codeInterne;
    }
}
