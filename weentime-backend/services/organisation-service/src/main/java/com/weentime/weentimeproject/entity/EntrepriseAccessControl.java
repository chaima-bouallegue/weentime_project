package com.weentime.weentimeproject.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Filter;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
@EntityListeners(AuditingEntityListener.class)
@Table(name = "entreprise_access_control",
       uniqueConstraints = @UniqueConstraint(
               name = "uq_eac_entreprise_role_module",
               columnNames = {"entreprise_id", "role", "module_key"}))
public class EntrepriseAccessControl {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "role", nullable = false, length = 50)
    private String role;

    @Column(name = "module_key", nullable = false, length = 50)
    private String moduleKey;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "updated_by", length = 255)
    private String updatedBy;

    // ── Factory method
    public static EntrepriseAccessControl defaultFor(
            Long entrepriseId, String role, String moduleKey) {
        return EntrepriseAccessControl.builder()
                .entrepriseId(entrepriseId)
                .role(role)
                .moduleKey(moduleKey)
                .enabled(true)
                .build();
    }
}