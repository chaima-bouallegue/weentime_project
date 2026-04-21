package com.weentime.weentimeproject.service;

import org.springframework.web.multipart.MultipartFile;

public interface AvatarStorageService {
    String storeAvatar(Long userId, MultipartFile file);
    org.springframework.core.io.Resource loadAvatar(String filename);
    void deleteAvatar(String avatarUrl);
}
