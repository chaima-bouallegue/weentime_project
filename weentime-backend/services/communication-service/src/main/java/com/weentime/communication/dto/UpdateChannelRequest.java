package com.weentime.communication.dto;

import jakarta.validation.constraints.Size;

public record UpdateChannelRequest(
        @Size(min = 1, max = 180) String name,
        @Size(max = 2000) String description
) {
}
