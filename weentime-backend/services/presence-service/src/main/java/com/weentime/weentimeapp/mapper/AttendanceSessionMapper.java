package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.AttendanceSessionDTO;
import com.weentime.weentimeapp.dto.WorkScheduleDto;
import com.weentime.weentimeapp.entity.AttendanceSession;
import com.weentime.weentimeapp.entity.WorkSchedule;
import org.mapstruct.Mapper;

import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Mapper(componentModel = "spring")
public interface AttendanceSessionMapper {

    AttendanceSessionDTO toDto(AttendanceSession entity);

    List<AttendanceSessionDTO> toDtoList(List<AttendanceSession> entities);

    WorkScheduleDto toWorkScheduleDto(WorkSchedule entity);

    default Set<String> mapJours(Set<DayOfWeek> jours) {
        if (jours == null) {
            return Set.of();
        }
        return jours.stream().map(Enum::name).collect(Collectors.toSet());
    }
}
