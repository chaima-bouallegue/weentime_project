package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.service.AvatarStorageService;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.UUID;

@Service
public class AvatarStorageServiceImpl implements AvatarStorageService {

    private static final long MAX_SIZE_BYTES = 2L * 1024L * 1024L;
    private static final String STORAGE_PREFIX = "/api/v1/users/avatar/";
    private final Path storageDirectory = Path.of(System.getProperty("user.home"), ".weentime", "avatars");

    @Override
    public String storeAvatar(Long userId, MultipartFile file) {
        validate(file);

        try {
            Files.createDirectories(storageDirectory);
            String extension = getExtension(file.getOriginalFilename());
            String filename = "user-" + userId + "-" + UUID.randomUUID() + extension;
            Path targetFile = storageDirectory.resolve(filename).normalize();

            try (InputStream inputStream = file.getInputStream()) {
                Files.copy(inputStream, targetFile, StandardCopyOption.REPLACE_EXISTING);
            }

            return STORAGE_PREFIX + filename;
        } catch (IOException exception) {
            throw new IllegalStateException("Impossible d'enregistrer l'avatar.", exception);
        }
    }

    @Override
    public Resource loadAvatar(String filename) {
        try {
            Path file = storageDirectory.resolve(filename).normalize();
            Resource resource = new UrlResource(file.toUri());
            if (!resource.exists() || !resource.isReadable()) {
                throw new IllegalArgumentException("Avatar introuvable.");
            }
            return resource;
        } catch (IOException exception) {
            throw new IllegalStateException("Impossible de charger l'avatar.", exception);
        }
    }

    @Override
    public void deleteAvatar(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) {
            return;
        }

        String filename = avatarUrl.substring(avatarUrl.lastIndexOf('/') + 1);
        try {
            Files.deleteIfExists(storageDirectory.resolve(filename).normalize());
        } catch (IOException ignored) {
            // Best effort cleanup. Missing files should not block profile updates.
        }
    }

    private void validate(MultipartFile file) {
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        if (!contentType.startsWith("image/")) {
            throw new IllegalArgumentException("Le fichier doit etre une image.");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new IllegalArgumentException("L'avatar ne doit pas depasser 2 Mo.");
        }
    }

    private String getExtension(String originalFilename) {
        if (originalFilename == null || !originalFilename.contains(".")) {
            return ".png";
        }
        return originalFilename.substring(originalFilename.lastIndexOf('.')).toLowerCase(Locale.ROOT);
    }
}
