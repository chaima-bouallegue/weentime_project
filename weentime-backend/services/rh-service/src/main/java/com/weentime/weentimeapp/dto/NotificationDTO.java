package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationDTO {
    private Long id;
    private String type;
    private String titre;
    private String message;
    private String icone;
    private String couleur;
    private String route;
    private Long entityId;
    private String entityType;
    private boolean lu;
    private LocalDateTime dateCreation;
}
