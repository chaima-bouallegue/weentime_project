package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ValiderDocumentRequest {
    private String documentUrl;
    private String contenuIA;
    private boolean generatedByAI;
    private String commentaireRH;
}
