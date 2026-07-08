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

import java.time.LocalDateTime;
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
                .thenReturn(Optional.of(enterprise(true, "WEEN-22024")));

        EntrepriseValidationDTO response = service.validateCode("WEEN-22024");

        assertThat(response.isValid()).isTrue();
        assertThat(response.getEnterpriseId()).isEqualTo(1L);
        assertThat(response.getEnterpriseName()).isEqualTo("Weentime");
        assertThat(response.getStatus()).isEqualTo("ACTIVE");
        assertThat(response.getInvitationCode()).isEqualTo("WEEN-22024");
        assertThat(response.getReason()).isNull();
    }

    @Test
    void shouldValidateActiveInvitationCodeEvenWhenLegacyExpirationIsPast() {
        Entreprise activeEnterprise = enterprise(true, "WEEN-22024");
        activeEnterprise.setCodeExpiration(LocalDateTime.now().minusDays(1));
        when(entrepriseRepository.findByNormalizedCodeInvitation(anyCollection()))
                .thenReturn(Optional.of(activeEnterprise));

        EntrepriseValidationDTO response = service.validateCode("WEEN-22024");

        assertThat(response.isValid()).isTrue();
        assertThat(response.getInvitationCode()).isEqualTo("WEEN-22024");
    }

    @Test
    void shouldRejectExistingClosedInvitationCode() {
        when(entrepriseRepository.findByNormalizedCodeInvitation(anyCollection()))
                .thenReturn(Optional.of(enterprise(false)));

        EntrepriseValidationDTO response = service.validateCode("WEEN-1024");

        assertThat(response.isValid()).isFalse();
        assertThat(response.getReason()).isEqualTo("ENTERPRISE_CLOSED");
        assertThat(response.getMessage()).isEqualTo("Cette entreprise est fermée. Contactez votre administrateur.");
        assertThat(response.getStatus()).isEqualTo("CLOSED");
        assertThat(response.getEnterpriseId()).isEqualTo(1L);
        assertThat(response.getInvitationCode()).isEqualTo("WEEN-1024");
    }

    @Test
    void shouldRejectUnknownInvitationCode() {
        when(entrepriseRepository.findByNormalizedCodeInvitation(anyCollection()))
                .thenReturn(Optional.empty());

        EntrepriseValidationDTO response = service.validateCode("INVALID-CODE");

        assertThat(response.isValid()).isFalse();
        assertThat(response.getReason()).isEqualTo("CODE_NOT_FOUND");
        assertThat(response.getMessage()).isEqualTo("Code d'invitation invalide ou expiré.");
        assertThat(response.getEnterpriseId()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ween-22024", " WEEN 22024 "})
    void shouldNormalizeInvitationCodeBeforeLookup(String rawCode) {
        when(entrepriseRepository.findByNormalizedCodeInvitation(anyCollection()))
                .thenReturn(Optional.of(enterprise(true, "WEEN-22024")));

        service.validateCode(rawCode);

        ArgumentCaptor<Collection<String>> candidates = collectionCaptor();
        verify(entrepriseRepository).findByNormalizedCodeInvitation(candidates.capture());
        assertThat(candidates.getValue()).contains("WEEN-22024");
    }

    @Test
    void shouldLookupSuffixOnlyStoredCodeWhenPrefixedCodeIsProvided() {
        when(entrepriseRepository.findByNormalizedCodeInvitation(anyCollection()))
                .thenReturn(Optional.of(enterprise(true, "C3F302B5E8CF")));

        EntrepriseValidationDTO response = service.validateCode("WEEN-C3F302B5E8CF");

        ArgumentCaptor<Collection<String>> candidates = collectionCaptor();
        verify(entrepriseRepository).findByNormalizedCodeInvitation(candidates.capture());
        assertThat(candidates.getValue())
                .contains("WEEN-C3F302B5E8CF", "C3F302B5E8CF", "WEENC3F302B5E8CF");
        assertThat(response.isValid()).isTrue();
        assertThat(response.getInvitationCode()).isEqualTo("WEEN-C3F302B5E8CF");
    }

    @Test
    void shouldNormalizeVisualHashPrefixBeforeLookup() {
        when(entrepriseRepository.findByNormalizedCodeInvitation(anyCollection()))
                .thenReturn(Optional.of(enterprise(true, "WEEN-C3F302B5E8CF")));

        service.validateCode("#N - C3F302B5E8CF");

        ArgumentCaptor<Collection<String>> candidates = collectionCaptor();
        verify(entrepriseRepository).findByNormalizedCodeInvitation(candidates.capture());
        assertThat(candidates.getValue())
                .contains("WEEN-C3F302B5E8CF", "C3F302B5E8CF");
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private ArgumentCaptor<Collection<String>> collectionCaptor() {
        return ArgumentCaptor.forClass(Collection.class);
    }

    private Entreprise enterprise(boolean active) {
        return enterprise(active, "WEEN-1024");
    }

    private Entreprise enterprise(boolean active, String codeInvitation) {
        return Entreprise.builder()
                .id(1L)
                .nom("Weentime")
                .secteur("Tech")
                .codeInvitation(codeInvitation)
                .estActive(active)
                .status(active ? "ACTIVE" : "CLOSED")
                .currentUsers(5)
                .maxUsers(100)
                .build();
    }
}
