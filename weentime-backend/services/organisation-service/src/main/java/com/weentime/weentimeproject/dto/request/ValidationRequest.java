package com.weentime.weentimeproject.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ValidationRequest {
    private Long departementId;
    private Long equipeId;
    private String role; // Optionnel, ex: ROLE_EMPLOYEE par défaut
}
