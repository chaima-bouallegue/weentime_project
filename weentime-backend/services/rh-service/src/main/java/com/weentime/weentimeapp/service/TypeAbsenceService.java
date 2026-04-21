package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.TypeAbsenceDTO;
import java.util.List;

public interface TypeAbsenceService {
    TypeAbsenceDTO create(TypeAbsenceDTO dto);
    TypeAbsenceDTO getById(Long id);
    List<TypeAbsenceDTO> getAll();
    TypeAbsenceDTO update(Long id, TypeAbsenceDTO dto);
    void delete(Long id);
}
