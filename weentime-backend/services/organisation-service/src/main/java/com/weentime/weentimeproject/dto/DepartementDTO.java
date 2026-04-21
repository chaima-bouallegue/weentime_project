package com.weentime.weentimeproject.dto;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DepartementDTO {

    private Long id;
    private String nom;
    private String description;
    private String codeInterne;
    private Long managerId;
    private Long entrepriseId;
}
