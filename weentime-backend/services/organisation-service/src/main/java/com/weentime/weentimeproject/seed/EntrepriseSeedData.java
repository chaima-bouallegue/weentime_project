package com.weentime.weentimeproject.seed;

import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import lombok.RequiredArgsConstructor;
import lombok.Value;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
@Order(1)
@RequiredArgsConstructor
@Slf4j
public class EntrepriseSeedData implements CommandLineRunner {

    private final EntrepriseRepository entrepriseRepository;

    private static final List<EntrepriseSeed> SEED_DATA = List.of(
            new EntrepriseSeed("TechCorp",    "Technologie", "Tunis", "contact@techcorp.tn",    "+21670000001", "98765432100001"),
            new EntrepriseSeed("MediPlus",    "Santé",       "Tunis", "contact@mediplus.tn",    "+21670000002", "98765432100002"),
            new EntrepriseSeed("GreenEnergy", "Énergie",     "Sfax",  "contact@greenenergy.tn", "+21670000003", "98765432100003")
    );

    @Override
    @Transactional
    public void run(String... args) {
        log.info("[SEED] Démarrage du seed des entreprises...");

        for (EntrepriseSeed seed : SEED_DATA) {
            seedEntreprise(seed);
        }

        List<Entreprise> all = entrepriseRepository.findAll();
        log.info("[SEED] === RÉCAPITULATIF ===");
        log.info("[SEED] Nombre total d'entreprises : {}", all.size());
        for (Entreprise e : all) {
            log.info("[SEED]   - {} (id={}, codeInvitation={}, siret={})",
                    e.getNom(), e.getId(), e.getCodeInvitation(), e.getSiret());
        }
    }

    private void seedEntreprise(EntrepriseSeed seed) {
        if (entrepriseRepository.existsBySiret(seed.siret)) {
            log.info("[SEED] Entreprise {} existe déjà (SIRET: {})", seed.nom, seed.siret);
            return;
        }

        if (entrepriseRepository.findByNomIgnoreCase(seed.nom).isPresent()) {
            log.info("[SEED] Entreprise {} existe déjà (nom)", seed.nom);
            return;
        }

        Entreprise entreprise = Entreprise.builder()
                .nom(seed.nom)
                .secteur(seed.secteur)
                .adresse(seed.adresse)
                .email(seed.email)
                .telephone(seed.telephone)
                .siret(seed.siret)
                .build();

        entreprise = entrepriseRepository.save(entreprise);
        log.info("[SEED] Entreprise {} créée avec id={}, codeInvitation={}",
                entreprise.getNom(), entreprise.getId(), entreprise.getCodeInvitation());
    }

    @Value
    private static class EntrepriseSeed {
        String nom;
        String secteur;
        String adresse;
        String email;
        String telephone;
        String siret;
    }
}
