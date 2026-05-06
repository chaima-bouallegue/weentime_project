package com.weentime.communication.dto;

import lombok.Builder;

import java.util.List;

@Builder
public record ProvisioningSyncResponse(
        Long entrepriseId,
        int channelsCreated,
        int channelsUpdated,
        int channelsArchived,
        int membersAdded,
        int membersRemoved,
        List<String> warnings
) {
}
