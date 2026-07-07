package com.weentime.weentimeproject.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Filter;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "entreprise_access_control_history")
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
public class EntrepriseAccessControlHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "changed_by", nullable = false, length = 255)
    private String changedBy;

    @Column(name = "changed_at", nullable = false)
    private LocalDateTime changedAt;

    @Column(name = "role", nullable = false, length = 50)
    private String role;

    @Column(name = "module_key", nullable = false, length = 50)
    private String moduleKey;

    @Column(name = "previous_value", nullable = false)
    private boolean previousValue;

    @Column(name = "new_value", nullable = false)
    private boolean newValue;

    // ── Factory method
    public static EntrepriseAccessControlHistory of(
            Long entrepriseId,
            String changedBy,
            String role,
            String moduleKey,
            boolean previousValue,
            boolean newValue) {
        return EntrepriseAccessControlHistory.builder()
                .entrepriseId(entrepriseId)
                .changedBy(changedBy)
                .changedAt(LocalDateTime.now())
                .role(role)
                .moduleKey(moduleKey)
                .previousValue(previousValue)
                .newValue(newValue)
                .build();
    }
}
