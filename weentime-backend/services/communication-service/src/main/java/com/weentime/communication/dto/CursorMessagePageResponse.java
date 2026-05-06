package com.weentime.communication.dto;

import lombok.Builder;

import java.util.List;

@Builder
public record CursorMessagePageResponse(
        List<MessageResponse> items,
        String nextCursor,
        boolean hasMore
) {
}
