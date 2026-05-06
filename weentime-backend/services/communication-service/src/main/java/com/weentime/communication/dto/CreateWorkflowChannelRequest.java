package com.weentime.communication.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record CreateWorkflowChannelRequest(
        @NotBlank String demandeId,
        @NotBlank String name,
        String description,
        String workflowType,
        @NotEmpty List<Long> participantIds
) {
}
