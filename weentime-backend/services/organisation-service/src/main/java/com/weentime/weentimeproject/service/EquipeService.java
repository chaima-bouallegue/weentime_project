package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.request.EquipeRequest;
import com.weentime.weentimeproject.dto.response.EquipeResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface EquipeService {
    EquipeResponse createEquipe(EquipeRequest request);
    EquipeResponse getEquipeById(Long id);
    Page<EquipeResponse> getAllEquipes(Pageable pageable);
    EquipeResponse updateEquipe(Long id, EquipeRequest request);
    void deleteEquipe(Long id);
    Page<?> getEquipeMembers(Long id, Pageable pageable);
    java.util.List<EquipeResponse> getEquipesByResponsable(Long responsableId);
}