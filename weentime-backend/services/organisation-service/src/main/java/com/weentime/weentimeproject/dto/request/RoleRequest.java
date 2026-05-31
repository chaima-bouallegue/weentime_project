package com.weentime.weentimeproject.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Set;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RoleRequest {
    @NotNull(message = "Le nom de role est obligatoire")
    @Pattern(regexp = "^ROLE_[A-Z0-9_]+$", message = "Format: ROLE_NOM (majuscules)")
    private String nom;

    private String description;

    private Set<String> permissions;
}
