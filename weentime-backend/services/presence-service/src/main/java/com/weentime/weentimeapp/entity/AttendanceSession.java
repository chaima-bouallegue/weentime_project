package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import com.weentime.weentimeapp.enums.AttendanceSessionStatus;
import com.weentime.weentimeapp.enums.PresenceSource;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "attendance_sessions",
        indexes = {
                @Index(name = "idx_attendance_session_user_date", columnList = "utilisateur_id,attendance_date"),
                @Index(name = "idx_attendance_session_status", columnList = "session_status"),
                @Index(name = "idx_attendance_session_checkin", columnList = "check_in_time")
        }
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AttendanceSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "utilisateur_id", nullable = false)
    private Long utilisateurId;

    @Column(name = "entreprise_id")
    private Long entrepriseId;

    @Column(name = "schedule_id")
    private Long scheduleId;

    @Column(name = "attendance_date", nullable = false)
    private LocalDate date;

    @Column(name = "check_in_time", nullable = false)
    private LocalDateTime checkInTime;

    @Column(name = "check_out_time")
    private LocalDateTime checkOutTime;

    @Column(name = "duration_seconds", nullable = false)
    private Long duration;

    @Enumerated(EnumType.STRING)
    @Column(name = "session_status", nullable = false, length = 16)
    private AttendanceSessionStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private PresenceSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "check_in_source", length = 16)
    private PresenceSource checkInSource;

    @Enumerated(EnumType.STRING)
    @Column(name = "check_out_source", length = 16)
    private PresenceSource checkOutSource;

    @Column(length = 128)
    private String localisation;

    @Column(name = "check_in_latitude")
    private Double checkInLatitude;

    @Column(name = "check_in_longitude")
    private Double checkInLongitude;

    @Column(name = "check_in_accuracy")
    private Double checkInAccuracy;

    @Column(name = "check_in_address", length = 255)
    private String checkInAddress;

    @Column(name = "check_in_city", length = 128)
    private String checkInCity;

    @Column(name = "check_in_region", length = 128)
    private String checkInRegion;

    @Column(name = "check_in_country", length = 128)
    private String checkInCountry;

    @Column(name = "check_out_latitude")
    private Double checkOutLatitude;

    @Column(name = "check_out_longitude")
    private Double checkOutLongitude;

    @Column(name = "check_out_accuracy")
    private Double checkOutAccuracy;

    @Column(name = "check_out_address", length = 255)
    private String checkOutAddress;

    @Column(name = "check_out_city", length = 128)
    private String checkOutCity;

    @Column(name = "check_out_region", length = 128)
    private String checkOutRegion;

    @Column(name = "check_out_country", length = 128)
    private String checkOutCountry;

    @Column(name = "late_arrival", nullable = false)
    private Boolean lateArrival;

    @Enumerated(EnumType.STRING)
    @Column(name = "daily_status", nullable = false, length = 16)
    private AttendanceDayStatus dailyStatus;

    @Column(name = "worked_minutes")
    private Integer workedMinutes;

    @Column(name = "expected_minutes")
    private Integer expectedMinutes;

    @Column(name = "overtime_minutes")
    private Integer overtimeMinutes;

    @Column(name = "early_leave_minutes")
    private Integer earlyLeaveMinutes;

    @Column(name = "auto_closed", nullable = false)
    private Boolean autoClosed;

    @Column(name = "auto_closed_reason", length = 128)
    private String autoClosedReason;

    @Column(name = "latest_alert", length = 64)
    private String latestAlert;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Version
    private Long version;

    @PrePersist
    void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        if (this.duration == null) {
            this.duration = 0L;
        }
        if (this.lateArrival == null) {
            this.lateArrival = Boolean.FALSE;
        }
        if (this.dailyStatus == null) {
            this.dailyStatus = AttendanceDayStatus.IDLE;
        }
        if (this.source != null && this.checkInSource == null) {
            this.checkInSource = this.source;
        }
        if (this.autoClosed == null) {
            this.autoClosed = Boolean.FALSE;
        }
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
