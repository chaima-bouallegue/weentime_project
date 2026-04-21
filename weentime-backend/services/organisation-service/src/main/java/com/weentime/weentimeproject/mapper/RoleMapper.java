package com.weentime.weentimeproject.mapper;

import com.weentime.weentimeproject.dto.request.RoleRequest;
import com.weentime.weentimeproject.dto.response.RoleResponse;
import com.weentime.weentimeproject.entity.Role;
import org.mapstruct.BeanMapping;
import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;

@Mapper(componentModel = "spring")
public interface RoleMapper {
    Role toEntity(RoleRequest request);
    RoleResponse toResponse(Role role);
    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)

    void updateEntityFromRequest(RoleRequest request, @MappingTarget Role role);
}
