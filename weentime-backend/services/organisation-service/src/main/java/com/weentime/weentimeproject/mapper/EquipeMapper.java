package com.weentime.weentimeproject.mapper;

import com.weentime.weentimeproject.dto.request.EquipeRequest;
import com.weentime.weentimeproject.dto.response.EquipeResponse;
import com.weentime.weentimeproject.entity.Equipe;
import org.mapstruct.*;

@Mapper(componentModel = "spring")
public interface EquipeMapper {
    @Mapping(target = "departement", ignore = true)
    Equipe toEntity(EquipeRequest request);

    @Mapping(source = "departement.id", target = "departementId")
    @Mapping(source = "departement.nom", target = "departementNom")
    @Mapping(source = "departement.entreprise.id", target = "entrepriseId")
    @Mapping(source = "departement.entreprise.nom", target = "entrepriseNom")
    @Mapping(source = "responsable.id", target = "responsableId")
    EquipeResponse toResponse(Equipe equipe);
    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)

    @Mapping(target = "departement", ignore = true)
    void updateEntityFromRequest(EquipeRequest request, @MappingTarget Equipe equipe);
}
