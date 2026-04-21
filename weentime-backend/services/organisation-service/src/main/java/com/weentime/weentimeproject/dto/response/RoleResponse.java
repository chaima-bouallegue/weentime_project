package com.weentime.weentimeproject.dto.response;

import com.weentime.weentimeproject.enums.RoleNom;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RoleResponse {
    private Long id;
    private RoleNom nom;
    private String description;
    private java.util.Set<String> permissions;
}
