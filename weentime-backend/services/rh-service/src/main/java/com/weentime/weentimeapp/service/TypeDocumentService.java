package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.TypeDocumentDTO;
import java.util.List;

public interface TypeDocumentService {
    TypeDocumentDTO create(TypeDocumentDTO dto);
    TypeDocumentDTO getById(Long id);
    List<TypeDocumentDTO> getAll();
    TypeDocumentDTO update(Long id, TypeDocumentDTO dto);
    void delete(Long id);
}
