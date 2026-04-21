package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationDispatchRequest {
    private String title;
    private String message;
    private String type;
    private String actionUrl;
    private Long entrepriseId;
    private Map<String, Object> metadata;
}
