package com.weentime.weentimeapp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class MfaCodeRequest {
    @NotBlank
    @Pattern(regexp = "\\d{6}", message = "Le code MFA doit contenir 6 chiffres.")
    private String code;
}
