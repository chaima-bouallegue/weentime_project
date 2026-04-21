package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.TypeAbsenceDTO;
import com.weentime.weentimeapp.entity.TypeAbsence;
import org.mapstruct.Mapper;

import java.util.List;

@Mapper(componentModel = "spring")
public interface TypeAbsenceMapper {

    TypeAbsenceDTO toDto(TypeAbsence entity);

    TypeAbsence toEntity(TypeAbsenceDTO dto);

    List<TypeAbsenceDTO> toDtoList(List<TypeAbsence> entities);
}