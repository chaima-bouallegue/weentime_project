package com.weentime.weentimeproject.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Projection JPQL pour les compteurs agrégés d'entreprises.
 * Constructeur positionnel requis par la clause NEW en JPQL.
 */
@Getter
@AllArgsConstructor
public class EntrepriseStatsDto {
    private final Long total;
    private final Long active;
    private final Long suspended;
    private final Long closed;
}