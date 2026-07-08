package com.weentime.weentimeapp;

import com.weentime.weentimeapp.entity.Conge;
import com.weentime.weentimeapp.entity.Demande;
import com.weentime.weentimeapp.entity.SoldeConge;
import com.weentime.weentimeapp.entity.TypeAutorisation;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.entity.TypeDocument;
import com.weentime.weentimeapp.repository.CongeRepository;
import com.weentime.weentimeapp.repository.DemandeRepository;
import com.weentime.weentimeapp.repository.SoldeCongeRepository;
import com.weentime.weentimeapp.repository.TypeAutorisationRepository;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import com.weentime.weentimeapp.repository.TypeDocumentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class SharedTableSchemaCompatibilityDataJpaTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private TypeCongeRepository typeCongeRepository;

    @Autowired
    private TypeDocumentRepository typeDocumentRepository;

    @Autowired
    private TypeAutorisationRepository typeAutorisationRepository;

    @Autowired
    private SoldeCongeRepository soldeCongeRepository;

    @Autowired
    private CongeRepository congeRepository;

    @Autowired
    private DemandeRepository demandeRepository;

    @Test
    void rhReferenceEntitiesCarryEntrepriseScope() {
        assertThat(fieldNames(TypeConge.class)).contains("entrepriseId");
        assertThat(fieldNames(TypeDocument.class)).contains("entrepriseId");
        assertThat(fieldNames(TypeAutorisation.class)).contains("entrepriseId");
        assertThat(fieldNames(SoldeConge.class)).contains("entrepriseId");
    }

    @Test
    void tenantRepositoriesExposeEntrepriseScopedQueries() {
        assertThat(methodNames(TypeCongeRepository.class))
                .anyMatch(this::containsEnterpriseScope);
        assertThat(methodNames(SoldeCongeRepository.class))
                .contains("findByUtilisateurIdAndAnnee");
    }

    @Test
    void generatedSchemaKeepsRhReferenceAndDemandesTablesScoped() {
        assertThat(hasColumn("type_conges", "entreprise_id")).isTrue();
        assertThat(hasColumn("type_documents", "entreprise_id")).isTrue();
        assertThat(hasColumn("type_autorisations", "entreprise_id")).isTrue();
        assertThat(hasColumn("solde_conges", "entreprise_id")).isTrue();

        assertThat(hasColumn("demandes", "entreprise_id")).isTrue();
    }

    @Test
    void sharedRepositoriesPersistAndLoadRowsWithoutEntrepriseColumns() {
        TypeConge typeConge = typeCongeRepository.saveAndFlush(TypeConge.builder()
                .libelle("Maladie")
                .nombreJoursMax(30)
                .decompteJours(true)
                .requireJustificatif(true)
                .build());

        TypeDocument typeDocument = typeDocumentRepository.saveAndFlush(TypeDocument.builder()
                .libelle("Attestation de travail")
                .code("ATTESTATION_TRAVAIL")
                .requireSignature(false)
                .enableTemplate(true)
                .build());

        TypeAutorisation typeAutorisation = typeAutorisationRepository.saveAndFlush(TypeAutorisation.builder()
                .libelle("Sortie")
                .maxHeuresMois(8)
                .requireJustificatif(false)
                .build());

        SoldeConge solde = soldeCongeRepository.saveAndFlush(SoldeConge.builder()
                .utilisateurId(22L)
                .typeCongeId(typeConge.getId())
                .annee(2026)
                .joursAcquis(30.0)
                .joursUtilises(2.0)
                .joursRestants(28.0)
                .joursEnAttente(1.0)
                .build());

        assertThat(typeCongeRepository.findAll())
                .extracting(TypeConge::getLibelle)
                .containsExactly("Maladie");
        assertThat(typeDocumentRepository.findByCode("ATTESTATION_TRAVAIL"))
                .get()
                .extracting(TypeDocument::getLibelle)
                .isEqualTo("Attestation de travail");
        assertThat(typeAutorisationRepository.findByLibelle("Sortie"))
                .get()
                .extracting(TypeAutorisation::getMaxHeuresMois)
                .isEqualTo(8);
        assertThat(soldeCongeRepository.findByUtilisateurIdAndTypeCongeIdAndAnnee(22L, typeConge.getId(), 2026))
                .contains(solde);
        assertThat(soldeCongeRepository.findByUtilisateurIdAndAnnee(22L, 2026))
                .containsExactly(solde);
    }

    @Test
    void typeCongeTenantListUsesSameEntrepriseScopeAsDuplicateValidation() {
        typeCongeRepository.saveAndFlush(TypeConge.builder()
                .entrepriseId(13L)
                .libelle("Maladie")
                .build());
        typeCongeRepository.saveAndFlush(TypeConge.builder()
                .entrepriseId(99L)
                .libelle("Congé maternité")
                .build());
        typeCongeRepository.saveAndFlush(TypeConge.builder()
                .libelle("Congé maternité")
                .build());

        assertThat(typeCongeRepository.findAllByEntrepriseId(13L))
                .extracting(TypeConge::getLibelle)
                .containsExactly("Congé maternité", "Maladie");
    }

    @Test
    void demandeRepositoryKeepsBusinessEntitiesEnterpriseScopedWhileSharingLookupRows() {
        TypeConge sharedType = typeCongeRepository.saveAndFlush(TypeConge.builder()
                .libelle("Conge annuel")
                .nombreJoursMax(25)
                .decompteJours(true)
                .requireJustificatif(false)
                .build());

        congeRepository.saveAndFlush(Conge.builder()
                .utilisateurId(7L)
                .entrepriseId(3L)
                .dateDebut(LocalDate.of(2026, 5, 1))
                .dateFin(LocalDate.of(2026, 5, 2))
                .nombreJours(2)
                .typeCongeId(sharedType.getId())
                .build());

        congeRepository.saveAndFlush(Conge.builder()
                .utilisateurId(22L)
                .entrepriseId(13L)
                .dateDebut(LocalDate.of(2026, 5, 3))
                .dateFin(LocalDate.of(2026, 5, 4))
                .nombreJours(2)
                .typeCongeId(sharedType.getId())
                .build());

        List<Demande> enterprise3Demandes = demandeRepository.findByEntrepriseIdOrderByDateCreationDesc(3L);
        List<Demande> enterprise13Demandes = demandeRepository.findByEntrepriseIdOrderByDateCreationDesc(13L);

        assertThat(enterprise3Demandes)
                .hasSize(1)
                .extracting(Demande::getUtilisateurId)
                .containsExactly(7L);
        assertThat(enterprise13Demandes)
                .hasSize(1)
                .extracting(Demande::getUtilisateurId)
                .containsExactly(22L);
        assertThat(enterprise3Demandes)
                .extracting(Demande::getEntrepriseId)
                .containsOnly(3L);
        assertThat(enterprise13Demandes)
                .extracting(Demande::getEntrepriseId)
                .containsOnly(13L);
    }

    private List<String> fieldNames(Class<?> type) {
        return Arrays.stream(type.getDeclaredFields())
                .map(field -> field.getName())
                .collect(Collectors.toList());
    }

    private List<String> methodNames(Class<?> type) {
        return Arrays.stream(type.getDeclaredMethods())
                .map(method -> method.getName())
                .collect(Collectors.toList());
    }

    private boolean containsEnterpriseScope(String methodName) {
        String normalized = methodName.toLowerCase(Locale.ROOT);
        return normalized.contains("entreprise") || normalized.contains("enterprise");
    }

    private boolean hasColumn(String tableName, String columnName) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.columns where lower(table_name) = ? and lower(column_name) = ?",
                Integer.class,
                tableName.toLowerCase(Locale.ROOT),
                columnName.toLowerCase(Locale.ROOT)
        );
        return count != null && count > 0;
    }
}
