package com.weentime.communication.service;

import com.weentime.communication.dto.OrganisationUserSummary;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.security.CommunicationUserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UserDirectoryServiceTest {

    private FakeOrganisationDirectoryClient fakeClient;
    private UserDirectoryService userDirectoryService;
    private final String internalApiKey = "test-internal-api-key";

    private final CommunicationUserPrincipal testPrincipal = new CommunicationUserPrincipal(
            1L, "jean.dupont@test.com", 10L, List.of("ROLE_USER"), "fake-token"
    );

    @BeforeEach
    void setUp() {
        fakeClient = new FakeOrganisationDirectoryClient();
        userDirectoryService = new UserDirectoryService(fakeClient, internalApiKey);
    }

    private OrganisationUserSummary sampleUser(Long id, String prenom, String nom, String email) {
        return new OrganisationUserSummary(
                id, nom, prenom, prenom + " " + nom, email,
                "DEV", null, null, null, null, null, null, null, 10L, "Acme", List.of("ROLE_USER"), true
        );
    }

    @Test
    void getUserSummary_passesInternalApiKey() {
        OrganisationUserSummary summary = sampleUser(1L, "Jean", "Dupont", "jean@test.com");
        fakeClient.summaryToReturn = summary;

        OrganisationUserSummary result = userDirectoryService.getUserSummary(testPrincipal, 1L);

        assertThat(result).isNotNull();
        assertThat(result.id()).isEqualTo(1L);
        assertThat(fakeClient.capturedKey.get()).isEqualTo(internalApiKey);
    }

    @Test
    void getUserSummaries_passesInternalApiKey() {
        OrganisationUserSummary summary1 = sampleUser(1L, "Jean", "Dupont", "jean@test.com");
        OrganisationUserSummary summary2 = sampleUser(2L, "Marie", "Curie", "marie@test.com");
        fakeClient.summariesToReturn = List.of(summary1, summary2);

        Map<Long, OrganisationUserSummary> result = userDirectoryService.getUserSummaries(testPrincipal, List.of(1L, 2L));

        assertThat(result).hasSize(2);
        assertThat(result.get(1L)).isEqualTo(summary1);
        assertThat(result.get(2L)).isEqualTo(summary2);
        assertThat(fakeClient.capturedKey.get()).isEqualTo(internalApiKey);
    }

    @Test
    void getUserSummaries_missingUser_throwsBadRequest() {
        OrganisationUserSummary summary1 = sampleUser(1L, "Jean", "Dupont", "jean@test.com");
        fakeClient.summariesToReturn = List.of(summary1);

        assertThatThrownBy(() -> userDirectoryService.getUserSummaries(testPrincipal, List.of(1L, 2L)))
                .isInstanceOf(CommunicationException.class)
                .satisfies(ex -> assertThat(((CommunicationException) ex).getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    private static class FakeOrganisationDirectoryClient implements OrganisationDirectoryClient {
        final AtomicReference<String> capturedKey = new AtomicReference<>();
        OrganisationUserSummary summaryToReturn;
        List<OrganisationUserSummary> summariesToReturn = List.of();

        @Override
        public OrganisationUserSummary getUserSummary(String internalApiKey, Long id) {
            this.capturedKey.set(internalApiKey);
            return summaryToReturn;
        }

        @Override
        public List<OrganisationUserSummary> getUserSummaries(String internalApiKey, Collection<Long> ids) {
            this.capturedKey.set(internalApiKey);
            return summariesToReturn;
        }
    }
}
