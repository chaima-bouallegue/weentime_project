package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeDocumentDTO {
    private Long id;
    private String libelle;
    private String code;
    private Boolean requireSignature;
    private Boolean enableTemplate;
}
