package com.weentime.weentimeproject.dto.response;

import java.util.List;

public record CommunicationSyncTeamResponse(
        Long id,
        String nom,
        String description,
        Boolean active,
        Long entrepriseId,
        Long managerId,
        List<UserSummaryResponse> members
) {
}
