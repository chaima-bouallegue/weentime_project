package com.weentime.weentimeproject.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class EntrepriseValidationDTO {
    private boolean valid;
    private Long enterpriseId;
    private String enterpriseName;
    private String status;
    private String invitationCode;
    private String reason;
    private String message;

    private Long id;
    private String nom;
    private String secteur;
    private int collaborateurs;
}
