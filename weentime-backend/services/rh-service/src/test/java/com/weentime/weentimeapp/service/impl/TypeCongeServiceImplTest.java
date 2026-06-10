package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeCongeDTO;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.mapper.TypeCongeMapper;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TypeCongeServiceImplTest {

    @Mock
    private TypeCongeRepository typeCongeRepository;

    @Mock
    private TypeCongeMapper typeCongeMapper;

    private TypeCongeServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new TypeCongeServiceImpl(typeCongeRepository, typeCongeMapper);
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                "rh@example.com",
                "n/a",
                List.of()
        );
        authentication.setDetails(Map.of("userId", 5L, "entrepriseId", 13L));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createScopesTypeCongeToCurrentEntreprise() {
        TypeCongeDTO input = TypeCongeDTO.builder()
                .libelle(" Conge maternite ")
                .nombreJoursMax(90)
                .decompteJours(true)
                .requireJustificatif(true)
                .build();
        TypeConge entity = TypeConge.builder().libelle(input.getLibelle()).build();
        TypeConge saved = TypeConge.builder()
                .id(7L)
                .entrepriseId(13L)
                .libelle("Conge maternite")
                .nombreJoursMax(90)
                .decompteJours(true)
                .requireJustificatif(true)
                .build();
        TypeCongeDTO output = TypeCongeDTO.builder().id(7L).libelle("Conge maternite").build();

        when(typeCongeRepository.findAllByEntrepriseId(13L)).thenReturn(List.of());
        when(typeCongeMapper.toEntity(input)).thenReturn(entity);
        when(typeCongeRepository.saveAndFlush(any(TypeConge.class))).thenReturn(saved);
        when(typeCongeMapper.toDto(saved)).thenReturn(output);

        TypeCongeDTO result = service.create(input);

        assertThat(result.getId()).isEqualTo(7L);
        ArgumentCaptor<TypeConge> captor = ArgumentCaptor.forClass(TypeConge.class);
        verify(typeCongeRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getEntrepriseId()).isEqualTo(13L);
        assertThat(captor.getValue().getLibelle()).isEqualTo("Conge maternite");
    }

    @Test
    void createRejectsDuplicateLibelleWithConflict() {
        TypeCongeDTO input = TypeCongeDTO.builder().libelle("Conge maternite").build();
        when(typeCongeRepository.findAllByEntrepriseId(13L)).thenReturn(List.of(TypeConge.builder()
                .id(21L)
                .entrepriseId(13L)
                .libelle("Conge maternite")
                .build()));

        assertThatThrownBy(() -> service.create(input))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void createRejectsAccentCaseAndSpaceDuplicateWithConflict() {
        TypeCongeDTO input = TypeCongeDTO.builder().libelle("   CONGE   MATERNITE  ").build();
        when(typeCongeRepository.findAllByEntrepriseId(13L)).thenReturn(List.of(TypeConge.builder()
                .id(21L)
                .entrepriseId(13L)
                .libelle("Congé maternité")
                .build()));

        assertThatThrownBy(() -> service.create(input))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void inactiveOrHiddenRowsNotReturnedByTenantListDoNotBlockCreation() {
        TypeCongeDTO input = TypeCongeDTO.builder().libelle("Congé maternité").build();
        TypeConge entity = TypeConge.builder().libelle(input.getLibelle()).build();
        TypeConge saved = TypeConge.builder()
                .id(22L)
                .entrepriseId(13L)
                .libelle("Congé maternité")
                .build();
        TypeCongeDTO output = TypeCongeDTO.builder().id(22L).libelle("Congé maternité").build();

        when(typeCongeRepository.findAllByEntrepriseId(13L)).thenReturn(List.of());
        when(typeCongeMapper.toEntity(input)).thenReturn(entity);
        when(typeCongeRepository.saveAndFlush(any(TypeConge.class))).thenReturn(saved);
        when(typeCongeMapper.toDto(saved)).thenReturn(output);

        TypeCongeDTO result = service.create(input);

        assertThat(result.getId()).isEqualTo(22L);
        verify(typeCongeRepository).findAllByEntrepriseId(13L);
    }

    @Test
    void getAllReturnsTypesFromSameEntrepriseScopedSourceUsedByDuplicateCheck() {
        TypeConge type = TypeConge.builder()
                .id(31L)
                .entrepriseId(13L)
                .libelle("Congé exceptionnel")
                .build();
        TypeCongeDTO dto = TypeCongeDTO.builder().id(31L).libelle("Congé exceptionnel").build();

        when(typeCongeRepository.findAllByEntrepriseId(13L)).thenReturn(List.of(type));
        when(typeCongeMapper.toDtoList(List.of(type))).thenReturn(List.of(dto));

        List<TypeCongeDTO> result = service.getAll();

        assertThat(result)
                .extracting(TypeCongeDTO::getLibelle)
                .containsExactly("Congé exceptionnel");
        verify(typeCongeRepository).findAllByEntrepriseId(13L);
    }

    @Test
    void createRejectsMissingLibelleWithBadRequest() {
        TypeCongeDTO input = TypeCongeDTO.builder().nombreJoursMax(10).build();

        assertThatThrownBy(() -> service.create(input))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void createRejectsNegativeJoursMaxWithBadRequest() {
        TypeCongeDTO input = TypeCongeDTO.builder()
                .libelle("Conge test")
                .nombreJoursMax(-1)
                .build();

        assertThatThrownBy(() -> service.create(input))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void createConvertsDatabaseUniqueViolationToConflict() {
        TypeCongeDTO input = TypeCongeDTO.builder().libelle("Conge test").build();
        TypeConge entity = TypeConge.builder().libelle("Conge test").build();

        when(typeCongeRepository.findAllByEntrepriseId(13L)).thenReturn(List.of());
        when(typeCongeMapper.toEntity(input)).thenReturn(entity);
        when(typeCongeRepository.saveAndFlush(any(TypeConge.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key violates unique constraint"));

        assertThatThrownBy(() -> service.create(input))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void createDoesNotMislabelOtherDatabaseViolationsAsDuplicates() {
        TypeCongeDTO input = TypeCongeDTO.builder().libelle("Conge test").build();
        TypeConge entity = TypeConge.builder().libelle("Conge test").build();

        when(typeCongeRepository.findAllByEntrepriseId(13L)).thenReturn(List.of());
        when(typeCongeMapper.toEntity(input)).thenReturn(entity);
        when(typeCongeRepository.saveAndFlush(any(TypeConge.class)))
                .thenThrow(new DataIntegrityViolationException("null value violates not-null constraint"));

        assertThatThrownBy(() -> service.create(input))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
