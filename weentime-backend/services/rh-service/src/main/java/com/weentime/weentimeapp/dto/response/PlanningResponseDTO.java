package com.weentime.weentimeapp.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlanningResponseDTO {
    private LocalDate date;
    private List<EmployeeStatusDTO> employees;
    private Double presenceRate;
    private String presenceText; // e.g. "7/10"
    private boolean isRestDay;
}
