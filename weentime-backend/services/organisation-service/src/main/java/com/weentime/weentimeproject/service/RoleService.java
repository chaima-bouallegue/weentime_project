package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.request.RoleRequest;
import com.weentime.weentimeproject.dto.response.RoleResponse;

import java.util.List;

public interface RoleService {
    RoleResponse createRole(RoleRequest request);
    RoleResponse getRoleById(Long id);
    List<RoleResponse> getAllRoles();
    RoleResponse updateRole(Long id, RoleRequest request);
    void deleteRole(Long id);
}
