package com.weentime.weentimeapp.entity;


import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.SuperBuilder;
import java.time.LocalDateTime;

@Entity
@Table(name = "documents")
@PrimaryKeyJoinColumn(name = "demande_id")
@Data
@EqualsAndHashCode(callSuper = true)
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public class Document extends Demande {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "type_document_id", nullable = false)
    private TypeDocument typeDocument;

    private String moisConcerne;

    private String documentUrl;
    @Column(name = "generated_by_ai", nullable = false)
    @Builder.Default
    private boolean generatedByAI = false;

    @Column(name = "contenu_ia", columnDefinition = "TEXT")
    private String contenuIA;

    @Column(name = "commentaire_rh", length = 1000)
    private String commentaireRH;

    @Column(name = "ai_model_used", length = 50)
    private String aiModelUsed;

    @Column(name = "tokens_used")
    private Integer tokensUsed;

    private Integer nombreExemplaires;

    @Column(name = "validated_by")
    private Long validatedBy;

    @Column(name = "validated_at")
    private LocalDateTime validatedAt;

    @Column(name = "signed_at")
    private LocalDateTime signedAt;

    @Column(name = "signed_by")
    private String signedBy;
}