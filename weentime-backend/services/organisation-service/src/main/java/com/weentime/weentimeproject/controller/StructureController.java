package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.response.StructureDepartmentResponse;
import com.weentime.weentimeproject.dto.response.StructureEmployeeResponse;
import com.weentime.weentimeproject.dto.response.StructureTeamResponse;
import com.weentime.weentimeproject.service.StructureService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/structure")
@RequiredArgsConstructor
public class StructureController {

    private final StructureService structureService;

    @GetMapping("/departments")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<List<StructureDepartmentResponse>> getDepartments() {
        return ResponseEntity.ok(structureService.getDepartments());
    }

    @GetMapping("/teams")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<List<StructureTeamResponse>> getTeams() {
        return ResponseEntity.ok(structureService.getTeams());
    }

    @GetMapping("/managers")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<List<StructureEmployeeResponse>> getManagers() {
        return ResponseEntity.ok(structureService.getManagers());
    }

    @GetMapping("/employees")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<List<StructureEmployeeResponse>> getEmployees() {
        return ResponseEntity.ok(structureService.getEmployees());
    }
}
