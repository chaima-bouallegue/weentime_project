package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.DemandeDocumentResponse;
import com.weentime.weentimeapp.entity.Document;
import com.weentime.weentimeapp.enums.*;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

import java.util.List;

@Mapper(componentModel = "spring")
public interface DocumentMapper {

    @Mapping(target = "type", source = "typeDocument.code")
    @Mapping(target = "label", source = "typeDocument.libelle")
    @Mapping(target = "statut", source = "statut", qualifiedByName = "mapStatut")
    @Mapping(target = "dateMiseAJour", expression = "java(entity.getDateDecision() != null ? entity.getDateDecision() : entity.getDateCreation())")
    @Mapping(target = "commentaireRH", source = "commentaireValidateur")
    @Mapping(target = "delaiEstime", expression = "java(entity.getTypeDocument().getDelaiTraitementJours() + \"j\")")
    DemandeDocumentResponse toResponse(Document entity);

    List<DemandeDocumentResponse> toResponseList(List<Document> entities);

    @Named("mapDelai")
    default String mapDelai(String code) {
        if (code == null) return "48h";
        return switch (code) {
            case "BULLETIN_PAIE", "ATTESTATION_SALAIRE" -> "24h";
            case "ATTESTATION_TRAVAIL", "CERTIFICAT_CONGE" -> "48h";
            case "CONTRAT_TRAVAIL", "ATTESTATION_ANCIENNETE", "FICHE_POSTE" -> "72h";
            default -> "48h";
        };
    }

    @Named("mapStatut")
    default StatutDocument mapStatut(StatutDemandeEnum statut) {
        if (statut == null) return StatutDocument.DEMANDE_RECUE;
        return switch (statut) {
            case EN_ATTENTE_MANAGER, EN_ATTENTE_RH -> StatutDocument.DEMANDE_RECUE;
            case APPROUVE -> StatutDocument.ENVOYE;
            case REFUSE -> StatutDocument.REFUSE;
            case ANNULE -> StatutDocument.ANNULE;
            case DEMANDE_RECUE -> StatutDocument.DEMANDE_RECUE;
            case EN_REVISION -> StatutDocument.EN_REVISION;
            case VALIDE -> StatutDocument.VALIDE;
            case SIGNE -> StatutDocument.SIGNE;
            case ENVOYE -> StatutDocument.ENVOYE;
        };
    }
}