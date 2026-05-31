package com.weentime.weentimeproject.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ModulePermissionDto {

    @NotBlank(message = "La clé du module est obligatoire")
    private String key;

    private String label;
    private boolean enabled;
}