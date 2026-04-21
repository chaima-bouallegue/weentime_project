package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.AbsenceRequest;
import com.weentime.weentimeapp.dto.AbsenceResponse;
import com.weentime.weentimeapp.entity.Absence;
import org.mapstruct.*;

import java.util.List;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface AbsenceMapper {

    /**
     * Absence entity → AbsenceResponse (DTO de lecture enrichi).
     */
    @Mapping(source = "typeAbsence.id",      target = "typeAbsenceId")
    @Mapping(source = "typeAbsence.libelle", target = "typeAbsenceLibelle")
    @Mapping(source = "typeAbsence.type",    target = "typeAbsenceCode")
    @Mapping(source = "typeAbsence.decompteJours",       target = "impactSalaire")
    @Mapping(source = "typeAbsence.requireJustificatif", target = "requireJustificatif")
    AbsenceResponse toResponse(Absence entity);

    /**
     * AbsenceRequest → Absence entity (mapping partiel — typeAbsence et utilisateurId injectés dans le service).
     */
    @Mapping(target = "typeAbsence",    ignore = true)
    @Mapping(target = "utilisateurId",  ignore = true)
    @Mapping(target = "entrepriseId",   ignore = true)
    @Mapping(target = "managerId",      ignore = true)
    @Mapping(target = "statut",         ignore = true)
    @Mapping(target = "typeDemande",    ignore = true)
    @Mapping(target = "dateCreation",   ignore = true)
    @Mapping(target = "dateDecision",   ignore = true)
    @Mapping(target = "version",        ignore = true)
    @Mapping(target = "id",             ignore = true)
    Absence toEntity(AbsenceRequest request);

    List<AbsenceResponse> toResponseList(List<Absence> entities);
}