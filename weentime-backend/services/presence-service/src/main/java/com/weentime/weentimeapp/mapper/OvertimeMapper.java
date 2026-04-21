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
                .date(entity.getDate())
                .heuresSupplementaires(entity.getHeuresSupplementaires())
                .approuvee(entity.getApprouvee())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .version(entity.getVersion())
                .build();
    }
}
