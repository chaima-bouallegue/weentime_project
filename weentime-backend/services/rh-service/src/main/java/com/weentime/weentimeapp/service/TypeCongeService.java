package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.TypeCongeDTO;
import java.util.List;

public interface TypeCongeService {
    TypeCongeDTO create(TypeCongeDTO dto);
    TypeCongeDTO getById(Long id);
    List<TypeCongeDTO> getAll();
    TypeCongeDTO update(Long id, TypeCongeDTO dto);
    void delete(Long id);
}
