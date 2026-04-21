package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.SoldeCongeDTO;
import com.weentime.weentimeapp.entity.SoldeConge;
import org.mapstruct.Mapper;

import java.util.List;

@Mapper(componentModel = "spring")
public interface SoldeCongeMapper {

    SoldeCongeDTO toDto(SoldeConge entity);

    SoldeConge toEntity(SoldeCongeDTO dto);

    List<SoldeCongeDTO> toDtoList(List<SoldeConge> entities);
}