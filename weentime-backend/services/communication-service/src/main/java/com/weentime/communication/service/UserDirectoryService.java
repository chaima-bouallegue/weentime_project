package com.weentime.communication.service;

import com.weentime.communication.dto.OrganisationUserSummary;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.security.CommunicationUserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserDirectoryService {

    private final OrganisationDirectoryClient organisationDirectoryClient;

    public OrganisationUserSummary getUserSummary(CommunicationUserPrincipal currentUser, Long userId) {
        try {
            OrganisationUserSummary summary = organisationDirectoryClient.getUserSummary(currentUser.authorizationHeader(), userId);
            if (summary == null) {
                throw notFound(userId);
            }
            return summary;
        } catch (CommunicationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw notFound(userId);
        }
    }

    public Map<Long, OrganisationUserSummary> getUserSummaries(CommunicationUserPrincipal currentUser, Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }

        try {
            Map<Long, OrganisationUserSummary> summaries = organisationDirectoryClient
                    .getUserSummaries(currentUser.authorizationHeader(), ids)
                    .stream()
                    .collect(Collectors.toMap(OrganisationUserSummary::id, item -> item, (left, right) -> left, LinkedHashMap::new));

            Set<Long> missing = ids.stream().filter(id -> !summaries.containsKey(id)).collect(Collectors.toSet());
            if (!missing.isEmpty()) {
                throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_USER_NOT_FOUND",
                        "One or more users could not be resolved.", Map.of("missingUserIds", missing));
            }
            return summaries;
        } catch (CommunicationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new CommunicationException(HttpStatus.BAD_GATEWAY, "COMM_USER_DIRECTORY_UNAVAILABLE",
                    "Unable to resolve users from organisation-service.", Map.of());
        }
    }

    private CommunicationException notFound(Long userId) {
        return new CommunicationException(HttpStatus.NOT_FOUND, "COMM_USER_NOT_FOUND",
                "The requested user could not be found.", Map.of("userId", userId));
    }
}
