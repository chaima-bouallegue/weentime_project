package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.TypeDocumentDTO;
import com.weentime.weentimeapp.entity.TypeDocument;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

import java.util.List;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface TypeDocumentMapper {
    TypeDocumentDTO toDto(TypeDocument entity);
    TypeDocument toEntity(TypeDocumentDTO dto);
    List<TypeDocumentDTO> toDtoList(List<TypeDocument> entities);
    List<TypeDocument> toEntityList(List<TypeDocumentDTO> dtos);
}
