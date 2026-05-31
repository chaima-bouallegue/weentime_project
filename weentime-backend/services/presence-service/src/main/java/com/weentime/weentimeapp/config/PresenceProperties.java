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
    private Integer autoCloseGraceMinutes = 60;
    private Integer overtimeThresholdMinutes = 15;
    private boolean gpsRequired = false;
    private boolean publicHolidayExceptionalWorkAllowed = false;
    private LocationResolverProperties location = new LocationResolverProperties();

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

    @Data
    public static class LocationResolverProperties {
        private boolean resolverEnabled = true;
        private String nominatimUrl = "https://nominatim.openstreetmap.org/reverse";
        private Integer timeoutMillis = 3000;
        private Integer cacheCoordinateScale = 5;
        private String acceptLanguage = "fr";
        private String userAgent = "WeenTime/1.0";
    }
}
