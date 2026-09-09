package com.weentime.weentimeproject.seed;

import com.weentime.weentimeproject.dto.request.EquipeRequest;
import com.weentime.weentimeproject.entity.Departement;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.repository.DepartementRepository;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.repository.EquipeRepository;
import com.weentime.weentimeproject.service.EquipeService;
import lombok.RequiredArgsConstructor;
import lombok.Value;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@Order(3)
@RequiredArgsConstructor
@Slf4j
public class EquipeSeedData implements CommandLineRunner {

    private final EntrepriseRepository entrepriseRepository;
    private final DepartementRepository departementRepository;
    private final EquipeRepository equipeRepository;
    private final EquipeService equipeService;

    private static final Map<String, Map<String, List<EquipeSeed>>> SEED_DATA = Map.of(
            "TechCorp", Map.of(
                    "Développement", List.of(
                            new EquipeSeed("Frontend", "Application web et interface utilisateur", 8),
                            new EquipeSeed("Backend", "API et services métier", 10),
                            new EquipeSeed("Mobile", "Applications mobiles iOS et Android", 5)
                    ),
                    "Infrastructure", List.of(
                            new EquipeSeed("DevOps", "CI/CD et automatisation", 4),
                            new EquipeSeed("Sécurité", "Sécurité des systèmes et données", 3),
                            new EquipeSeed("Réseau", "Infrastructure réseau et télécom", 3)
                    ),
                    "Design", List.of(
                            new EquipeSeed("UX", "Expérience utilisateur et recherche", 4),
                            new EquipeSeed("Graphisme", "Identité visuelle et illustrations", 3)
                    )
            ),
            "MediPlus", Map.of(
                    "Clinique", List.of(
                            new EquipeSeed("Soins Généraux", "Soins médicaux de base", 20),
                            new EquipeSeed("Urgences", "Service d'urgence et réanimation", 15)
                    ),
                    "Pharmacie", List.of(
                            new EquipeSeed("Dispensation", "Distribution des médicaments", 8),
                            new EquipeSeed("Stocks", "Gestion des stocks pharmaceutiques", 5)
                    ),
                    "Administration", List.of(
                            new EquipeSeed("RH", "Gestion des ressources humaines", 4),
                            new EquipeSeed("Finances", "Gestion financière et comptable", 4)
                    )
            ),
            "GreenEnergy", Map.of(
                    "R&D", List.of(
                            new EquipeSeed("Solaire", "Recherche et développement solaire", 10),
                            new EquipeSeed("Éolien", "Recherche et développement éolien", 8)
                    ),
                    "Production", List.of(
                            new EquipeSeed("Maintenance", "Maintenance des installations", 12),
                            new EquipeSeed("Exploitation", "Exploitation des sites de production", 15)
                    ),
                    "Commercial", List.of(
                            new EquipeSeed("Ventes", "Force de vente et prospection", 6),
                            new EquipeSeed("Marketing", "Communication et marketing", 4)
                    )
            )
    );

    @Override
    public void run(String... args) {
        log.info("[SEED][EQUIPE] Démarrage...");
        int created = 0;
        int skipped = 0;

        for (var entrepriseEntry : SEED_DATA.entrySet()) {
            String entrepriseNom = entrepriseEntry.getKey();
            Map<String, List<EquipeSeed>> departments = entrepriseEntry.getValue();

            var optEntreprise = entrepriseRepository.findByNomIgnoreCase(entrepriseNom);
            if (optEntreprise.isEmpty()) {
                log.warn("[SEED][EQUIPE] Entreprise {} introuvable — équipes ignorées", entrepriseNom);
                skipped += departments.values().stream().mapToInt(List::size).sum();
                continue;
            }

            Entreprise entreprise = optEntreprise.get();
            log.info("[SEED][EQUIPE] Entreprise {} trouvée (id={})", entreprise.getNom(), entreprise.getId());

            var departements = departementRepository.findByEntreprise_IdOrderByNomAsc(entreprise.getId());

            for (var depEntry : departments.entrySet()) {
                String depNom = depEntry.getKey();
                List<EquipeSeed> equipes = depEntry.getValue();

                var optDepartement = departements.stream()
                        .filter(d -> d.getNom().equalsIgnoreCase(depNom))
                        .findFirst();

                if (optDepartement.isEmpty()) {
                    log.warn("[SEED][EQUIPE] Département {} introuvable pour {} — équipes ignorées", depNom, entrepriseNom);
                    skipped += equipes.size();
                    continue;
                }

                Departement departement = optDepartement.get();
                log.info("[SEED][EQUIPE] Département {} trouvé (id={})", departement.getNom(), departement.getId());

                for (EquipeSeed seed : equipes) {
                    if (equipeRepository.existsByNomAndDepartementId(seed.nom, departement.getId())) {
                        log.info("[SEED][EQUIPE] Déjà existant : {} (département {})", seed.nom, depNom);
                        skipped++;
                        continue;
                    }

                    EquipeRequest request = EquipeRequest.builder()
                            .nom(seed.nom)
                            .description(seed.description)
                            .effectifMaximum(seed.effectifMaximum)
                            .estActive(true)
                            .departementId(departement.getId())
                            .build();

                    equipeService.createEquipe(request);
                    log.info("[SEED][EQUIPE] Création : {} (département {})", seed.nom, depNom);
                    created++;
                }
            }
        }

        log.info("[SEED][EQUIPE] Fin : {} créées, {} ignorées", created, skipped);
    }

    @Value
    private static class EquipeSeed {
        String nom;
        String description;
        Integer effectifMaximum;
    }
}
