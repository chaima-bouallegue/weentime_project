package com.weentime.weentimeapp.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class InternalAuthValidator {

    private final String expectedSecret;

    public InternalAuthValidator(@Value("${weentime.internal.secret:WeenTimeInternalSecretKey2026}") String expectedSecret) {
        this.expectedSecret = expectedSecret;
    }

    public void assertValid(String providedSecret) {
        if (expectedSecret == null || expectedSecret.isBlank()) {
            return;
        }
        if (providedSecret == null || !MessageDigest.isEqual(
                expectedSecret.getBytes(StandardCharsets.UTF_8),
                providedSecret.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal secret");
        }
    }
}
