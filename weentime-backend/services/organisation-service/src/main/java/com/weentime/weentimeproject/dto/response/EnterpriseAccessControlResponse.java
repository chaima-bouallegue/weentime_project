package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EnterpriseAccessControlResponse {
    private Long enterpriseId;
    private String enterpriseName;
    private List<EnterpriseAccessUserResponse> rhUsers;
    private List<EnterpriseAccessUserResponse> managerUsers;
}
