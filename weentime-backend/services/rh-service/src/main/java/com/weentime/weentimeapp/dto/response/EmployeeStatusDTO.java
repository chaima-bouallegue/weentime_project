package com.weentime.weentimeapp.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmployeeStatusDTO {
    private Long id;
    private String name;
    private String prenom;
    private String email;
    private String poste;
    private String departementName;
    private String teamName;
    private String status; // LEAVE, ABSENCE, REMOTE, PRESENT, SCHEDULED, PENDING
    private String detail; // e.g. "Congé Annuel", "Maladie", etc.
    private String photoUrl;
}
