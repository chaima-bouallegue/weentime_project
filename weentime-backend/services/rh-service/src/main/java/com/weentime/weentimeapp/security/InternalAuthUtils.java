package com.weentime.weentimeapp.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public final class InternalAuthUtils {

    private InternalAuthUtils() {}

    public static boolean isInternalSecretValid(String requestSecret, String expectedSecret) {
        if (requestSecret == null || expectedSecret == null) {
            return false;
        }
        return MessageDigest.isEqual(
                requestSecret.getBytes(StandardCharsets.UTF_8),
                expectedSecret.getBytes(StandardCharsets.UTF_8)
        );
    }
}
