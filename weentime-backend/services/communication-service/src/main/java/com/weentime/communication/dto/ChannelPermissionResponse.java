package com.weentime.communication.dto;

import lombok.Builder;

@Builder
public record ChannelPermissionResponse(
        boolean canRead,
        boolean canWrite,
        boolean canManage,
        boolean canUpload
) {
}
