package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.entity.ConfigTeletravail;
import com.weentime.weentimeapp.repository.ConfigTeletravailRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConfigTeletravailServiceImplTest {

    @Mock
    private ConfigTeletravailRepository repository;

    private ConfigTeletravailServiceImpl service;

    private static final Long ENTREPRISE_ID = 42L;

    @BeforeEach
    void setUp() {
        service = new ConfigTeletravailServiceImpl(repository);
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                "user@test.com", "n/a", List.of()
        );
        authentication.setDetails(Map.of("entrepriseId", ENTREPRISE_ID));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getConfigReturnsExistingConfigWhenPresent() {
        ConfigTeletravail existing = ConfigTeletravail.builder()
                .id(1L)
                .entrepriseId(ENTREPRISE_ID)
                .quotaMensuel(8)
                .build();
        when(repository.findByEntrepriseId(ENTREPRISE_ID)).thenReturn(Optional.of(existing));

        ConfigTeletravail result = service.getConfig();

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(1L);
        assertThat(result.getQuotaMensuel()).isEqualTo(8);
        assertThat(result.getEntrepriseId()).isEqualTo(ENTREPRISE_ID);
    }

    @Test
    void getConfigReturnsDefaultWhenNotFound() {
        when(repository.findByEntrepriseId(ENTREPRISE_ID)).thenReturn(Optional.empty());

        ConfigTeletravail result = service.getConfig();

        assertThat(result).isNotNull();
        assertThat(result.getQuotaMensuel()).isEqualTo(4);
        assertThat(result.getEntrepriseId()).isEqualTo(ENTREPRISE_ID);
    }

    @Test
    void updateConfigModifiesExistingConfig() {
        ConfigTeletravail existing = ConfigTeletravail.builder()
                .id(1L)
                .entrepriseId(ENTREPRISE_ID)
                .quotaMensuel(4)
                .build();
        when(repository.findByEntrepriseId(ENTREPRISE_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ConfigTeletravail input = ConfigTeletravail.builder()
                .quotaMensuel(10)
                .build();

        ConfigTeletravail updated = service.updateConfig(input);

        assertThat(updated.getQuotaMensuel()).isEqualTo(10);
        ArgumentCaptor<ConfigTeletravail> captor = ArgumentCaptor.forClass(ConfigTeletravail.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getQuotaMensuel()).isEqualTo(10);
        assertThat(captor.getValue().getEntrepriseId()).isEqualTo(ENTREPRISE_ID);
    }

    @Test
    void updateConfigCreatesNewConfigIfNoneExists() {
        when(repository.findByEntrepriseId(ENTREPRISE_ID)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ConfigTeletravail input = ConfigTeletravail.builder()
                .quotaMensuel(6)
                .build();

        ConfigTeletravail created = service.updateConfig(input);

        assertThat(created.getQuotaMensuel()).isEqualTo(6);
        assertThat(created.getEntrepriseId()).isEqualTo(ENTREPRISE_ID);
    }
}
