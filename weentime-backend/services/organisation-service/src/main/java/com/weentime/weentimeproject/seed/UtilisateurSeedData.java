package com.weentime.weentimeproject.seed;

import com.weentime.weentimeproject.dto.request.UtilisateurRequest;
import com.weentime.weentimeproject.dto.response.UtilisateurResponse;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.entity.Equipe;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.repository.EquipeRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import com.weentime.weentimeproject.service.UtilisateurService;
import lombok.RequiredArgsConstructor;
import lombok.Value;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@Order(4)
@RequiredArgsConstructor
@Slf4j
public class UtilisateurSeedData implements CommandLineRunner {

    private static final String DEFAULT_PASSWORD = "Pass123@";

    private final EntrepriseRepository entrepriseRepository;
    private final EquipeRepository equipeRepository;
    private final UtilisateurRepository utilisateurRepository;
    private final UtilisateurService utilisateurService;

    @Override
    public void run(String... args) {
        log.info("[SEED][USER] Démarrage...");
        int created = 0;
        int skipped = 0;

        for (var entrepriseEntry : SEED_USERS.entrySet()) {
            String entrepriseNom = entrepriseEntry.getKey();
            var optEntreprise = entrepriseRepository.findByNomIgnoreCase(entrepriseNom);
            if (optEntreprise.isEmpty()) {
                log.warn("[SEED][USER] Entreprise {} introuvable — utilisateurs ignorés", entrepriseNom);
                skipped += countUsers(entrepriseEntry.getValue());
                continue;
            }
            Entreprise entreprise = optEntreprise.get();
            String domain = entrepriseDomain(entrepriseNom);
            log.info("[SEED][USER] Entreprise {} trouvée (id={})", entrepriseNom, entreprise.getId());

            for (var depEntry : entrepriseEntry.getValue().entrySet()) {
                String depNom = depEntry.getKey();
                for (var equipeEntry : depEntry.getValue().entrySet()) {
                    String equipeNom = equipeEntry.getKey();
                    EquipeUsers eu = equipeEntry.getValue();

                    var optEquipe = equipeRepository.findByDepartement_Entreprise_IdOrderByNomAsc(entreprise.getId())
                            .stream()
                            .filter(e -> e.getNom().equalsIgnoreCase(equipeNom))
                            .filter(e -> e.getDepartement().getNom().equalsIgnoreCase(depNom))
                            .findFirst();

                    if (optEquipe.isEmpty()) {
                        log.warn("[SEED][USER] Équipe {} introuvable dans {} / {} — utilisateurs ignorés",
                                equipeNom, entrepriseNom, depNom);
                        skipped += 1 + eu.employees.size();
                        continue;
                    }

                    Equipe equipe = optEquipe.get();
                    UtilisateurResponse manager = null;

                    if (eu.manager != null) {
                        manager = createUser(eu.manager, "MANAGER", entreprise, equipe, domain, null);
                        if (manager != null) {
                            equipe.setResponsable(
                                    utilisateurRepository.findById(manager.getId()).orElse(null));
                            equipeRepository.save(equipe);
                            created++;
                        } else {
                            skipped++;
                        }
                    }

                    for (PersonSeed emp : eu.employees) {
                        UtilisateurResponse user = createUser(emp, "EMPLOYEE", entreprise, equipe, domain,
                                manager != null ? manager.getId() : null);
                        if (user != null) created++;
                        else skipped++;
                    }
                }
            }
        }

        log.info("[SEED][USER] Fin : {} créés, {} ignorés", created, skipped);
    }

    private UtilisateurResponse createUser(PersonSeed person, String role,
                                           Entreprise entreprise, Equipe equipe,
                                           String domain, Long managerId) {
        String email = person.prenom.toLowerCase() + "." + person.nom.toLowerCase() + "@" + domain;

        if (utilisateurRepository.existsByEmail(email)) {
            log.info("[SEED][USER] Déjà existant : {} {} ({})", person.prenom, person.nom, email);
            return null;
        }

        UtilisateurRequest request = UtilisateurRequest.builder()
                .nom(person.nom)
                .prenom(person.prenom)
                .email(email)
                .motDePasse(DEFAULT_PASSWORD)
                .poste(person.poste)
                .statut(StatutUtilisateurEnum.ACTIF)
                .entrepriseId(entreprise.getId())
                .departementId(equipe.getDepartement().getId())
                .equipeId(equipe.getId())
                .role(role)
                .build();

        UtilisateurResponse response = utilisateurService.createUtilisateur(request);

        if (managerId != null) {
            response = utilisateurService.assignManager(response.getId(), managerId);
        }

        log.info("[SEED][USER] Création : {} {} ({}, {}, {})",
                person.prenom, person.nom, email, role, equipe.getNom());
        return response;
    }

