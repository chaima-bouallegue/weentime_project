package com.weentime.weentimeproject;

import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.show-sql=true",
        "spring.jpa.properties.hibernate.format_sql=true",
        "spring.flyway.enabled=false"
})
class EntrepriseMappingTest {

    @Autowired
    private EntrepriseRepository entrepriseRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void shouldPersistEntrepriseWithoutStatutColumn() {
        Entreprise entreprise = Entreprise.builder()
                .nom("TestCo")
                .siret("12345678901234")
                .adresse("1 rue de Test")
                .email("contact@testco.com")
                .telephone("0102030405")
                .siteWeb("https://testco.com")
                .codeInvitation("INV-1234")
                .secteur("IT")
                .estActive(true)
                .build();

        Entreprise saved = entrepriseRepository.saveAndFlush(entreprise);
        entityManager.clear();

        Entreprise reloaded = entrepriseRepository.findById(saved.getId())
                .orElseThrow(() -> new IllegalStateException("Entreprise not found after save"));

        assertThat(reloaded.getId()).isNotNull();
        assertThat(reloaded.getNom()).isEqualTo("TestCo");
        assertThat(reloaded.getEstActive()).isTrue();
        assertThat(reloaded.getSiteWeb()).isEqualTo("https://testco.com");
        assertThat(reloaded.getCodeInvitation()).isEqualTo("INV-1234");
    }
}
