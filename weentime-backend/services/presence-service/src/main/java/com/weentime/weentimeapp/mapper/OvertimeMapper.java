package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.OvertimeDTO;
import com.weentime.weentimeapp.entity.Overtime;
import org.springframework.stereotype.Component;

@Component
public class OvertimeMapper {

    public OvertimeDTO toDto(Overtime entity) {
        if (entity == null) {
            return null;
        }

        return OvertimeDTO.builder()
                .id(entity.getId())
                .utilisateurId(entity.getUtilisateurId())
                .entrepriseId(entity.getEntrepriseId())
                .attendanceId(entity.getAttendanceId())
                .date(entity.getDate())
                .heuresSupplementaires(entity.getHeuresSupplementaires())
                .approuvee(entity.getApprouvee())
                .scheduledStart(entity.getScheduledStart())
                .scheduledEnd(entity.getScheduledEnd())
                .checkInTime(entity.getCheckInTime())
                .checkOutTime(entity.getCheckOutTime())
                .actualCheckOut(entity.getActualCheckOut())
                .overtimeStart(entity.getOvertimeStart())
                .overtimeEnd(entity.getOvertimeEnd())
                .workedMinutes(entity.getWorkedMinutes())
                .expectedMinutes(entity.getExpectedMinutes())
                .overtimeMinutes(entity.getOvertimeMinutes())
                .reason(entity.getReason())
                .status(entity.getStatus())
                .managerId(entity.getManagerId())
                .managerDecision(entity.getManagerDecision())
                .managerComment(entity.getManagerComment())
                .rhDecision(entity.getRhDecision())
                .rhComment(entity.getRhComment())
                .rhDecisionBy(entity.getRhDecisionBy())
                .reviewedBy(entity.getReviewedBy())
                .reviewedAt(entity.getReviewedAt())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .version(entity.getVersion())
                .build();
    }
}
