package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.entity.JourFerie;
import com.weentime.weentimeapp.repository.JourFerieRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JourFerieServiceImplTest {

    @Mock
    private JourFerieRepository repository;

    private JourFerieServiceImpl service;

    private static final Long ENTREPRISE_ID = 55L;

    @BeforeEach
    void setUp() {
        service = new JourFerieServiceImpl(repository);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                "rh@domain.com", "n/a", List.of()
        );
        auth.setDetails(Map.of("entrepriseId", ENTREPRISE_ID));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getAllForCurrentEntrepriseReturnsList() {
        JourFerie jf = JourFerie.builder()
                .id(1L)
                .nom("Nouvel An")
                .date(LocalDate.of(2026, 1, 1))
                .entrepriseId(ENTREPRISE_ID)
                .build();
        when(repository.findAllByEntrepriseId(ENTREPRISE_ID)).thenReturn(List.of(jf));

        List<JourFerie> list = service.getAllForCurrentEntreprise();

        assertThat(list).hasSize(1);
        assertThat(list.get(0).getNom()).isEqualTo("Nouvel An");
    }

    @Test
    void getForRangeQueriesByDate() {
        LocalDate start = LocalDate.of(2026, 1, 1);
        LocalDate end = LocalDate.of(2026, 12, 31);
        JourFerie jf = JourFerie.builder()
                .id(2L)
                .nom("Fête du Travail")
                .date(LocalDate.of(2026, 5, 1))
                .entrepriseId(ENTREPRISE_ID)
                .build();
        when(repository.findByEntrepriseIdAndDateBetween(ENTREPRISE_ID, start, end)).thenReturn(List.of(jf));

        List<JourFerie> list = service.getForRange(start, end);

        assertThat(list).hasSize(1);
        assertThat(list.get(0).getNom()).isEqualTo("Fête du Travail");
    }

    @Test
    void getByIdReturnsEntityWhenFound() {
        JourFerie jf = JourFerie.builder()
                .id(10L)
                .nom("Aid")
                .date(LocalDate.of(2026, 4, 10))
                .entrepriseId(ENTREPRISE_ID)
                .build();
        when(repository.findById(10L)).thenReturn(Optional.of(jf));

        JourFerie result = service.getById(10L);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(10L);
        assertThat(result.getNom()).isEqualTo("Aid");
    }

    @Test
    void getByIdThrowsExceptionWhenNotFound() {
        when(repository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getById(999L))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Jour férié introuvable");
    }

    @Test
    void createSetsEntrepriseIdIfNull() {
        JourFerie input = JourFerie.builder()
                .nom("Fête Nationale")
                .date(LocalDate.of(2026, 3, 20))
                .build();
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        JourFerie created = service.create(input);

        assertThat(created.getEntrepriseId()).isEqualTo(ENTREPRISE_ID);
        assertThat(created.getNom()).isEqualTo("Fête Nationale");
    }

    @Test
    void updateModifiesFieldsAndSaves() {
        JourFerie existing = JourFerie.builder()
                .id(5L)
                .nom("Ancien nom")
                .date(LocalDate.of(2026, 5, 1))
                .entrepriseId(ENTREPRISE_ID)
                .build();
        when(repository.findById(5L)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        JourFerie updateInput = JourFerie.builder()
                .nom("Nouveau nom")
                .date(LocalDate.of(2026, 5, 2))
                .build();

        JourFerie updated = service.update(5L, updateInput);

        assertThat(updated.getNom()).isEqualTo("Nouveau nom");
        assertThat(updated.getDate()).isEqualTo(LocalDate.of(2026, 5, 2));
    }

    @Test
    void deleteDelegatesToRepository() {
        service.delete(7L);

        verify(repository).deleteById(7L);
    }
}
