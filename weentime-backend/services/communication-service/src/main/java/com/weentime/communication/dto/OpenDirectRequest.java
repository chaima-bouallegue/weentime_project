package com.weentime.communication.dto;

import jakarta.validation.constraints.NotNull;

public record OpenDirectRequest(
        @NotNull Long userId
) {
}
