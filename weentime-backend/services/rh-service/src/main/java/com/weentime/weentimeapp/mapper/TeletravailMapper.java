package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.TeletravailCreateDTO;
import com.weentime.weentimeapp.dto.TeletravailResponseDTO;
import com.weentime.weentimeapp.entity.Teletravail;
import com.weentime.weentimeapp.enums.TypeTeletravailEnum;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

import java.util.List;

@Mapper(componentModel = "spring")
public interface TeletravailMapper {

    @Mapping(target = "label", source = "typeTeletravail", qualifiedByName = "mapTypeToLabel")
    @Mapping(target = "type", source = "typeTeletravail")
    @Mapping(target = "employeNom", ignore = true)
    @Mapping(target = "employePrenom", ignore = true)
    @Mapping(target = "employePoste", ignore = true)
    @Mapping(target = "employeDepartement", ignore = true)
    TeletravailResponseDTO toDto(Teletravail entity);

    @Mapping(target = "typeTeletravail", source = "type")
    Teletravail toEntity(TeletravailCreateDTO dto);

    List<TeletravailResponseDTO> toDtoList(List<Teletravail> entities);

    @Named("mapTypeToLabel")
    default String mapTypeToLabel(TypeTeletravailEnum type) {
        if (type == null) return null;
        switch (type) {
            case JOURNEE_COMPLETE: return "Journée complète";
            case DEMI_JOURNEE_MATIN: return "Matinée";
            case DEMI_JOURNEE_APRES_MIDI: return "Après-midi";
            case SEMAINE_COMPLETE: return "Semaine complète";
            default: return type.name();
        }
    }
}