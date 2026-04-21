package com.weentime.weentimeapp.dto;

import lombok.Data;
import java.util.List;

@Data
public class ReinitialisationAnnuelleRequest {
    private List<Long> utilisateurIds;
    private Integer annee;
}
