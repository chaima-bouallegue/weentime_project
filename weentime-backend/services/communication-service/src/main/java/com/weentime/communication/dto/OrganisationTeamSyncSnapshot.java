package com.weentime.communication.dto;

import java.util.List;

public record OrganisationTeamSyncSnapshot(
        Long id,
        String nom,
        String description,
        Boolean active,
        Long entrepriseId,
        Long managerId,
        List<OrganisationUserSummary> members
) {
}
