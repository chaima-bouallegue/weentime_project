package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.entity.ConfigTeletravail;
import com.weentime.weentimeapp.repository.ConfigTeletravailRepository;
import com.weentime.weentimeapp.service.ConfigTeletravailService;
import com.weentime.weentimeapp.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ConfigTeletravailServiceImpl implements ConfigTeletravailService {

    private final ConfigTeletravailRepository repository;

    @Override
    @Transactional(readOnly = true)
    public ConfigTeletravail getConfig() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        return repository.findByEntrepriseId(entrepriseId)
                .orElse(ConfigTeletravail.builder()
                        .entrepriseId(entrepriseId)
                        .quotaMensuel(4) // Default value
                        .build());
    }

    @Override
    public ConfigTeletravail updateConfig(ConfigTeletravail config) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        ConfigTeletravail existing = repository.findByEntrepriseId(entrepriseId)
                .orElse(ConfigTeletravail.builder()
                        .entrepriseId(entrepriseId)
                        .build());
        
        existing.setQuotaMensuel(config.getQuotaMensuel());
        return repository.save(existing);
    }
}
