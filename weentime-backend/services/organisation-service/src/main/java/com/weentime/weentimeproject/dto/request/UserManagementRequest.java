package com.weentime.weentimeproject.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserManagementRequest {
    @NotBlank(message = "Le prenom est obligatoire.")
    private String firstName;

    @NotBlank(message = "Le nom est obligatoire.")
    private String lastName;

    @NotBlank(message = "L'email est obligatoire.")
    @Email(message = "L'email doit etre valide.")
    private String email;

    private String password;

    private String phone;

    private String position;

    @NotBlank(message = "Le role est obligatoire.")
    private String role;

    @NotBlank(message = "Le statut est obligatoire.")
    private String status;

    @NotNull(message = "L'entreprise est obligatoire.")
    private Long companyId;

    private Long departmentId;

    private Long teamId;

    private Long managerId;

}
