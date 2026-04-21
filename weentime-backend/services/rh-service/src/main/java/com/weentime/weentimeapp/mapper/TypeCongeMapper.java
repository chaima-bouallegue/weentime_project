package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.TypeCongeDTO;
import com.weentime.weentimeapp.entity.TypeConge;
import org.mapstruct.Mapper;

import java.util.List;

@Mapper(componentModel = "spring")
public interface TypeCongeMapper {

    TypeCongeDTO toDto(TypeConge entity);

    TypeConge toEntity(TypeCongeDTO dto);

    List<TypeCongeDTO> toDtoList(List<TypeConge> entities);
}