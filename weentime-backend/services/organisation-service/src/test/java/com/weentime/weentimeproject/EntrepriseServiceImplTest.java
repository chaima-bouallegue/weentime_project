package com.weentime.weentimeproject;

import com.weentime.weentimeproject.dto.EntrepriseValidationDTO;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.mapper.EntrepriseMapper;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.service.impl.EntrepriseServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;

import java.util.Collection;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EntrepriseServiceImplTest {

    @Mock
    private EntrepriseRepository entrepriseRepository;

    @Mock
    private EntrepriseMapper entrepriseMapper;

    private EntrepriseServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new EntrepriseServiceImpl(entrepriseRepository, entrepriseMapper);
    }

    @Test
    void shouldValidateActiveInvitationCode() {
        when(entrepriseRepository.findByNormalizedCodeInvitation(anyCollection()))
                .thenReturn(Optional.of(enterprise(true)));

        EntrepriseValidationDTO response = service.validateCode("WEEN-1024");

        assertThat(response.isValid()).isTrue();
        assertThat(response.getEnterpriseId()).isEqualTo(1L);
        assertThat(response.getEnterpriseName()).isEqualTo("Weentime");
        assertThat(response.getStatus()).isEqualTo("ACTIVE");
        assertThat(response.getReason()).isNull();
    }

    @Test
    void shouldRejectExistingClosedInvitationCode() {
        when(entrepriseRepository.findByNormalizedCodeInvitation(anyCollection()))
                .thenReturn(Optional.of(enterprise(false)));

        EntrepriseValidationDTO response = service.validateCode("WEEN-1024");

        assertThat(response.isValid()).isFalse();
        assertThat(response.getReason()).isEqualTo("ENTERPRISE_CLOSED");
        assertThat(response.getMessage()).isEqualTo("Cette entreprise est fermée.");
        assertThat(response.getStatus()).isEqualTo("CLOSED");
        assertThat(response.getEnterpriseId()).isEqualTo(1L);
    }

    @Test
    void shouldRejectUnknownInvitationCode() {
        when(entrepriseRepository.findByNormalizedCodeInvitation(anyCollection()))
                .thenReturn(Optional.empty());

        EntrepriseValidationDTO response = service.validateCode("INVALID-CODE");

        assertThat(response.isValid()).isFalse();
        assertThat(response.getReason()).isEqualTo("CODE_NOT_FOUND");
        assertThat(response.getMessage()).isEqualTo("Code d'invitation invalide.");
        assertThat(response.getEnterpriseId()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ween-1024", " WEEN 1024 "})
    void shouldNormalizeInvitationCodeBeforeLookup(String rawCode) {
        when(entrepriseRepository.findByNormalizedCodeInvitation(anyCollection()))
                .thenReturn(Optional.of(enterprise(true)));

        service.validateCode(rawCode);

        ArgumentCaptor<Collection<String>> candidates = collectionCaptor();
        verify(entrepriseRepository).findByNormalizedCodeInvitation(candidates.capture());
        assertThat(candidates.getValue()).contains("WEEN-1024");
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private ArgumentCaptor<Collection<String>> collectionCaptor() {
        return ArgumentCaptor.forClass(Collection.class);
    }

    private Entreprise enterprise(boolean active) {
        return Entreprise.builder()
                .id(1L)
                .nom("Weentime")
                .secteur("Tech")
                .codeInvitation("WEEN-1024")
                .estActive(active)
                .currentUsers(5)
                .maxUsers(100)
                .build();
    }
}
