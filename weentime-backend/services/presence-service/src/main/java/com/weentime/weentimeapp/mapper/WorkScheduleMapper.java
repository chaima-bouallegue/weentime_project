package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.WorkScheduleDto;
import com.weentime.weentimeapp.entity.WorkSchedule;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface WorkScheduleMapper {

    WorkScheduleDto toDto(WorkSchedule entity);
}
