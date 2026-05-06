package com.weentime.communication.dto;

import java.util.UUID;

public record MarkChannelReadRequest(
        UUID messageId
) {
}
