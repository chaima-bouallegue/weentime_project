package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeAutorisationDTO;
import com.weentime.weentimeapp.entity.TypeAutorisation;
import com.weentime.weentimeapp.mapper.TypeAutorisationMapper;
import com.weentime.weentimeapp.repository.TypeAutorisationRepository;
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
class TypeAutorisationServiceImplTest {

    @Mock
    private TypeAutorisationRepository repository;

    @Mock
    private TypeAutorisationMapper mapper;

    private TypeAutorisationServiceImpl service;

    private static final Long ENTREPRISE_ID = 88L;

    @BeforeEach
    void setUp() {
        service = new TypeAutorisationServiceImpl(repository, mapper);
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
                "rh@enterprise.com", "n/a", List.of()
        );
        auth.setDetails(Map.of("entrepriseId", entrepriseId));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    void createSetsCurrentEntrepriseIdAndSaves() {
        TypeAutorisationDTO dto = TypeAutorisationDTO.builder()
                .libelle("Sortie médicale")
                .maxHeuresMois(4)
                .requireJustificatif(true)
                .build();
        TypeAutorisation entity = TypeAutorisation.builder()
                .libelle("Sortie médicale")
                .maxHeuresMois(4)
                .requireJustificatif(true)
                .build();

        when(mapper.toEntity(dto)).thenReturn(entity);
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(dto);

        TypeAutorisationDTO result = service.create(dto);

        assertThat(result).isNotNull();
        assertThat(entity.getEntrepriseId()).isEqualTo(ENTREPRISE_ID);
        verify(repository).save(entity);
    }

    @Test
    void getByIdReturnsDtoWhenBelongsToCurrentEntreprise() {
        TypeAutorisation entity = TypeAutorisation.builder()
                .id(1L)
                .libelle("Personnel")
                .entrepriseId(ENTREPRISE_ID)
                .build();
        TypeAutorisationDTO dto = TypeAutorisationDTO.builder()
                .id(1L)
                .libelle("Personnel")
                .build();

        when(repository.findById(1L)).thenReturn(Optional.of(entity));
        when(mapper.toDto(entity)).thenReturn(dto);

        TypeAutorisationDTO result = service.getById(1L);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(1L);
    }

    @Test
    void getByIdThrowsWhenNotFoundOrDifferentEntreprise() {
        TypeAutorisation otherEntity = TypeAutorisation.builder()
                .id(2L)
                .libelle("Autre")
                .entrepriseId(999L)
                .build();
        when(repository.findById(2L)).thenReturn(Optional.of(otherEntity));

        assertThatThrownBy(() -> service.getById(2L))
                .isInstanceOf(EntityNotFoundException.class)
                .hasMessageContaining("access denied");
    }

    @Test
    void getAllReturnsListForCurrentEntreprise() {
        TypeAutorisation entity = TypeAutorisation.builder()
                .id(1L)
                .libelle("Urgence")
                .entrepriseId(ENTREPRISE_ID)
                .build();
        TypeAutorisationDTO dto = TypeAutorisationDTO.builder()
                .id(1L)
                .libelle("Urgence")
                .build();

        when(repository.findAllByEntrepriseId(ENTREPRISE_ID)).thenReturn(List.of(entity));
        when(mapper.toDtoList(List.of(entity))).thenReturn(List.of(dto));

        List<TypeAutorisationDTO> result = service.getAll();

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getLibelle()).isEqualTo("Urgence");
    }

    @Test
    void updateUpdatesEntityFieldsWhenAuthorized() {
        TypeAutorisation entity = TypeAutorisation.builder()
                .id(3L)
                .libelle("Ancien")
                .maxHeuresMois(2)
                .entrepriseId(ENTREPRISE_ID)
                .build();
        TypeAutorisationDTO dto = TypeAutorisationDTO.builder()
                .id(3L)
                .libelle("Nouveau")
                .maxHeuresMois(5)
                .requireJustificatif(true)
                .build();

        when(repository.findById(3L)).thenReturn(Optional.of(entity));
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(dto);

        TypeAutorisationDTO updated = service.update(3L, dto);

        assertThat(updated.getLibelle()).isEqualTo("Nouveau");
        assertThat(entity.getLibelle()).isEqualTo("Nouveau");
        assertThat(entity.getMaxHeuresMois()).isEqualTo(5);
    }

    @Test
    void deleteRemovesEntityWhenAuthorized() {
        TypeAutorisation entity = TypeAutorisation.builder()
                .id(4L)
                .entrepriseId(ENTREPRISE_ID)
                .build();
        when(repository.findById(4L)).thenReturn(Optional.of(entity));

        service.delete(4L);

        verify(repository).delete(entity);
    }

    @Test
    void requireEntrepriseIdThrowsBadRequestWhenNoAuthentication() {
        setSecurityContext(null);

        assertThatThrownBy(() -> service.getAll())
                .isInstanceOf(ResponseStatusException.class);
    }
}
