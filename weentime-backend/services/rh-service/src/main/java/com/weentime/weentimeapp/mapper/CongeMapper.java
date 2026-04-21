package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.CongeDTO;
import com.weentime.weentimeapp.entity.Conge;
import org.mapstruct.Mapper;

import java.util.List;

@Mapper(componentModel = "spring")
public interface CongeMapper {

    CongeDTO toDto(Conge entity);

    Conge toEntity(CongeDTO dto);

    List<CongeDTO> toDtoList(List<Conge> entities);
}