    private static String entrepriseDomain(String nom) {
        return switch (nom) {
            case "TechCorp" -> "techcorp.tn";
            case "MediPlus" -> "mediplus.tn";
            case "GreenEnergy" -> "greenenergy.tn";
            default -> nom.toLowerCase() + ".com";
        };
    }

    private static int countUsers(Map<String, Map<String, EquipeUsers>> data) {
        return data.values().stream()
                .flatMap(m -> m.values().stream())
                .mapToInt(eu -> 1 + eu.employees.size())
                .sum();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Données
    // ─────────────────────────────────────────────────────────────────────

    private static final Map<String, Map<String, Map<String, EquipeUsers>>> SEED_USERS = Map.of(
            "TechCorp", Map.of(
                    "Développement", Map.of(
                            "Frontend", new EquipeUsers(
                                    new PersonSeed("Karim", "Mansouri", "Tech Lead Frontend"),
                                    List.of(
                                            new PersonSeed("Fatma", "Ben Ali", "Développeuse Frontend"),
                                            new PersonSeed("Houssem", "Trabelsi", "Développeur Frontend"),
                                            new PersonSeed("Yasmine", "Khemiri", "Développeuse Frontend")
                                    )),
                            "Backend", new EquipeUsers(
                                    new PersonSeed("Mehdi", "Bouaziz", "Tech Lead Backend"),
                                    List.of(
                                            new PersonSeed("Nadia", "Jellali", "Développeuse Backend"),
                                            new PersonSeed("Omar", "Gharbi", "Développeur Backend"),
                                            new PersonSeed("Rania", "Mrad", "Développeuse Backend"),
                                            new PersonSeed("Iheb", "Ben Salah", "Développeur Backend")
                                    )),
                            "Mobile", new EquipeUsers(
                                    new PersonSeed("Amine", "Ferchichi", "Tech Lead Mobile"),
                                    List.of(
                                            new PersonSeed("Sarra", "Ben Romdhane", "Développeuse Mobile"),
                                            new PersonSeed("Wissem", "Chaari", "Développeur Mobile")
                                    ))
                    ),
                    "Infrastructure", Map.of(
                            "DevOps", new EquipeUsers(
                                    new PersonSeed("Khaled", "Maalej", "Lead DevOps"),
                                    List.of(
                                            new PersonSeed("Ala Eddine", "Saidi", "Ingénieur DevOps"),
                                            new PersonSeed("Marwa", "Ben Salah", "Ingénieure DevOps")
                                    )),
                            "Sécurité", new EquipeUsers(
                                    new PersonSeed("Sami", "Kacem", "Responsable Sécurité"),
                                    List.of(
                                            new PersonSeed("Imen", "Maatougui", "Analyste Sécurité"),
                                            new PersonSeed("Dhia", "Ennaji", "Ingénieur Sécurité")
                                    )),
                            "Réseau", new EquipeUsers(
                                    new PersonSeed("Moez", "Dammak", "Lead Réseau"),
                                    List.of(
                                            new PersonSeed("Hela", "Ben Rhouma", "Ingénieure Réseau"),
                                            new PersonSeed("Nassim", "Bouhlel", "Administrateur Réseau")
                                    ))
                    ),
                    "Design", Map.of(
                            "UX", new EquipeUsers(
                                    new PersonSeed("Leila", "Ben Abdallah", "Lead UX Designer"),
                                    List.of(
                                            new PersonSeed("Jihen", "Naceur", "UX Designer"),
                                            new PersonSeed("Malek", "Guesmi", "UX Researcher")
                                    )),
                            "Graphisme", new EquipeUsers(
                                    new PersonSeed("Ines", "Ben Miled", "Directrice Artistique"),
                                    List.of(
                                            new PersonSeed("Emna", "Jelliti", "Graphiste"),
                                            new PersonSeed("Skander", "Ben Slimane", "Graphiste")
                                    ))
                    )
            ),
            "MediPlus", Map.of(
                    "Clinique", Map.of(
                            "Soins Généraux", new EquipeUsers(
                                    new PersonSeed("Ahmed", "Tlili", "Médecin Chef Soins Généraux"),
                                    List.of(
                                            new PersonSeed("Sonia", "Mejri", "Infirmière"),
                                            new PersonSeed("Fathi", "Ben Amor", "Infirmier"),
                                            new PersonSeed("Radhia", "Chaabane", "Aide-soignante")
                                    )),
                            "Urgences", new EquipeUsers(
                                    new PersonSeed("Sameh", "Gharbi", "Médecin Chef Urgences"),
                                    List.of(
                                            new PersonSeed("Nabil", "Ben Youssef", "Infirmier Urgences"),
                                            new PersonSeed("Kawther", "Jaziri", "Infirmière Urgences"),
                                            new PersonSeed("Amina", "Khlifi", "Médecin Urgentiste")
                                    ))
                    ),
                    "Pharmacie", Map.of(
                            "Dispensation", new EquipeUsers(
                                    new PersonSeed("Haythem", "Boukadida", "Pharmacien Chef"),
                                    List.of(
                                            new PersonSeed("Mounira", "Karray", "Pharmacienne"),
                                            new PersonSeed("Adel", "Ben Miled", "Préparateur")
                                    )),
                            "Stocks", new EquipeUsers(
                                    new PersonSeed("Khaled", "Belhaj", "Responsable Stocks"),
                                    List.of(
                                            new PersonSeed("Salma", "Toumi", "Gestionnaire Stocks"),
                                            new PersonSeed("Yassine", "Ben Rejeb", "Magasinier")
                                    ))
                    ),
                    "Administration", Map.of(
                            "RH", new EquipeUsers(
                                    new PersonSeed("Sihem", "Hamdi", "Responsable RH"),
                                    List.of(
                                            new PersonSeed("Mouna", "Ben Slimane", "Chargée RH"),
                                            new PersonSeed("Hatem", "Guesmi", "Assistant RH")
                                    )),
                            "Finances", new EquipeUsers(
                                    new PersonSeed("Mohamed Ali", "Akrout", "Responsable Financier"),
                                    List.of(
                                            new PersonSeed("Najla", "Ben Yedder", "Comptable"),
                                            new PersonSeed("Aymen", "Ben Hassine", "Contrôleur de Gestion")
                                    ))
                    )
            ),
            "GreenEnergy", Map.of(
                    "R&D", Map.of(
                            "Solaire", new EquipeUsers(
                                    new PersonSeed("Anis", "Ben Ammar", "Chef de Projet Solaire"),
                                    List.of(
                                            new PersonSeed("Aymen", "Bouzid", "Ingénieur Solaire"),
                                            new PersonSeed("Imen", "Kechaou", "Ingénieure Solaire"),
                                            new PersonSeed("Zied", "Gharbi", "Technicien Solaire")
                                    )),
                            "Éolien", new EquipeUsers(
                                    new PersonSeed("Wajdi", "Ben Sassi", "Chef de Projet Éolien"),
                                    List.of(
                                            new PersonSeed("Nizar", "Chaari", "Ingénieur Éolien"),
                                            new PersonSeed("Olfa", "Ben Moussa", "Ingénieure Éolien")
                                    ))
                    ),
                    "Production", Map.of(
                            "Maintenance", new EquipeUsers(
                                    new PersonSeed("Hichem", "Toumi", "Responsable Maintenance"),
                                    List.of(
                                            new PersonSeed("Mohsen", "Ben Ali", "Technicien Maintenance"),
                                            new PersonSeed("Rafik", "Jlassi", "Technicien Maintenance"),
                                            new PersonSeed("Naoufel", "Gharbi", "Électrotechnicien")
                                    )),
                            "Exploitation", new EquipeUsers(
                                    new PersonSeed("Montassar", "Ben Hamida", "Responsable Exploitation"),
                                    List.of(
                                            new PersonSeed("Chiheb", "Ben Ameur", "Opérateur Production"),
                                            new PersonSeed("Moez", "Jellali", "Opérateur Production"),
                                            new PersonSeed("Bassem", "Kacem", "Superviseur Production")
                                    ))
                    ),
                    "Commercial", Map.of(
                            "Ventes", new EquipeUsers(
                                    new PersonSeed("Fathi", "Ben Brahim", "Directeur Commercial"),
                                    List.of(
                                            new PersonSeed("Souha", "Ben Nasr", "Commerciale"),
                                            new PersonSeed("Wael", "Mtaallah", "Commercial")
                                    )),
                            "Marketing", new EquipeUsers(
                                    new PersonSeed("Ahlem", "Ben Rhouma", "Responsable Marketing"),
                                    List.of(
                                            new PersonSeed("Mariem", "Ben Boubaker", "Chargée Marketing"),
                                            new PersonSeed("Oussama", "Arfaoui", "Community Manager")
                                    ))
                    )
            )
    );

    // ─────────────────────────────────────────────────────────────────────
    // Records internes
    // ─────────────────────────────────────────────────────────────────────

    private record EquipeUsers(PersonSeed manager, List<PersonSeed> employees) {}
    private record PersonSeed(String prenom, String nom, String poste) {}
}
