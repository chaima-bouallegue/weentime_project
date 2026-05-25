package com.weentime.weentimeapp.security.services;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import dev.samstevens.totp.code.DefaultCodeGenerator;
import dev.samstevens.totp.code.DefaultCodeVerifier;
import dev.samstevens.totp.secret.DefaultSecretGenerator;
import dev.samstevens.totp.time.SystemTimeProvider;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.Optional;
import java.util.Random;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class TwoFactorService {

    private static final String ENCRYPTION_PREFIX = "v2:";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;
    private static final String OTP_PREFIX = "2fa:otp:";
    private static final String ATTEMPTS_PREFIX = "2fa:attempts:";
    private static final String LOCK_PREFIX = "2fa:lock:";
    private static final Pattern BASE32_TOTP_SECRET = Pattern.compile("^[A-Z2-7]{16,128}=*$");

    private final PasswordEncoder passwordEncoder;
    private final StringRedisTemplate redisTemplate;
    private final Environment environment;
    private final DefaultSecretGenerator secretGenerator = new DefaultSecretGenerator();
    private final DefaultCodeVerifier codeVerifier = new DefaultCodeVerifier(
            new DefaultCodeGenerator(),
            new SystemTimeProvider()
    );

    @Value("${encryption.secret:12345678901234567890123456789012}")
    private String encryptionSecret;

    @Value("${security.mfa.allow-plain-base32-secrets:false}")
    private boolean allowPlainBase32Secrets;

    @PostConstruct
    void configureTotpVerifier() {
        codeVerifier.setAllowedTimePeriodDiscrepancy(1);
    }

    public String generateOtpCode() {
        Random random = new SecureRandom();
        int code = 100000 + random.nextInt(900000);
        return String.valueOf(code);
    }

    public void saveOtp(String email, String code) {
        redisTemplate.opsForValue().set(OTP_PREFIX + email, passwordEncoder.encode(code), 5, TimeUnit.MINUTES);
    }

    public boolean verifyStoredOtp(String email, String code) {
        String storedCodeHash = redisTemplate.opsForValue().get(OTP_PREFIX + email);
        if (storedCodeHash != null && passwordEncoder.matches(code, storedCodeHash)) {
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
        if (secret == null || secret.isBlank() || codeStr == null || !codeStr.matches("\\d{6}")) {
            return false;
        }
        try {
            return codeVerifier.isValidCode(secret, codeStr);
        } catch (RuntimeException exception) {
            return false;
        }
    }

    public String generateTotpSecret() {
        return secretGenerator.generate();
    }

    public String buildOtpAuthUrl(String email, String secret) {
        String issuer = urlEncode("WeenTime");
        String account = urlEncode(email);
        return "otpauth://totp/" + issuer + ":" + account
                + "?secret=" + secret
                + "&issuer=" + issuer
                + "&digits=6&period=30";
    }

    public String generateQrCodeBase64(String value) {
        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(value, BarcodeFormat.QR_CODE, 220, 220);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", output);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(output.toByteArray());
        } catch (Exception exception) {
            throw new IllegalStateException("Impossible de generer le QR code 2FA", exception);
        }
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
            byte[] iv = new byte[GCM_IV_LENGTH];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, buildAesKey(), new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] encryptedData = cipher.doFinal(rawValue.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + encryptedData.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encryptedData, 0, combined, iv.length, encryptedData.length);
            return ENCRYPTION_PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception exception) {
            throw new IllegalStateException("Erreur de chiffrement AES", exception);
        }
    }

    public Optional<String> resolveTotpSecret(String storedValue, String email) {
        String normalizedStoredValue = storedValue == null ? "" : storedValue.trim();
        if (normalizedStoredValue.isBlank()) {
            return Optional.empty();
        }

        if (normalizedStoredValue.startsWith(ENCRYPTION_PREFIX)) {
            try {
                return Optional.of(decryptGcm(normalizedStoredValue));
            } catch (Exception exception) {
                log.warn("TOTP secret AES-GCM decrypt failed for user={}: {}",
                        maskEmail(email), exception.getClass().getSimpleName());
                return Optional.empty();
            }
        }

        try {
            return Optional.of(decryptLegacyAes(normalizedStoredValue));
        } catch (Exception exception) {
            String normalizedPlainSecret = normalizePlainTotpSecret(normalizedStoredValue);
            if (isPlainTotpSecretAllowed() && looksLikePlainTotpSecret(normalizedPlainSecret)) {
                log.warn("Using local/dev plain Base32 TOTP secret fallback for user={}", maskEmail(email));
                return Optional.of(normalizedPlainSecret);
            }

            log.warn("TOTP secret could not be resolved for user={}: {}",
                    maskEmail(email), exception.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    public String decrypt(String encryptedValue) {
        return resolveTotpSecret(encryptedValue, null)
                .orElseThrow(() -> new IllegalArgumentException("INVALID_MFA_CONFIGURATION"));
    }

    private String decryptGcm(String encryptedValue) throws Exception {
        byte[] combined = Base64.getDecoder().decode(encryptedValue.substring(ENCRYPTION_PREFIX.length()));
        byte[] iv = Arrays.copyOfRange(combined, 0, GCM_IV_LENGTH);
        byte[] encryptedData = Arrays.copyOfRange(combined, GCM_IV_LENGTH, combined.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, buildAesKey(), new GCMParameterSpec(GCM_TAG_LENGTH, iv));
        return new String(cipher.doFinal(encryptedData), StandardCharsets.UTF_8);
    }

    private String decryptLegacyAes(String encryptedValue) throws Exception {
        Key key = buildAesKey();
        Cipher cipher = Cipher.getInstance("AES");
        cipher.init(Cipher.DECRYPT_MODE, key);
        byte[] decodedValue = Base64.getDecoder().decode(encryptedValue);
        byte[] decryptedData = cipher.doFinal(decodedValue);
        return new String(decryptedData, StandardCharsets.UTF_8);
    }

    private boolean isPlainTotpSecretAllowed() {
        if (allowPlainBase32Secrets) {
            return true;
        }

        return Arrays.stream(environment.getActiveProfiles())
                .anyMatch(profile -> "dev".equalsIgnoreCase(profile)
                        || "local".equalsIgnoreCase(profile)
                        || "test".equalsIgnoreCase(profile));
    }

    private boolean looksLikePlainTotpSecret(String value) {
        return value != null && BASE32_TOTP_SECRET.matcher(value).matches();
    }

    private String normalizePlainTotpSecret(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", "").toUpperCase();
    }

    private Key buildAesKey() {
        byte[] keyBytes = encryptionSecret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length != 16 && keyBytes.length != 24 && keyBytes.length != 32) {
            throw new IllegalStateException("La cle encryption.secret doit contenir 16, 24 ou 32 octets.");
        }
        return new SecretKeySpec(keyBytes, "AES");
    }

    private String maskEmail(String email) {
        if (email == null || !email.contains("@")) {
            return "unknown";
        }

        String[] parts = email.split("@", 2);
        String local = parts[0];
        String visible = local.isBlank() ? "" : local.substring(0, 1);
        return visible + "***@" + parts[1];
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
