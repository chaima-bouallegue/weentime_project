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
    private Integer overtimeThresholdMinutes;
    private OvertimeProperties overtime = new OvertimeProperties();
    private boolean gpsRequired = false;
    private boolean publicHolidayExceptionalWorkAllowed = false;
    private LocationResolverProperties location = new LocationResolverProperties();
    private GeofenceProperties geofence = new GeofenceProperties();

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
    public static class OvertimeProperties {
        private Integer thresholdMinutes;
    }

    public Integer resolveOvertimeThresholdMinutes() {
        if (overtime != null && overtime.getThresholdMinutes() != null) {
            return overtime.getThresholdMinutes();
        }
        return overtimeThresholdMinutes != null ? overtimeThresholdMinutes : 30;
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

    /**
     * Configuration du géofencing pour le pointage.
     * <p>
     * Le géofencing ne bloque JAMAIS le pointage. Il enregistre un statut
     * ({@code IN_ZONE} / {@code OUT_OF_ZONE}) et la distance calculée.
     */
    @Data
    public static class GeofenceProperties {
        /** Active ou désactive le géofencing. */
        private boolean enabled = false;
        /** Latitude du lieu de travail. */
        private double workplaceLatitude = 36.8065;
        /** Longitude du lieu de travail. */
        private double workplaceLongitude = 10.1815;
        /** Rayon autorisé autour du lieu de travail, en mètres. */
        private double defaultRadiusMeters = 200.0;
        /** Seuil de précision GPS au-delà duquel la position est considérée peu fiable (en mètres). */
        private double maxAccuracyMeters = 100.0;
    }
}
