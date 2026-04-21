package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.PresenceSource;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CheckInRequest {
    @NotNull(message = "La source est obligatoire")
    private PresenceSource source;

    private String localisation;
}
