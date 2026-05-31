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
                .scheduledEnd(entity.getScheduledEnd())
                .actualCheckOut(entity.getActualCheckOut())
                .overtimeMinutes(entity.getOvertimeMinutes())
                .reason(entity.getReason())
                .status(entity.getStatus())
                .managerId(entity.getManagerId())
                .rhDecisionBy(entity.getRhDecisionBy())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .version(entity.getVersion())
                .build();
    }
}
