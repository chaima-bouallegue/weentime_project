package com.weentime.weentimeproject.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RhOwnerAssignEntrepriseRequest {

    @NotNull(message = "L'entreprise est obligatoire")
    private Long entrepriseId;
}
