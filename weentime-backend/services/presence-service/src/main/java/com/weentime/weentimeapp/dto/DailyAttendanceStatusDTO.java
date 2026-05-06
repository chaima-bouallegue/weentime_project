package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DailyAttendanceStatusDTO {
    private LocalDate date;
    private AttendanceDayStatus status;
    private Long workedSeconds;
    private Boolean workingDay;
}
