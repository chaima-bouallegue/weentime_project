package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.EntrepriseResponse;
import com.weentime.weentimeapp.entity.Document;
import com.weentime.weentimeapp.entity.TypeDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DocumentPdfGeneratorTest {

    @Mock
    private EntrepriseCacheService entrepriseCache;

    private DocumentPdfGenerator generator;

    @BeforeEach
    void setUp() {
        generator = new DocumentPdfGenerator(entrepriseCache);
    }

    @Test
    void buildDisplayFilenameSanitizesAccentsAndLeadingTrailingUnderscores() {
        Document document = new Document();
        document.setId(42L);
        document.setEntrepriseId(10L);
        document.setMoisConcerne("03/2026");

        TypeDocument type = new TypeDocument();
        type.setLibelle("Attestation d'emploi");
        document.setTypeDocument(type);

        EntrepriseResponse entreprise = new EntrepriseResponse();
        entreprise.setId(10L);
        entreprise.setNom("Acme Corp & Co.");
        when(entrepriseCache.getEntrepriseById(10L)).thenReturn(entreprise);

        String filename = generator.buildDisplayFilename(document);

        assertThat(filename)
                .endsWith(".pdf")
                .doesNotStartWith("_")
                .doesNotContain("__")
                .doesNotContain(" ")
                .doesNotContain("'")
                .isEqualTo("Acme_Corp_Co_Attestation_d_emploi_42_03_2026.pdf");
    }

    @Test
    void buildDisplayFilenameFallbackWhenEntrepriseIsNull() {
        Document document = new Document();
        document.setId(1L);
        document.setEntrepriseId(null);

        String filename = generator.buildDisplayFilename(document);

        assertThat(filename)
                .endsWith(".pdf")
                .startsWith("Entreprise_Document_1");
    }
}
