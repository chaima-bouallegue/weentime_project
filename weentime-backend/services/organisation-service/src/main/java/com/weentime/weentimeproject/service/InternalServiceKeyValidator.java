package com.weentime.weentimeproject.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class InternalServiceKeyValidator {

    private final String expectedKey;

    public InternalServiceKeyValidator(@Value("${integration.internal-api-key}") String expectedKey) {
        this.expectedKey = expectedKey;
    }

    public void assertValid(String providedKey) {
        if (expectedKey == null || expectedKey.isBlank() || expectedKey.equals(providedKey)) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal service key.");
    }
}
