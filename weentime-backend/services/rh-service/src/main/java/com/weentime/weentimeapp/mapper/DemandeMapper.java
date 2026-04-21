package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.DemandeDTO;
import com.weentime.weentimeapp.entity.Demande;
import org.mapstruct.Mapper;

import java.util.List;

@Mapper(componentModel = "spring")
public interface DemandeMapper {

    DemandeDTO toDto(Demande entity);

    List<DemandeDTO> toDtoList(List<Demande> entities);
}