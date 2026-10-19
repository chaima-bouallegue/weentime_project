package com.weentime.weentimeapp.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;

public class LoginRequest {
    @NotBlank
    private String email;

    @NotBlank
    @JsonAlias({"password", "motDePasse"})
    private String password;

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    private Boolean rememberMe;
    private Boolean trustDevice;

    public Boolean getRememberMe() { return rememberMe; }
    public void setRememberMe(Boolean rememberMe) { this.rememberMe = rememberMe; }

    public Boolean getTrustDevice() { return trustDevice; }
    public void setTrustDevice(Boolean trustDevice) { this.trustDevice = trustDevice; }
}
