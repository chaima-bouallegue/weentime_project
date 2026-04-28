package com.weentime.weentimeproject.mapper;

import com.weentime.weentimeproject.dto.request.UserProfileUpdateRequest;
import com.weentime.weentimeproject.dto.request.UtilisateurRequest;
import com.weentime.weentimeproject.dto.response.CreateRhResponse;
import com.weentime.weentimeproject.dto.response.RhOwnerResponse;
import com.weentime.weentimeproject.dto.response.UserProfileResponse;
import com.weentime.weentimeproject.dto.response.UtilisateurAuthResponse;
import com.weentime.weentimeproject.dto.response.UtilisateurResponse;
import com.weentime.weentimeproject.entity.Role;
import com.weentime.weentimeproject.entity.Utilisateur;
import org.mapstruct.*;

import java.util.Collections;
import java.util.Set;
import java.util.stream.Collectors;


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
    @Mapping(source = "entreprise.id", target = "entrepriseId")
    @Mapping(source = "entreprise.nom", target = "entrepriseNom")
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
        if (roles == null) return Collections.emptySet();
        return roles.stream()
                .map(role -> role.getNom().name())
                .collect(Collectors.toSet());
    }

    @Named("rolesToAuthDTOs")
    default Set<UtilisateurAuthResponse.RoleDTO> rolesToAuthDTOs(Set<Role> roles) {
        if (roles == null) return Collections.emptySet();
        return roles.stream()
                .map(role -> UtilisateurAuthResponse.RoleDTO.builder()
                        .nom(role.getNom().name())
                        .build())
                .collect(Collectors.toSet());
    }

    @Named("rolesToPrimaryName")
    default String rolesToPrimaryName(Set<Role> roles) {
        if (roles == null || roles.isEmpty()) {
            return "RH";
        }

        String roleName = roles.stream()
                .map(role -> role.getNom().name())
                .filter(name -> "ROLE_RH".equals(name))
                .findFirst()
                .orElseGet(() -> roles.stream()
                        .map(role -> role.getNom().name())
                        .sorted()
                        .findFirst()
                        .orElse("ROLE_RH"));

        return roleName.startsWith("ROLE_") ? roleName.substring("ROLE_".length()) : roleName;
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
