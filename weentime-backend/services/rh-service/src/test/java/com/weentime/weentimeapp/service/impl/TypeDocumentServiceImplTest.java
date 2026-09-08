package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeDocumentDTO;
import com.weentime.weentimeapp.entity.TypeDocument;
import com.weentime.weentimeapp.mapper.TypeDocumentMapper;
import com.weentime.weentimeapp.repository.TypeDocumentRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TypeDocumentServiceImplTest {

    @Mock
    private TypeDocumentRepository repository;

    @Mock
    private TypeDocumentMapper mapper;

    private TypeDocumentServiceImpl service;

    private static final Long ENTREPRISE_ID = 33L;

    @BeforeEach
    void setUp() {
        service = new TypeDocumentServiceImpl(repository, mapper);
        setSecurityContext(ENTREPRISE_ID);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void setSecurityContext(Long entrepriseId) {
        if (entrepriseId == null) {
            SecurityContextHolder.clearContext();
            return;
        }
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                "user@enterprise.com", "n/a", List.of()
        );
        auth.setDetails(Map.of("entrepriseId", entrepriseId));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    void createSetsDefaultsAndEntrepriseId() {
        TypeDocumentDTO dto = TypeDocumentDTO.builder()
                .libelle("Fiche de paie")
                .code("PAYSLIP")
                .build();
        TypeDocument entity = new TypeDocument();
        entity.setLibelle("Fiche de paie");
        entity.setCode("PAYSLIP");

        when(mapper.toEntity(dto)).thenReturn(entity);
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(dto);

        TypeDocumentDTO result = service.create(dto);

        assertThat(result).isNotNull();
        assertThat(entity.getEntrepriseId()).isEqualTo(ENTREPRISE_ID);
        assertThat(entity.getModeGeneration()).isEqualTo("TEMPLATE_ONLY");
        assertThat(entity.getAiModel()).isEqualTo("GEMINI_FLASH");
        assertThat(entity.getActif()).isTrue();
        verify(repository).save(entity);
    }

    @Test
    void getByIdReturnsDtoWhenAccessible() {
        TypeDocument entity = new TypeDocument();
        entity.setId(1L);
        entity.setLibelle("Certificat");
        entity.setEntrepriseId(ENTREPRISE_ID);

        TypeDocumentDTO dto = TypeDocumentDTO.builder()
                .id(1L)
                .libelle("Certificat")
                .build();

        when(repository.findById(1L)).thenReturn(Optional.of(entity));
        when(mapper.toDto(entity)).thenReturn(dto);

        TypeDocumentDTO result = service.getById(1L);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(1L);
    }

    @Test
    void getByIdThrowsWhenNotFoundOrAccessDenied() {
        TypeDocument otherEntity = new TypeDocument();
        otherEntity.setId(2L);
        otherEntity.setEntrepriseId(999L);
        when(repository.findById(2L)).thenReturn(Optional.of(otherEntity));

        assertThatThrownBy(() -> service.getById(2L))
                .isInstanceOf(EntityNotFoundException.class)
                .hasMessageContaining("access denied");
    }

    @Test
    void getAllFiltersActiveAndSorts() {
        TypeDocument doc1 = new TypeDocument();
        doc1.setId(1L);
        doc1.setLibelle("Attestation");
        doc1.setOrdre(1);
        doc1.setActif(true);
        doc1.setEntrepriseId(ENTREPRISE_ID);

        TypeDocument doc2 = new TypeDocument();
        doc2.setId(2L);
        doc2.setLibelle("Inactif");
        doc2.setOrdre(2);
        doc2.setActif(false);
        doc2.setEntrepriseId(ENTREPRISE_ID);

        TypeDocumentDTO dto1 = TypeDocumentDTO.builder().id(1L).libelle("Attestation").build();

        when(repository.findAllByEntrepriseId(ENTREPRISE_ID)).thenReturn(List.of(doc1, doc2));
        when(mapper.toDtoList(any())).thenReturn(List.of(dto1));

        List<TypeDocumentDTO> list = service.getAll();

        assertThat(list).hasSize(1);
        assertThat(list.get(0).getLibelle()).isEqualTo("Attestation");
    }

    @Test
    void updateModifiesFieldsAndSaves() {
        TypeDocument existing = new TypeDocument();
        existing.setId(5L);
        existing.setLibelle("Ancien titre");
        existing.setEntrepriseId(ENTREPRISE_ID);

        TypeDocumentDTO updateDto = TypeDocumentDTO.builder()
                .libelle("Nouveau titre")
                .code("NEW_CODE")
                .categorie("RH")
                .description("Desc")
                .modeGeneration("AI")
                .aiModel("GPT4")
                .aiTemperature(0.5f)
                .workflowType("DIRECT")
                .niveauConfidentialite("SECRET")
                .requireSignature(true)
                .delaiTraitementJours(5)
                .maxDemandesParMois(3)
                .dureeValiditeJours(365)
                .versionning(true)
                .retentionMois(12)
                .enableTemplate(true)
                .build();

        when(repository.findById(5L)).thenReturn(Optional.of(existing));
        when(repository.save(existing)).thenReturn(existing);
        when(mapper.toDto(existing)).thenReturn(updateDto);

        TypeDocumentDTO updated = service.update(5L, updateDto);

        assertThat(updated).isNotNull();
        assertThat(existing.getLibelle()).isEqualTo("Nouveau titre");
        assertThat(existing.getCode()).isEqualTo("NEW_CODE");
        assertThat(existing.getDelaiTraitementJours()).isEqualTo(5);
        assertThat(existing.getRequireSignature()).isTrue();
    }

    @Test
    void deleteRemovesEntity() {
        TypeDocument entity = new TypeDocument();
        entity.setId(10L);
        entity.setEntrepriseId(ENTREPRISE_ID);
        when(repository.findById(10L)).thenReturn(Optional.of(entity));

        service.delete(10L);

        verify(repository).delete(entity);
    }

    @Test
    void requireEntrepriseIdThrowsBadRequestWhenNotAuthenticated() {
        setSecurityContext(null);

        assertThatThrownBy(() -> service.getAll())
                .isInstanceOf(ResponseStatusException.class);
    }
}
