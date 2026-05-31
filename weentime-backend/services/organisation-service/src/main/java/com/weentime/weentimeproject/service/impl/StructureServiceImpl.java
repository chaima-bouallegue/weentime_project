package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.response.StructureDepartmentResponse;
import com.weentime.weentimeproject.dto.response.StructureEmployeeResponse;
import com.weentime.weentimeproject.dto.response.StructureTeamResponse;
import com.weentime.weentimeproject.entity.Departement;
import com.weentime.weentimeproject.entity.Equipe;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.repository.DepartementRepository;
import com.weentime.weentimeproject.repository.EquipeRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import com.weentime.weentimeproject.service.StructureService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StructureServiceImpl implements StructureService {

    private final DepartementRepository departementRepository;
    private final EquipeRepository equipeRepository;
    private final UtilisateurRepository utilisateurRepository;

    @Override
    public List<StructureDepartmentResponse> getDepartments() {
        Long entrepriseId = resolveEntrepriseIdOrNull();
        if (entrepriseId == null)
            return List.of();
        return departementRepository.findByEntreprise_IdOrderByNomAsc(entrepriseId).stream()
                .map(this::toDepartmentResponse)
                .toList();
    }

    @Override
    public List<StructureTeamResponse> getTeams() {
        Long entrepriseId = resolveEntrepriseIdOrNull();
        if (entrepriseId == null)
            return List.of();
        return equipeRepository.findByDepartement_Entreprise_IdOrderByNomAsc(entrepriseId).stream()
                .map(this::toTeamResponse)
                .toList();
    }

    @Override
    public List<StructureEmployeeResponse> getManagers() {
        Long entrepriseId = resolveEntrepriseIdOrNull();
        if (entrepriseId == null)
            return List.of();
        // String au lieu de RoleNom.ROLE_MANAGER
        return utilisateurRepository
                .findByEntrepriseIdAndRolesNomOrderByPrenomAscNomAsc(entrepriseId, "ROLE_MANAGER").stream()
                .map(this::toEmployeeResponse)
                .toList();
    }

    @Override
    public List<StructureEmployeeResponse> getEmployees() {
        Long entrepriseId = resolveEntrepriseIdOrNull();
        if (entrepriseId == null)
            return List.of();
        // String au lieu de RoleNom.ROLE_EMPLOYEE
        return utilisateurRepository
                .findByEntrepriseIdAndRolesNomOrderByPrenomAscNomAsc(entrepriseId, "ROLE_EMPLOYEE").stream()
                .map(this::toEmployeeResponse)
                .toList();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private Long resolveEntrepriseIdOrNull() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated())
            return null;
        return utilisateurRepository.findByEmail(authentication.getName())
                .map(Utilisateur::getEntrepriseId)
                .orElse(null);
    }

    private StructureDepartmentResponse toDepartmentResponse(Departement departement) {
        return StructureDepartmentResponse.builder()
                .id(departement.getId())
                .nom(departement.getNom())
                .description(departement.getDescription())
                .codeInterne(departement.getCodeInterne())
                .entrepriseId(departement.getEntreprise() != null ? departement.getEntreprise().getId() : null)
                .entrepriseNom(departement.getEntreprise() != null ? departement.getEntreprise().getNom() : null)
                .nombreEquipes(departement.getEquipes() == null ? 0 : departement.getEquipes().size())
                .nombreEmployes(departement.getUtilisateurs() == null ? 0 : departement.getUtilisateurs().size())
                .build();
    }

    private StructureTeamResponse toTeamResponse(Equipe equipe) {
        String managerNom = equipe.getResponsable() == null ? null
                : ((equipe.getResponsable().getPrenom() == null ? "" : equipe.getResponsable().getPrenom() + " ")
                        + (equipe.getResponsable().getNom() == null ? "" : equipe.getResponsable().getNom())).trim();

        return StructureTeamResponse.builder()
                .id(equipe.getId())
                .nom(equipe.getNom())
                .description(equipe.getDescription())
                .departementId(equipe.getDepartement() != null ? equipe.getDepartement().getId() : null)
                .departement(equipe.getDepartement() != null ? equipe.getDepartement().getNom() : null)
                .entrepriseId(equipe.getDepartement() != null && equipe.getDepartement().getEntreprise() != null
                        ? equipe.getDepartement().getEntreprise().getId()
                        : null)
                .entreprise(equipe.getDepartement() != null && equipe.getDepartement().getEntreprise() != null
                        ? equipe.getDepartement().getEntreprise().getNom()
                        : null)
                .estActive(equipe.getEstActive())
                .effectifMaximum(equipe.getEffectifMaximum())
                .managerId(equipe.getResponsable() != null ? equipe.getResponsable().getId() : null)
                .managerNom(managerNom == null || managerNom.isBlank() ? null : managerNom)
                .managerEmail(equipe.getResponsable() != null ? equipe.getResponsable().getEmail() : null)
                .nombreEmployes(equipe.getMembres() == null ? 0 : equipe.getMembres().size())
                .build();
    }

    private StructureEmployeeResponse toEmployeeResponse(Utilisateur utilisateur) {
        String fullName = ((utilisateur.getPrenom() == null ? "" : utilisateur.getPrenom() + " ")
                + (utilisateur.getNom() == null ? "" : utilisateur.getNom())).trim();
        String managerNom = utilisateur.getManager() == null ? null
                : ((utilisateur.getManager().getPrenom() == null ? "" : utilisateur.getManager().getPrenom() + " ")
                        + (utilisateur.getManager().getNom() == null ? "" : utilisateur.getManager().getNom())).trim();

        return StructureEmployeeResponse.builder()
                .id(utilisateur.getId())
                .nom(utilisateur.getNom())
                .prenom(utilisateur.getPrenom())
                .fullName(fullName.isBlank() ? utilisateur.getEmail() : fullName)
                .email(utilisateur.getEmail())
                .telephone(utilisateur.getTelephone())
                .poste(utilisateur.getPoste())
                .statut(utilisateur.getStatut() != null ? utilisateur.getStatut().name() : null)
                .dateCreation(utilisateur.getDateCreation())
                .departementId(utilisateur.getDepartement() != null ? utilisateur.getDepartement().getId() : null)
                .departement(utilisateur.getDepartement() != null ? utilisateur.getDepartement().getNom() : null)
                .equipeId(utilisateur.getEquipe() != null ? utilisateur.getEquipe().getId() : null)
                .equipe(utilisateur.getEquipe() != null ? utilisateur.getEquipe().getNom() : null)
                .managerId(utilisateur.getManager() != null ? utilisateur.getManager().getId() : null)
                .managerNom(managerNom == null || managerNom.isBlank() ? null : managerNom)
                .managerEmail(utilisateur.getManager() != null ? utilisateur.getManager().getEmail() : null)
                .entrepriseId(utilisateur.getEntrepriseId())
                .entreprise(utilisateur.getEntreprise() != null ? utilisateur.getEntreprise().getNom() : null)
                .roles(utilisateur.getRoles() == null ? List.of()
                        : utilisateur.getRoles().stream()
                                .map(role -> role.getNom()) // String direct, plus de .name()
                                .sorted()
                                .toList())
                .build();
    }
}