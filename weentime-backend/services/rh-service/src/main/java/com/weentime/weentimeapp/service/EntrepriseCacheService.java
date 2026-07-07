package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.client.EntrepriseServiceClient;
import com.weentime.weentimeapp.dto.EntrepriseResponse;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class EntrepriseCacheService {

    private final EntrepriseServiceClient entrepriseServiceClient;

    public EntrepriseCacheService(EntrepriseServiceClient entrepriseServiceClient) {
        this.entrepriseServiceClient = entrepriseServiceClient;
    }

    @Cacheable(value = "entrepriseCache", key = "#id")
    public EntrepriseResponse getEntrepriseById(Long id) {
        return entrepriseServiceClient.getEntrepriseById(id);
    }

    @CacheEvict(value = "entrepriseCache", key = "#id")
    public void evict(Long id) {}
}
