package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.AutorisationDTO;
import com.weentime.weentimeapp.entity.Autorisation;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

import java.util.List;

@Mapper(componentModel = "spring", uses = {TypeAutorisationMapper.class}, unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface AutorisationMapper {

    AutorisationDTO toDto(Autorisation entity);

    Autorisation toEntity(AutorisationDTO dto);

    List<AutorisationDTO> toDtoList(List<Autorisation> entities);
}