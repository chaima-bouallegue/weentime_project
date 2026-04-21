package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.response.StructureDepartmentResponse;
import com.weentime.weentimeproject.dto.response.StructureEmployeeResponse;
import com.weentime.weentimeproject.dto.response.StructureTeamResponse;

import java.util.List;

public interface StructureService {
    List<StructureDepartmentResponse> getDepartments();
    List<StructureTeamResponse> getTeams();
    List<StructureEmployeeResponse> getManagers();
    List<StructureEmployeeResponse> getEmployees();
}
