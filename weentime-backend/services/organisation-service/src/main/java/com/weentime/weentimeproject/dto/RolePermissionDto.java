package com.weentime.weentimeproject.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.*;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RolePermissionDto {

    @NotBlank(message = "Le rôle est obligatoire")
    private String role;

    private String label;

    @NotEmpty(message = "La liste des modules ne peut pas être vide")
    private List<ModulePermissionDto> modules;
}
