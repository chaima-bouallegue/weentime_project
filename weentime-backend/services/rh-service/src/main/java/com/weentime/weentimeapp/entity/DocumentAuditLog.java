package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Filter;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * Audit trail pour toutes les actions documentaires.
 * Chaque génération, validation, refus ou téléchargement est loggé.
 */
@Entity
@Table(name = "document_audit_logs", indexes = {
    @Index(name = "idx_audit_entreprise", columnList = "entreprise_id"),
    @Index(name = "idx_audit_document", columnList = "document_id")
})
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "document_id")
    private Long documentId;

    @Column(nullable = false, length = 50)
    private String action;

    @Column(name = "performed_by", nullable = false)
    private Long performedBy;

    @Column(name = "performed_at", nullable = false)
    @Builder.Default
    private LocalDateTime performedAt = LocalDateTime.now();

    @Column(columnDefinition = "TEXT")
    private String details;
}
