package com.weentime.weentimeproject.dto.request;

import com.weentime.weentimeproject.enums.RoleNom;
import jakarta.validation.constraints.NotNull;
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
    private RoleNom nom;

    private String description;

    private Set<String> permissions;
}
