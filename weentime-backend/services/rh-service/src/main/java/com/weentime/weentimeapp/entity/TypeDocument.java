package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "type_documents")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String libelle;

    @Column(nullable = false, unique = true)
    private String code; // e.g. "CONTRAT", "ATTESTATION_SALAIRE"

    private Boolean requireSignature;

    private Boolean enableTemplate; // If the document is generated from a template
}
