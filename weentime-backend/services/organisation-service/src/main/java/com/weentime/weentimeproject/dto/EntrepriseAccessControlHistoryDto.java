package com.weentime.weentimeproject.dto;

import lombok.*;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EntrepriseAccessControlHistoryDto {
    private Long id;
    private String changedBy;
    private LocalDateTime changedAt;
    private String role;
    private String moduleKey;
    private boolean previousValue;
    private boolean newValue;
}