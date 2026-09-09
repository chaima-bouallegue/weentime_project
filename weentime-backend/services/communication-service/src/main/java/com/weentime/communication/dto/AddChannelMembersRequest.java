package com.weentime.communication.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record AddChannelMembersRequest(
        @NotEmpty List<Long> userIds
) {
}
