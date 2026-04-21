package com.weentime.weentimeapp.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;

@Data
@Configuration
@ConfigurationProperties(prefix = "presence")
public class PresenceProperties {

    private DefaultScheduleProperties defaults = new DefaultScheduleProperties();
    private BigDecimal halfDayThresholdHours = BigDecimal.valueOf(4.0d);
    private String timezone = "UTC";

    @Data
    public static class DefaultScheduleProperties {
        private LocalTime startTime = LocalTime.of(9, 0);
        private LocalTime endTime = LocalTime.of(18, 0);
        private Integer toleranceMinutes = 10;
        private List<DayOfWeek> workingDays = List.of(
                DayOfWeek.MONDAY,
                DayOfWeek.TUESDAY,
                DayOfWeek.WEDNESDAY,
                DayOfWeek.THURSDAY,
                DayOfWeek.FRIDAY
        );
    }
}
