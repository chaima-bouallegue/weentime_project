package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.request.EnterpriseAccessControlRequest;
import com.weentime.weentimeproject.dto.response.EnterpriseAccessControlResponse;

public interface EnterpriseAccessControlService {
    EnterpriseAccessControlResponse getEnterpriseAccessControl(Long enterpriseId);

    EnterpriseAccessControlResponse updateEnterpriseAccessControl(
            Long enterpriseId,
            EnterpriseAccessControlRequest request
    );
}
