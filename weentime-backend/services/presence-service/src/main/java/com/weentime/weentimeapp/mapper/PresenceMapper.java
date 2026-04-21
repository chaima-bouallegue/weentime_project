package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.PresenceDTO;
import com.weentime.weentimeapp.dto.WorkScheduleDto;
import com.weentime.weentimeapp.entity.Presence;
import com.weentime.weentimeapp.entity.WorkSchedule;
import org.mapstruct.Mapper;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.time.DayOfWeek;

@Mapper(componentModel = "spring")
public interface PresenceMapper {

    PresenceDTO toDto(Presence entity);

    List<PresenceDTO> toDtoList(List<Presence> entities);

    WorkScheduleDto toWorkScheduleDto(WorkSchedule entity);

    default Set<String> mapJours(Set<DayOfWeek> jours) {
        if (jours == null) return null;
        return jours.stream().map(Enum::name).collect(Collectors.toSet());
    }
}
