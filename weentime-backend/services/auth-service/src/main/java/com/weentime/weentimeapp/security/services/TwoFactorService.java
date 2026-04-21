package com.weentime.weentimeapp.security.services;

import com.warrenstrange.googleauth.GoogleAuthenticator;
import com.warrenstrange.googleauth.GoogleAuthenticatorKey;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.security.Key;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Random;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class TwoFactorService {

    private final PasswordEncoder passwordEncoder;
    private final StringRedisTemplate redisTemplate;
    private final GoogleAuthenticator googleAuthenticator = new GoogleAuthenticator();

    @Value("${encryption.secret:12345678901234567890123456789012}") // 32 chars for AES-256
    private String encryptionSecret;

    private static final String OTP_PREFIX = "2fa:otp:";
    private static final String ATTEMPTS_PREFIX = "2fa:attempts:";
    private static final String LOCK_PREFIX = "2fa:lock:";

    public String generateOtpCode() {
        Random random = new SecureRandom();
        int code = 100000 + random.nextInt(900000);
        return String.valueOf(code);
    }

    public void saveOtp(String email, String code) {
        redisTemplate.opsForValue().set(OTP_PREFIX + email, code, 5, TimeUnit.MINUTES);
    }

    public boolean verifyStoredOtp(String email, String code) {
        String storedCode = redisTemplate.opsForValue().get(OTP_PREFIX + email);
        if (storedCode != null && storedCode.equals(code)) {
            redisTemplate.delete(OTP_PREFIX + email);
            return true;
        }
        return false;
    }

    public String hashBackupCode(String code) {
        return passwordEncoder.encode(code);
    }

    public boolean verifyBackupCode(String rawCode, String hashedCode) {
        return passwordEncoder.matches(rawCode, hashedCode);
    }

    public boolean verifyTotpCode(String secret, String codeStr) {
        try {
            int code = Integer.parseInt(codeStr);
            return googleAuthenticator.authorize(secret, code);
        } catch (NumberFormatException e) {
            return false;
        }
    }

    public String generateTotpSecret() {
        GoogleAuthenticatorKey key = googleAuthenticator.createCredentials();
        return key.getKey();
    }

    public long incrementAttempts(String email) {
        Long attempts = redisTemplate.opsForValue().increment(ATTEMPTS_PREFIX + email);
        if (attempts != null && attempts == 1) {
            redisTemplate.expire(ATTEMPTS_PREFIX + email, 10, TimeUnit.MINUTES);
        }
        return attempts != null ? attempts : 0;
    }

    public void lockUser(String email) {
        redisTemplate.opsForValue().set(LOCK_PREFIX + email, "LOCKED", 10, TimeUnit.MINUTES);
    }

    public boolean isUserLocked(String email) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(LOCK_PREFIX + email));
    }

    public void resetAttempts(String email) {
        redisTemplate.delete(ATTEMPTS_PREFIX + email);
        redisTemplate.delete(LOCK_PREFIX + email);
    }

    public String encrypt(String rawValue) {
        try {
            Key key = new SecretKeySpec(encryptionSecret.getBytes(), "AES");
            Cipher cipher = Cipher.getInstance("AES");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] encryptedData = cipher.doFinal(rawValue.getBytes());
            return Base64.getEncoder().encodeToString(encryptedData);
        } catch (Exception e) {
            throw new RuntimeException("Erreur de chiffrement AES", e);
        }
    }

    public String decrypt(String encryptedValue) {
        try {
            Key key = new SecretKeySpec(encryptionSecret.getBytes(), "AES");
            Cipher cipher = Cipher.getInstance("AES");
            cipher.init(Cipher.DECRYPT_MODE, key);
            byte[] decodedValue = Base64.getDecoder().decode(encryptedValue);
            byte[] decryptedData = cipher.doFinal(decodedValue);
            return new String(decryptedData);
        } catch (Exception e) {
            throw new RuntimeException("Erreur de déchiffrement AES", e);
        }
    }
}
