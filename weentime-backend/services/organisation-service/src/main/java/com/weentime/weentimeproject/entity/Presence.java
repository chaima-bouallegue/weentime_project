package com.weentime.weentimeproject.entity;

import com.weentime.weentimeproject.enums.PresenceStatus;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "presences", uniqueConstraints = {
        @UniqueConstraint(name = "uk_presence_user_day", columnNames = {"utilisateur_id", "date_presence"})
})
@EntityListeners(AuditingEntityListener.class)
public class Presence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "utilisateur_id", nullable = false)
    private Long utilisateurId;

    @Column(name = "date_presence", nullable = false)
    private LocalDate datePresence;

    @Column(name = "heure_entree")
    private LocalDateTime heureEntree;

    @Column(name = "heure_sortie")
    private LocalDateTime heureSortie;

    @Column(name = "total_heures_travaillees", precision = 5, scale = 2)
    private BigDecimal totalHeuresTravaillees;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private PresenceStatus status = PresenceStatus.ABSENT;

    @Column(name = "overtime_hours", precision = 5, scale = 2)
    private BigDecimal overtimeHours;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
