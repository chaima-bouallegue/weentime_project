package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.TypeCongeDTO;
import com.weentime.weentimeapp.entity.TypeConge;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

@Mapper(componentModel = "spring")
public interface TypeCongeMapper {

    TypeCongeDTO toDto(TypeConge entity);

    @Mapping(target = "entrepriseId", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "version", ignore = true)
    TypeConge toEntity(TypeCongeDTO dto);

    List<TypeCongeDTO> toDtoList(List<TypeConge> entities);
}
