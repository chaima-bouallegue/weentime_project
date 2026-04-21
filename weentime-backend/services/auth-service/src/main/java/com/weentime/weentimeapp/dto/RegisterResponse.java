package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class RegisterResponse {
    private String token;
    private Long id;
    private String email;
    private List<String> roles;
    private String message;
}
