package com.weentime.communication.controller;

import com.weentime.communication.config.CommunicationProperties;
import com.weentime.communication.dto.ApiEnvelope;
import com.weentime.communication.dto.AttachmentResponse;
import com.weentime.communication.entity.CommAttachment;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.repository.CommAttachmentRepository;
import com.weentime.communication.security.SecurityUtils;
import com.weentime.communication.service.FileStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/communication/attachments")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class AttachmentController {

    private final FileStorageService fileStorageService;
    private final CommAttachmentRepository attachmentRepository;
    private final CommunicationProperties properties;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiEnvelope<List<AttachmentResponse>> uploadAttachments(@RequestParam("files") List<MultipartFile> files) {
        var currentUser = SecurityUtils.currentUser();
        if (currentUser.entrepriseId() == null) {
            throw new CommunicationException(HttpStatus.FORBIDDEN, "TENANT_REQUIRED", "Tenant ID is required for file uploads.");
        }
        if (files.size() > 5) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "TOO_MANY_FILES", "Maximum 5 files allowed per upload.");
        }

        List<AttachmentResponse> responses = new ArrayList<>();
        for (MultipartFile file : files) {
            validateFile(file);
            String storagePath = fileStorageService.store(currentUser.entrepriseId(), file);

            CommAttachment attachment = new CommAttachment();
            attachment.setEntrepriseId(currentUser.entrepriseId());
            attachment.setUploaderId(currentUser.userId());
            attachment.setFileName(storagePath.substring(storagePath.lastIndexOf('/') + 1));
            attachment.setOriginalName(file.getOriginalFilename());
            attachment.setContentType(file.getContentType());
            attachment.setFileSize(file.getSize());
            attachment.setStoragePath(storagePath);
            attachment.setCreatedAt(Instant.now());

            attachment = attachmentRepository.save(attachment);
            responses.add(mapToResponse(attachment));
        }

        return ApiEnvelope.success(responses);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> downloadAttachment(@PathVariable UUID id) {
        var currentUser = SecurityUtils.currentUser();
        CommAttachment attachment = attachmentRepository.findByIdAndEntrepriseId(id, currentUser.entrepriseId())
                .orElseThrow(() -> new CommunicationException(HttpStatus.NOT_FOUND, "ATTACHMENT_NOT_FOUND", "Attachment not found."));

        Resource resource = fileStorageService.loadAsResource(attachment.getStoragePath());

        String disposition = isImage(attachment.getContentType()) ? "inline" : "attachment";
        
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(attachment.getContentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition + "; filename=\"" + attachment.getOriginalName() + "\"")
                .body(resource);
    }

    private boolean isImage(String contentType) {
        return contentType != null && contentType.startsWith("image/");
    }

    private void validateFile(MultipartFile file) {
        long maxSizeBytes = properties.getStorage().getMaxFileSizeMb() * 1024L * 1024L;
        if (file.getSize() > maxSizeBytes) {
            log.warn("File too large: {} ({} bytes)", file.getOriginalFilename(), file.getSize());
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "FILE_TOO_LARGE", 
                "File " + file.getOriginalFilename() + " exceeds the maximum size of " + properties.getStorage().getMaxFileSizeMb() + "MB.");
        }

        String contentType = file.getContentType();
        if (contentType == null) {
            log.warn("File content type is null: {}", file.getOriginalFilename());
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "INVALID_FILE_TYPE", "File content type is missing.");
        }

        // Clean up content type (remove parameters like charset)
        String cleanContentType = contentType.split(";")[0].trim().toLowerCase();
        String allowedTypesStr = properties.getStorage().getAllowedTypes().toLowerCase();
        List<String> allowedList = Arrays.asList(allowedTypesStr.split(","));

        log.debug("Validating file: {} with type: {} (cleaned: {})", file.getOriginalFilename(), contentType, cleanContentType);

        if (!allowedList.contains(cleanContentType)) {
            log.warn("File type not allowed: {} for file: {}", contentType, file.getOriginalFilename());
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "INVALID_FILE_TYPE", 
                "File type " + contentType + " is not allowed.");
        }
    }

    private AttachmentResponse mapToResponse(CommAttachment attachment) {
        return AttachmentResponse.builder()
                .id(attachment.getId())
                .fileName(attachment.getFileName())
                .originalName(attachment.getOriginalName())
                .contentType(attachment.getContentType())
                .fileSize(attachment.getFileSize())
                .url("/api/v1/communication/attachments/" + attachment.getId() + "/download")
                .createdAt(attachment.getCreatedAt())
                .build();
    }
}
