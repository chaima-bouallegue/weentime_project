package com.weentime.communication.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record CreateChannelRequest(
        @NotNull String type,
        @NotBlank String name,
        String description,
        String visibility,
        String slug,
        Boolean isPrivate,
        Long equipeId,
        List<Long> memberIds
) {
}
