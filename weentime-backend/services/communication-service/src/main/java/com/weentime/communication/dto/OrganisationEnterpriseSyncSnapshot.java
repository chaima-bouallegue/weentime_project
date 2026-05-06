package com.weentime.communication.dto;

import java.util.List;

public record OrganisationEnterpriseSyncSnapshot(
        Long entrepriseId,
        String entrepriseNom,
        List<OrganisationUserSummary> activeUsers,
        List<OrganisationTeamSyncSnapshot> teams
) {
}
