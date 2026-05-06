package com.weentime.weentimeproject.dto.response;

import java.util.List;

public record CommunicationSyncEnterpriseResponse(
        Long entrepriseId,
        String entrepriseNom,
        List<UserSummaryResponse> activeUsers,
        List<CommunicationSyncTeamResponse> teams
) {
}
