package com.weentime.weentimeproject.mapper;

import com.weentime.weentimeproject.dto.request.EntrepriseRequest;
import com.weentime.weentimeproject.dto.response.EntrepriseResponse;
import com.weentime.weentimeproject.entity.Entreprise;
import org.mapstruct.*;
@Mapper(componentModel = "spring")
public interface EntrepriseMapper {

    Entreprise toEntity(EntrepriseRequest request);

    @Mapping(target = "nombreDepartements", expression = "java(entreprise.getDepartements() != null ? entreprise.getDepartements().size() : 0)")
    EntrepriseResponse toResponse(Entreprise entreprise);


    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    void updateEntityFromRequest(EntrepriseRequest request, @MappingTarget Entreprise entreprise);
}