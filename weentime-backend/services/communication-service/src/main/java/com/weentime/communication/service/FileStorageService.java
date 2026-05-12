package com.weentime.communication.service;

import com.weentime.communication.config.CommunicationProperties;
import com.weentime.communication.exception.CommunicationException;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FileStorageService {

    private final CommunicationProperties properties;

    public String store(Long entrepriseId, MultipartFile file) {
        String originalFileName = StringUtils.cleanPath(Objects.requireNonNull(file.getOriginalFilename()));
        String fileExtension = getFileExtension(originalFileName);
        String fileName = UUID.randomUUID() + (fileExtension.isEmpty() ? "" : "." + fileExtension);

        try {
            Path uploadPath = Paths.get(properties.getStorage().getBasePath()).resolve(entrepriseId.toString());
            if (!Files.exists(uploadPath)) {
                Files.createDirectories(uploadPath);
            }

            Path targetLocation = uploadPath.resolve(fileName);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);

            return entrepriseId + "/" + fileName;
        } catch (IOException ex) {
            throw new CommunicationException(HttpStatus.INTERNAL_SERVER_ERROR, "FILE_STORAGE_ERROR",
                    "Could not store file " + originalFileName + ". Please try again!", Map.of("fileName", originalFileName));
        }
    }

    public Resource loadAsResource(String storagePath) {
        try {
            Path filePath = Paths.get(properties.getStorage().getBasePath()).resolve(storagePath).normalize();
            Resource resource = new UrlResource(filePath.toUri());
            if (resource.exists()) {
                return resource;
            } else {
                throw new CommunicationException(HttpStatus.NOT_FOUND, "FILE_NOT_FOUND",
                        "File not found " + storagePath, Map.of("path", storagePath));
            }
        } catch (MalformedURLException ex) {
            throw new CommunicationException(HttpStatus.NOT_FOUND, "FILE_NOT_FOUND",
                    "File not found " + storagePath, Map.of("path", storagePath));
        }
    }

    public void delete(String storagePath) {
        try {
            Path filePath = Paths.get(properties.getStorage().getBasePath()).resolve(storagePath).normalize();
            Files.deleteIfExists(filePath);
        } catch (IOException ex) {
            // Log and ignore
        }
    }

    private String getFileExtension(String fileName) {
        int lastIndex = fileName.lastIndexOf('.');
        if (lastIndex == -1) {
            return "";
        }
        return fileName.substring(lastIndex + 1);
    }
}
