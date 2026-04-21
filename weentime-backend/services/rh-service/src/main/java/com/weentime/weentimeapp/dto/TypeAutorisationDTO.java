package com.weentime.weentimeapp.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeAutorisationDTO {
    private Long id;
    private String libelle;
    private Integer maxHeuresMois;
    private Boolean requireJustificatif;

    @JsonCreator
    public TypeAutorisationDTO(String value) {
        try {
            this.id = Long.parseLong(value);
        } catch (NumberFormatException e) {
            this.libelle = value;
        }
    }
}
