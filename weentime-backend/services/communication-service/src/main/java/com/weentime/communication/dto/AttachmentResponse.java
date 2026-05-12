package com.weentime.communication.dto;

import lombok.Builder;
import java.time.Instant;
import java.util.UUID;

@Builder
public record AttachmentResponse(
        UUID id,
        String fileName,
        String originalName,
        String contentType,
        Long fileSize,
        String url,
        Instant createdAt
) {
}
