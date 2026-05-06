package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserManagementResponse {
    private Long id;
    private String name;
    private String email;
    private String role;
    private String status;
    private LookupOptionResponse manager;
    private LookupOptionResponse company;
}
