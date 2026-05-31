package com.weentime.weentimeproject.mapper;

import com.weentime.weentimeproject.dto.request.EntrepriseRequest;
import com.weentime.weentimeproject.dto.response.EntrepriseResponse;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import com.weentime.weentimeproject.enums.RoleNom;
import org.mapstruct.*;

@Mapper(componentModel = "spring", imports = {StatutUtilisateurEnum.class, RoleNom.class})
public interface EntrepriseMapper {

    @Mapping(target = "nom", expression = "java(request.getEffectiveNom())")
    @Mapping(target = "secteur", expression = "java(request.getEffectiveSecteur())")
    @Mapping(target = "maxUsers", expression = "java(request.getEffectiveMaxUsers())")
    @Mapping(target = "status", expression = "java(request.getEffectiveStatus())")
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "codeInvitation", ignore = true) // généré en @PrePersist
    @Mapping(target = "codeExpiration", ignore = true)
    @Mapping(target = "currentUsers", ignore = true)
    @Mapping(target = "estActive", ignore = true) // synchronisé en @PrePersist
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "departements", ignore = true)
    @Mapping(target = "utilisateurs", ignore = true)
    Entreprise toEntity(EntrepriseRequest request);

    @Mapping(target = "nombreDepartements", expression = "java(entreprise.getDepartements() != null ? entreprise.getDepartements().size() : 0)")

    @Mapping(target = "employeesCount", expression = "java(entreprise.getMaxUsers() != null ? entreprise.getMaxUsers() : 0)")

    @Mapping(target = "activeUsers", expression = """
            java(entreprise.getUtilisateurs() != null
                ? (int) entreprise.getUtilisateurs().stream()
                    .filter(u -> u.getStatut() == StatutUtilisateurEnum.ACTIF)
                    .count()
                : 0)
            """)

    @Mapping(target = "hrManagers", expression = """
            java(entreprise.getUtilisateurs() != null
                ? (int) entreprise.getUtilisateurs().stream()
                    .filter(u -> u.getRoles() != null && u.getRoles().stream()
                        .anyMatch(r -> "ROLE_RH".equals(r.getNom())))
                    .count()
                : 0)
            """)

    @Mapping(target = "modulesEnabled", expression = "java(0)") // TODO: brancher sur table modules en V2

    @Mapping(target = "lastActivity", expression = "java(entreprise.getUpdatedAt() != null ? entreprise.getUpdatedAt() : entreprise.getCreatedAt())")

    @Mapping(target = "lastLogin", expression = "java(null)")
    EntrepriseResponse toResponse(Entreprise entreprise);

    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    @Mapping(target = "nom", expression = "java(request.getEffectiveNom() != null ? request.getEffectiveNom() : entreprise.getNom())")
    @Mapping(target = "secteur", expression = "java(request.getEffectiveSecteur() != null ? request.getEffectiveSecteur() : entreprise.getSecteur())")
    @Mapping(target = "maxUsers", expression = "java(request.getEffectiveMaxUsers() != null ? request.getEffectiveMaxUsers() : entreprise.getMaxUsers())")
    @Mapping(target = "codeInvitation", ignore = true) // immuable
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "departements", ignore = true)
    @Mapping(target = "utilisateurs", ignore = true)
    void updateEntityFromRequest(EntrepriseRequest request, @MappingTarget Entreprise entreprise);
}