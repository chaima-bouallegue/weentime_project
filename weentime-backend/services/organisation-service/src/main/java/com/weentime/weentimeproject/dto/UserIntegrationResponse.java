package com.weentime.weentimeproject.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class UserIntegrationResponse {
    private Long id;
    private Long managerId;
    private Long equipeId;
    private Long entrepriseId;
    private String fullName;
    private List<String> roles;
}
