package com.weentime.communication.dto;

import lombok.Builder;

import java.util.List;

@Builder
public record CommunicationBootstrapResponse(
        Long entrepriseId,
        int createdChannels,
        int membershipsCreated,
        int repairedUsers,
        List<String> warnings
) {
}
