package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.request.DepartementRequest;
import com.weentime.weentimeproject.dto.response.DepartementResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface DepartementService {
    DepartementResponse createDepartement(DepartementRequest request);
    DepartementResponse getDepartementById(Long id);
    Page<DepartementResponse> getAllDepartements(Pageable pageable);
    DepartementResponse updateDepartement(Long id, DepartementRequest request);
    void deleteDepartement(Long id);
}