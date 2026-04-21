package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.TypeAutorisationDTO;
import java.util.List;

public interface TypeAutorisationService {
    TypeAutorisationDTO create(TypeAutorisationDTO dto);
    TypeAutorisationDTO getById(Long id);
    List<TypeAutorisationDTO> getAll();
    TypeAutorisationDTO update(Long id, TypeAutorisationDTO dto);
    void delete(Long id);
}
