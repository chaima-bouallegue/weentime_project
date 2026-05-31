package com.weentime.weentimeproject.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EntrepriseAccessControlDto {

    private Long entrepriseId;
    private String codeInvitation;

    @NotEmpty(message = "Les permissions ne peuvent pas être vides")
    @Valid
    private List<RolePermissionDto> permissions;

    private LocalDateTime updatedAt;
    private String updatedBy;
}