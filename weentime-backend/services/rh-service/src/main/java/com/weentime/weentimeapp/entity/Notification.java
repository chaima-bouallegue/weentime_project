package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "notifications")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long destinataireId;

    private String destinataireRole;

    @Column(nullable = false, length = 100)
    private String type;

    @Column(nullable = false)
    private String titre;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Column(length = 50)
    private String icone;

    @Column(length = 20)
    private String couleur;

    private String route;

    private Long entityId;

    @Column(length = 50)
    private String entityType;

    @Builder.Default
    private boolean lu = false;

    @Column(nullable = false)
    private LocalDateTime dateCreation;

    @Column(nullable = false)
    private Long entrepriseId;
}
