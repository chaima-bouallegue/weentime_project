package com.weentime.weentimeapp.dto.horaire;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EmployeeScheduleDto {
    private Long userId;
    private String firstName;
    private String lastName;
    private String initials;
    private String color;
    private String email;
    private HoraireDto horaire;
}
