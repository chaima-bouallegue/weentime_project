package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EnterpriseAccessUserResponse {
    private Long id;
    private String fullName;
    private String email;
    private String role;
    private boolean allowed;
}
