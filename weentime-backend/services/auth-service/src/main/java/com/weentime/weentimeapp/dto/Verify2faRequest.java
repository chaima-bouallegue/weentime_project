package com.weentime.weentimeapp.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class Verify2faRequest {
    @NotBlank
    private String code;
    @NotBlank
    private String tempToken;
}
