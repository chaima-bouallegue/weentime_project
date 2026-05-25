package com.weentime.weentimeproject.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EnterpriseAccessControlRequest {
    private List<Long> rhUserIds;
    private List<Long> managerUserIds;
}
