package com.weentime.communication.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Filter;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
@Table(name = "comm_attachments", schema = "communication")
public class CommAttachment {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "uploader_id", nullable = false)
    private Long uploaderId;

    @Column(name = "message_id")
    private UUID messageId;

    @Column(name = "file_name", nullable = false, length = 500)
    private String fileName;

    @Column(name = "original_name", nullable = false, length = 500)
    private String originalName;

    @Column(name = "content_type", nullable = false, length = 200)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @Column(name = "storage_path", nullable = false, length = 1000)
    private String storagePath;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
