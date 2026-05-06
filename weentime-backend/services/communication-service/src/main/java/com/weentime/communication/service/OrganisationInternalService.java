package com.weentime.communication.service;

import com.weentime.communication.dto.InternalNotificationDispatchRequest;
import com.weentime.communication.dto.OrganisationEnterpriseSyncSnapshot;
import com.weentime.communication.exception.CommunicationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class OrganisationInternalService {

    private final OrganisationInternalOperationsClient client;
    private final String internalApiKey;

    public OrganisationInternalService(
            OrganisationInternalOperationsClient client,
            @Value("${integration.organisation-service.internal-api-key}") String internalApiKey
    ) {
        this.client = client;
        this.internalApiKey = internalApiKey;
    }

    public OrganisationEnterpriseSyncSnapshot getEnterpriseSyncSnapshot(Long entrepriseId) {
        try {
            return client.getEnterpriseSyncSnapshot(internalApiKey, entrepriseId);
        } catch (Exception exception) {
            throw new CommunicationException(HttpStatus.BAD_GATEWAY, "COMM_SYNC_SOURCE_UNAVAILABLE",
                    "Unable to fetch organisation data for communication sync.", Map.of("entrepriseId", entrepriseId));
        }
    }

    public void sendNotification(Long userId, InternalNotificationDispatchRequest request) {
        try {
            client.sendNotification(internalApiKey, userId, request);
        } catch (Exception exception) {
            throw new CommunicationException(HttpStatus.BAD_GATEWAY, "COMM_NOTIFICATION_DISPATCH_FAILED",
                    "Unable to dispatch communication notification.", Map.of("recipientId", userId));
        }
    }
}
