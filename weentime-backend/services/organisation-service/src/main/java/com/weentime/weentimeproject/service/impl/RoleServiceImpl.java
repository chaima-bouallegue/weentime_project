package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.RoleRequest;
import com.weentime.weentimeproject.dto.response.RoleResponse;
import com.weentime.weentimeproject.entity.Role;
import com.weentime.weentimeproject.mapper.RoleMapper;
import com.weentime.weentimeproject.repository.RoleRepository;
import com.weentime.weentimeproject.service.RoleService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class RoleServiceImpl implements RoleService {

    private final RoleRepository roleRepository;
    private final RoleMapper roleMapper;

    @Override
    public RoleResponse createRole(RoleRequest request) {
        if (roleRepository.findByNom(request.getNom()).isPresent()) {
            throw new RuntimeException("Le role existe deja");
        }
        Role role = roleMapper.toEntity(request);
        if (role.getPermissions() == null) {
            role.setPermissions(new LinkedHashSet<>());
        }
        return roleMapper.toResponse(roleRepository.save(role));
    }

    @Override
    @Transactional(readOnly = true)
    public RoleResponse getRoleById(Long id) {
        Role role = roleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Role non trouve"));
        return roleMapper.toResponse(role);
    }

    @Override
    @Transactional(readOnly = true)
    public List<RoleResponse> getAllRoles() {
        return roleRepository.findAll().stream()
                .map(roleMapper::toResponse)
                .collect(Collectors.toList());
    }

    @Override
    public RoleResponse updateRole(Long id, RoleRequest request) {
        Role role = roleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Role non trouve"));
        roleMapper.updateEntityFromRequest(request, role);
        if (role.getPermissions() == null) {
            role.setPermissions(new LinkedHashSet<>());
        }
        return roleMapper.toResponse(roleRepository.save(role));
    }

    @Override
    public void deleteRole(Long id) {
        roleRepository.deleteById(id);
    }
}
