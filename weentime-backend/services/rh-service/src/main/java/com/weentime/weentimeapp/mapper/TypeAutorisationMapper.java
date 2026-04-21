package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.TypeAutorisationDTO;
import com.weentime.weentimeapp.entity.TypeAutorisation;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

import java.util.List;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface TypeAutorisationMapper {
    TypeAutorisationDTO toDto(TypeAutorisation entity);
    TypeAutorisation toEntity(TypeAutorisationDTO dto);
    List<TypeAutorisationDTO> toDtoList(List<TypeAutorisation> entities);
    List<TypeAutorisation> toEntityList(List<TypeAutorisationDTO> dtos);
}
