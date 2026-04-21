package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.NotificationDTO;
import com.weentime.weentimeapp.entity.Notification;
import org.mapstruct.Mapper;

import java.util.List;

@Mapper(componentModel = "spring")
public interface NotificationMapper {
    NotificationDTO toDto(Notification entity);
    List<NotificationDTO> toDtoList(List<Notification> entities);
}
