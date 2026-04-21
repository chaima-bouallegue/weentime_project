package com.weentime.weentimeproject.mapper;

import com.weentime.weentimeproject.dto.request.DepartementRequest;
import com.weentime.weentimeproject.dto.response.DepartementResponse;
import com.weentime.weentimeproject.entity.Departement;
import org.mapstruct.*;

@Mapper(componentModel = "spring")
public interface DepartementMapper {

    Departement toEntity(DepartementRequest request);

    @Mapping(source = "entreprise.id", target = "entrepriseId")
    @Mapping(source = "entreprise.nom", target = "entrepriseNom")
    @Mapping(target = "nombreEquipes", expression = "java(departement.getEquipes() != null ? departement.getEquipes().size() : 0)")
    @Mapping(target = "nombreUtilisateurs", expression = "java(departement.getUtilisateurs() != null ? departement.getUtilisateurs().size() : 0)")
    DepartementResponse toResponse(Departement departement);
    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)

    void updateEntityFromRequest(DepartementRequest request, @MappingTarget Departement departement);
}
