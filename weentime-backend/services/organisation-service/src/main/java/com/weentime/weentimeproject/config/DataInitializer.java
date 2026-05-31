package com.weentime.weentimeproject.config;

import com.weentime.weentimeproject.entity.Departement;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.entity.Equipe;
import com.weentime.weentimeproject.entity.Role;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import com.weentime.weentimeproject.repository.DepartementRepository;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.repository.EquipeRepository;
import com.weentime.weentimeproject.repository.RoleRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private static final String DEFAULT_PASSWORD = "Admin123@";
    private static final String COMPANY_NAME = "WeenTime Demo";
    private static final String COMPANY_SIRET = "12345678901234";
    private static final String DEPARTMENT_CODE = "ENG-001";

    // Rôles système créés au démarrage (String, plus enum)
    private static final List<String> DEFAULT_ROLES = List.of(
            "ROLE_EMPLOYEE", "ROLE_MANAGER", "ROLE_RH", "ROLE_ADMIN");

    private final RoleRepository roleRepository;
    private final UtilisateurRepository utilisateurRepository;
    private final EntrepriseRepository entrepriseRepository;
    private final DepartementRepository departementRepository;
    private final EquipeRepository equipeRepository;
    private final PasswordEncoder passwordEncoder;

    // -------------------------------------------------------------------------
    // Entry point
    // -------------------------------------------------------------------------

    @Override
    @Transactional
    public void run(String... args) {
        log.info("Starting data initialization...");

        initializeRoles();
        Entreprise entreprise = initializeEntreprise();
        Departement departement = initializeDepartement(entreprise);

        initializeAdminUser();
        initializeOperationalUsers(entreprise, departement);

        log.info("Data initialization complete.");
    }

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    private void initializeRoles() {
        for (String roleNom : DEFAULT_ROLES) {
            if (roleRepository.findByNom(roleNom).isEmpty()) {
                log.info("Creating role: {}", roleNom);
                Role role = new Role();
                role.setNom(roleNom);
                roleRepository.save(role);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Entreprise
    // -------------------------------------------------------------------------

    private Entreprise initializeEntreprise() {
        return entrepriseRepository.findByNomIgnoreCase(COMPANY_NAME)
                .or(() -> entrepriseRepository.findAll().stream()
                        .filter(item -> COMPANY_SIRET.equals(item.getSiret()))
                        .findFirst())
                .orElseGet(() -> {
                    log.info("Creating demo company: {}", COMPANY_NAME);
                    Entreprise entreprise = Entreprise.builder()
                            .nom(COMPANY_NAME)
                            .adresse("12 Rue de l'Innovation, Paris")
                            .email("contact@weentime.demo")
                            .telephone("+33102030405")
                            .siteWeb("https://demo.weentime.local")
                            .siret(COMPANY_SIRET)
                            .secteur("Technologie")
                            .currentUsers(0)
                            .maxUsers(50)
                            .estActive(Boolean.TRUE)
                            .build();
                    return entrepriseRepository.save(entreprise);
                });
    }

    // -------------------------------------------------------------------------
    // Departement
    // -------------------------------------------------------------------------

    private Departement initializeDepartement(Entreprise entreprise) {
        return departementRepository.findByEntreprise_IdOrderByNomAsc(entreprise.getId()).stream()
                .filter(item -> "Engineering".equalsIgnoreCase(item.getNom()))
                .findFirst()
                .or(() -> departementRepository.findAll().stream()
                        .filter(item -> DEPARTMENT_CODE.equals(item.getCodeInterne()))
                        .findFirst())
                .orElseGet(() -> {
                    log.info("Creating demo department for company {}", entreprise.getId());
                    Departement departement = Departement.builder()
                            .nom("Engineering")
                            .description("Produit et plateforme")
                            .codeInterne(DEPARTMENT_CODE)
                            .entreprise(entreprise)
                            .build();
                    return departementRepository.save(departement);
                });
    }

    // -------------------------------------------------------------------------
    // Users
    // -------------------------------------------------------------------------

    private void initializeAdminUser() {
        String adminEmail = "admin@weentime.com";
        if (!utilisateurRepository.existsByEmail(adminEmail)) {
            log.info("Creating default admin user");
            Role adminRole = getRole("ROLE_ADMIN");
            Utilisateur admin = Utilisateur.builder()
                    .nom("Admin")
                    .prenom("WeenTime")
                    .email(adminEmail)
                    .motDePasse(passwordEncoder.encode(DEFAULT_PASSWORD))
                    .statut(StatutUtilisateurEnum.ACTIF)
                    .roles(Set.of(adminRole))
                    .build();
            utilisateurRepository.save(admin);
            log.info("Default admin user created successfully.");
        } else {
            log.info("Default admin user already exists.");
        }
    }

    private void initializeOperationalUsers(Entreprise entreprise, Departement departement) {
        Utilisateur manager = upsertUser(
                "manager@weentime.com",
                "Diallo",
                "Mariam",
                "Engineering Manager",
                "ROLE_MANAGER",
                entreprise,
                departement,
                null,
                null);

        Equipe equipe = initializeEquipe(departement, manager);

        if (manager.getEquipe() == null || !equipe.getId().equals(manager.getEquipe().getId())) {
            manager.setEquipe(equipe);
            manager.setEntrepriseId(entreprise.getId());
            utilisateurRepository.save(manager);
        }

        upsertUser(
                "employee@weentime.com",
                "Ndiaye",
                "Awa",
                "Developpeuse Full Stack",
                "ROLE_EMPLOYEE",
                entreprise,
                departement,
                equipe,
                manager);

        upsertUser(
                "rh@weentime.com",
                "Traore",
                "Fatou",
                "Responsable RH",
                "ROLE_RH",
                entreprise,
                departement,
                null,
                null);

        entreprise.setCurrentUsers(
                (int) utilisateurRepository
                        .findByEntrepriseIdOrderByPrenomAscNomAsc(entreprise.getId())
                        .size());
        entrepriseRepository.save(entreprise);
    }

    // -------------------------------------------------------------------------
    // Equipe
    // -------------------------------------------------------------------------

    private Equipe initializeEquipe(Departement departement, Utilisateur manager) {
        return equipeRepository
                .findByDepartement_Entreprise_IdOrderByNomAsc(departement.getEntreprise().getId())
                .stream()
                .filter(item -> "Produit".equalsIgnoreCase(item.getNom()))
                .findFirst()
                .map(existing -> {
                    if (existing.getResponsable() == null
                            || !manager.getId().equals(existing.getResponsable().getId())) {
                        existing.setResponsable(manager);
                        existing.setEstActive(Boolean.TRUE);
                        return equipeRepository.save(existing);
                    }
                    return existing;
                })
                .orElseGet(() -> {
                    log.info("Creating demo team for manager");
                    Equipe equipe = Equipe.builder()
                            .nom("Produit")
                            .description("Equipe produit demo")
                            .effectifMaximum(12)
                            .estActive(Boolean.TRUE)
                            .createdAt(LocalDateTime.now())
                            .responsable(manager)
                            .departement(departement)
                            .build();
                    return equipeRepository.save(equipe);
                });
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private Utilisateur upsertUser(
            String email,
            String nom,
            String prenom,
            String poste,
            String roleNom, // String au lieu de RoleNom enum
            Entreprise entreprise,
            Departement departement,
            Equipe equipe,
            Utilisateur manager) {
        Utilisateur utilisateur = utilisateurRepository.findByEmail(email)
                .orElseGet(Utilisateur::new);
        utilisateur.setNom(nom);
        utilisateur.setPrenom(prenom);
        utilisateur.setEmail(email);
        utilisateur.setMotDePasse(passwordEncoder.encode(DEFAULT_PASSWORD));
        utilisateur.setPoste(poste);
        utilisateur.setTelephone("+33000000000");
        utilisateur.setStatut(StatutUtilisateurEnum.ACTIF);
        utilisateur.setEntrepriseId(entreprise.getId());
        utilisateur.setDepartement(departement);
        utilisateur.setEquipe(equipe);
        utilisateur.setManager(manager);
        utilisateur.setRoles(withRole(roleNom));
        return utilisateurRepository.save(utilisateur);
    }

    private Set<Role> withRole(String roleNom) {
        Set<Role> roles = new HashSet<>();
        roles.add(getRole(roleNom));
        return roles;
    }

    private Role getRole(String roleNom) {
        return roleRepository.findByNom(roleNom)
                .orElseThrow(() -> new IllegalStateException("Role not found: " + roleNom));
    }
}