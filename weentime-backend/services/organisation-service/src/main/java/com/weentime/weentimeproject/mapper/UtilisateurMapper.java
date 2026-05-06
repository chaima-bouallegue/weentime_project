package com.weentime.weentimeproject.mapper;

import com.weentime.weentimeproject.dto.request.UserProfileUpdateRequest;
import com.weentime.weentimeproject.dto.request.UtilisateurRequest;
import com.weentime.weentimeproject.dto.response.CreateRhResponse;
import com.weentime.weentimeproject.dto.response.RhOwnerResponse;
import com.weentime.weentimeproject.dto.response.RoleResponse;
import com.weentime.weentimeproject.dto.response.UserProfileResponse;
import com.weentime.weentimeproject.dto.response.UtilisateurAuthResponse;
import com.weentime.weentimeproject.dto.response.UtilisateurResponse;
import com.weentime.weentimeproject.entity.Role;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.RoleNom;
import org.mapstruct.*;

import java.util.Collections;
import java.util.Comparator;
import java.util.Set;


@Mapper(componentModel = "spring", uses = {RoleMapper.class})
public interface UtilisateurMapper {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "motDePasse", ignore = true)
    @Mapping(target = "dateCreation", ignore = true)
    @Mapping(target = "dateModification", ignore = true)
    @Mapping(target = "roles", ignore = true)
    @Mapping(target = "departement", ignore = true)
    @Mapping(target = "equipe", ignore = true)
    @Mapping(target = "entreprise", ignore = true)
    Utilisateur toEntity(UtilisateurRequest request);

    @Mapping(source = "departement.id", target = "departementId")
    @Mapping(source = "departement.nom", target = "departementNom")
    @Mapping(source = "equipe.id", target = "equipeId")
    @Mapping(source = "equipe.nom", target = "equipeNom")
    @Mapping(source = "roles", target = "roles")
    @Mapping(source = "entreprise.id", target = "entrepriseId")
    @Mapping(source = "entreprise.nom", target = "entrepriseNom")
    CreateRhResponse toCreateRhResponse(Utilisateur utilisateur);

    @Mapping(source = "entreprise.id", target = "entrepriseId")
    @Mapping(source = "entreprise.nom", target = "entrepriseNom")
    @Mapping(source = "roles", target = "role", qualifiedByName = "rolesToPrimaryName")
    RhOwnerResponse toRhOwnerResponse(Utilisateur utilisateur);

    @Mapping(source = "departement.id", target = "departementId")
    @Mapping(source = "departement.nom", target = "departementNom")
    @Mapping(source = "equipe.id", target = "equipeId")
    @Mapping(source = "equipe.nom", target = "equipeNom")
    @Mapping(source = "equipe.nom", target = "equipe")
    @Mapping(source = "avatarUrl", target = "photo")
    @Mapping(source = "manager.id", target = "managerId")
    @Mapping(expression = "java(utilisateur.getManager() != null ? ((utilisateur.getManager().getPrenom() != null ? utilisateur.getManager().getPrenom() : \"\") + \" \" + (utilisateur.getManager().getNom() != null ? utilisateur.getManager().getNom() : \"\")).trim() : null)", target = "managerNom")
    @Mapping(source = "entreprise.id", target = "entrepriseId")
    @Mapping(source = "entreprise.nom", target = "entrepriseNom")
    @Mapping(source = "roles", target = "role", qualifiedByName = "rolesToPrimaryName")
    @Mapping(source = "roles", target = "roles", qualifiedByName = "rolesToCanonicalResponses")
    UtilisateurResponse toResponse(Utilisateur utilisateur);

    @Mapping(source = "statut", target = "statut")
    @Mapping(source = "entrepriseId", target = "entrepriseId")
    @Mapping(source = "roles", target = "roles", qualifiedByName = "rolesToAuthDTOs")
    UtilisateurAuthResponse toAuthResponse(Utilisateur utilisateur);

    @Mapping(source = "statut", target = "statut")
    @Mapping(source = "roles", target = "roles", qualifiedByName = "rolesToStrings")
    @Mapping(source = "departement", target = "departement")
    @Mapping(source = "equipe", target = "equipe")
    @Mapping(source = "entreprise", target = "entreprise")
    @Mapping(source = "avatarUrl", target = "photo")
    UserProfileResponse toProfileResponse(Utilisateur utilisateur);

    @Named("rolesToStrings")
    default Set<String> rolesToStrings(Set<Role> roles) {
        Role role = canonicalRole(roles);
        return role == null ? Collections.emptySet() : Set.of(role.getNom().name());
    }

    @Named("rolesToAuthDTOs")
    default Set<UtilisateurAuthResponse.RoleDTO> rolesToAuthDTOs(Set<Role> roles) {
        Role role = canonicalRole(roles);
        if (role == null) {
            return Collections.emptySet();
        }
        return Set.of(UtilisateurAuthResponse.RoleDTO.builder()
                .nom(role.getNom().name())
                .build());
    }

    @Named("rolesToPrimaryName")
    default String rolesToPrimaryName(Set<Role> roles) {
        Role role = canonicalRole(roles);
        if (role == null || role.getNom() == null) {
            return "EMPLOYEE";
        }
        String roleName = role.getNom().name();
        return roleName.startsWith("ROLE_") ? roleName.substring("ROLE_".length()) : roleName;
    }

    @Named("rolesToCanonicalResponses")
    default Set<RoleResponse> rolesToCanonicalResponses(Set<Role> roles) {
        Role role = canonicalRole(roles);
        if (role == null) {
            return Collections.emptySet();
        }
        return Set.of(RoleResponse.builder()
                .id(role.getId())
                .nom(role.getNom())
                .description(role.getDescription())
                .permissions(role.getPermissions())
                .build());
    }

    default Role canonicalRole(Set<Role> roles) {
        if (roles == null || roles.isEmpty()) {
            return null;
        }
        return roles.stream()
                .filter(role -> role != null && role.getNom() != null)
                .min(Comparator.comparingInt(role -> rolePriority(role.getNom())))
                .orElse(null);
    }

    default int rolePriority(RoleNom role) {
        if (role == null) {
            return 99;
        }
        return switch (role) {
            case ROLE_ADMIN -> 0;
            case ROLE_RH -> 1;
            case ROLE_MANAGER -> 2;
            case ROLE_EMPLOYEE -> 3;
        };
    }

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "motDePasse", ignore = true)
    @Mapping(target = "dateCreation", ignore = true)
    @Mapping(target = "dateModification", ignore = true)
    @Mapping(target = "roles", ignore = true)
    @Mapping(target = "departement", ignore = true)
    @Mapping(target = "equipe", ignore = true)
    void updateEntityFromRequest(UtilisateurRequest request, @MappingTarget Utilisateur utilisateur);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "email", ignore = true)
    @Mapping(target = "motDePasse", ignore = true)
    @Mapping(target = "dateCreation", ignore = true)
    @Mapping(target = "dateModification", ignore = true)
    @Mapping(target = "roles", ignore = true)
    @Mapping(target = "departement", ignore = true)
    @Mapping(target = "equipe", ignore = true)
    @Mapping(target = "statut", ignore = true)
    void updateEntityFromProfileRequest(UserProfileUpdateRequest request, @MappingTarget Utilisateur utilisateur);
}
