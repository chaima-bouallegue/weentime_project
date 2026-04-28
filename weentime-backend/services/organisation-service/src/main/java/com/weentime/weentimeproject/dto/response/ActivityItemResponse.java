package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ActivityItemResponse {
    private Long id;
    private String action;
    private String type;
    private String description;
    private LocalDateTime timestamp;
    private LocalDateTime date;
    private String ipAddress;
    private String icon;
}
