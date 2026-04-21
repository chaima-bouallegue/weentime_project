package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.StatutDocument;
import lombok.Data;

@Data
public class UpdateStatutRequest {
    private StatutDocument statut;
    private String commentaireRH;
}
