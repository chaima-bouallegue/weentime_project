package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.PresenceSource;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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

    @Size(max = 128, message = "La localisation est trop longue")
    private String localisation;

    private Double latitude;

    private Double longitude;

    private Double accuracy;

    @Size(max = 255, message = "L'adresse est trop longue")
    private String address;
}
