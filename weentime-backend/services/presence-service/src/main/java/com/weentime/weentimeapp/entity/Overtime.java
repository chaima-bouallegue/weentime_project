package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.OvertimeStatus;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "overtimes",
        uniqueConstraints = @UniqueConstraint(name = "uk_overtime_user_date", columnNames = {"utilisateur_id", "date_presence"}),
        indexes = @Index(name = "idx_overtime_date", columnList = "date_presence")
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Overtime {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "utilisateur_id", nullable = false)
    private Long utilisateurId;

    @Column(name = "entreprise_id")
    private Long entrepriseId;

    @Column(name = "attendance_id")
    private Long attendanceId;

    @Column(name = "date_presence", nullable = false)
    private LocalDate date;

    @Column(name = "heures_supplementaires", nullable = false, precision = 6, scale = 2)
    private BigDecimal heuresSupplementaires;

    @Column(nullable = false)
    private Boolean approuvee;

    @Column(name = "scheduled_start")
    private LocalDateTime scheduledStart;

    @Column(name = "scheduled_end")
    private LocalDateTime scheduledEnd;

    @Column(name = "check_in_time")
    private LocalDateTime checkInTime;

    @Column(name = "check_out_time")
    private LocalDateTime checkOutTime;

    @Column(name = "actual_check_out")
    private LocalDateTime actualCheckOut;

    @Column(name = "overtime_start")
    private LocalDateTime overtimeStart;

    @Column(name = "overtime_end")
    private LocalDateTime overtimeEnd;

    @Column(name = "worked_minutes")
    private Integer workedMinutes;

    @Column(name = "expected_minutes")
    private Integer expectedMinutes;

    @Column(name = "overtime_minutes")
    private Integer overtimeMinutes;

    @Column(length = 255)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private OvertimeStatus status;

    @Column(name = "manager_id")
    private Long managerId;

    @Column(name = "manager_decision", length = 32)
    private String managerDecision;

    @Column(name = "manager_comment", length = 500)
    private String managerComment;

    @Column(name = "rh_decision", length = 32)
    private String rhDecision;

    @Column(name = "rh_comment", length = 500)
    private String rhComment;

    @Column(name = "rh_decision_by")
    private Long rhDecisionBy;

    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

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
        if (this.approuvee == null) {
            this.approuvee = Boolean.FALSE;
        }
        if (this.status == null) {
            this.status = Boolean.TRUE.equals(this.approuvee)
                    ? OvertimeStatus.APPROVED_RH
                    : OvertimeStatus.PENDING_MANAGER;
        }
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
