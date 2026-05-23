package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.StoreTwoFactorOtpRequest;
import com.weentime.weentimeproject.dto.request.VerifyTwoFactorOtpRequest;
import com.weentime.weentimeproject.dto.response.OtpVerificationResponse;
import com.weentime.weentimeproject.entity.TwoFactorOtp;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.TwoFactorOtpPurpose;
import com.weentime.weentimeproject.enums.TwoFactorTypeEnum;
import com.weentime.weentimeproject.repository.TwoFactorOtpRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import com.weentime.weentimeproject.service.TwoFactorOtpService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class TwoFactorOtpServiceImpl implements TwoFactorOtpService {
    private static final int MAX_ATTEMPTS = 5;
    private static final int TTL_MINUTES = 5;
    private static final int RESEND_COOLDOWN_SECONDS = 60;

    private final TwoFactorOtpRepository otpRepository;
    private final UtilisateurRepository utilisateurRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void storeOtp(StoreTwoFactorOtpRequest request) {
        Utilisateur user = utilisateurRepository.findByEmail(normalizeEmail(request.getEmail()))
                .orElseThrow(() -> new EntityNotFoundException("Utilisateur non trouve : " + request.getEmail()));
        TwoFactorTypeEnum method = normalizeMethod(request.getMethod());
        TwoFactorOtpPurpose purpose = normalizePurpose(request.getPurpose());

        otpRepository.findTopByUserEmailIgnoreCaseAndMethodAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(
                user.getEmail(), method, purpose
        ).ifPresent(previous -> {
            LocalDateTime cooldownBoundary = LocalDateTime.now().minusSeconds(RESEND_COOLDOWN_SECONDS);
            if (previous.getCreatedAt() != null && previous.getCreatedAt().isAfter(cooldownBoundary)) {
                throw new IllegalStateException("OTP_RESEND_COOLDOWN");
            }
            previous.setConsumedAt(LocalDateTime.now());
            otpRepository.save(previous);
        });

        otpRepository.save(TwoFactorOtp.builder()
                .user(user)
                .method(method)
                .purpose(purpose)
                .codeHash(request.getCodeHash())
                .expiresAt(LocalDateTime.now().plusMinutes(TTL_MINUTES))
                .ipAddress(request.getIpAddress())
                .build());
    }

    @Override
    @Transactional
    public OtpVerificationResponse verifyOtp(VerifyTwoFactorOtpRequest request) {
        TwoFactorTypeEnum method = normalizeMethod(request.getMethod());
        TwoFactorOtpPurpose purpose = normalizePurpose(request.getPurpose());

        TwoFactorOtp otp = otpRepository.findTopByUserEmailIgnoreCaseAndMethodAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(
                normalizeEmail(request.getEmail()), method, purpose
        ).orElse(null);

        if (otp == null) {
            return failure("OTP_NOT_FOUND", "Code expiré.", null);
        }

        if (otp.getExpiresAt().isBefore(LocalDateTime.now())) {
            otp.setConsumedAt(LocalDateTime.now());
            otpRepository.save(otp);
            return failure("OTP_EXPIRED", "Code expiré.", null);
        }

        if (otp.getAttempts() >= MAX_ATTEMPTS) {
            otp.setConsumedAt(LocalDateTime.now());
            otpRepository.save(otp);
            return failure("TOO_MANY_ATTEMPTS", "Trop de tentatives. Réessayez plus tard.", 0);
        }

        if (passwordEncoder.matches(request.getCode(), otp.getCodeHash())) {
            otp.setConsumedAt(LocalDateTime.now());
            otpRepository.save(otp);
            return OtpVerificationResponse.builder()
                    .valid(true)
                    .message("Vérification réussie.")
                    .build();
        }

        otp.setAttempts(otp.getAttempts() + 1);
        int remaining = Math.max(0, MAX_ATTEMPTS - otp.getAttempts());
        if (remaining == 0) {
            otp.setConsumedAt(LocalDateTime.now());
        }
        otpRepository.save(otp);
        return failure(remaining == 0 ? "TOO_MANY_ATTEMPTS" : "INVALID_OTP",
                remaining == 0 ? "Trop de tentatives. Réessayez plus tard." : "Code incorrect.",
                remaining);
    }

    private OtpVerificationResponse failure(String reason, String message, Integer attemptsRemaining) {
        return OtpVerificationResponse.builder()
                .valid(false)
                .reason(reason)
                .message(message)
                .attemptsRemaining(attemptsRemaining)
                .build();
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    private TwoFactorTypeEnum normalizeMethod(String method) {
        String normalized = method == null ? "" : method.trim().toUpperCase();
        if ("AUTHENTICATOR".equals(normalized)) {
            return TwoFactorTypeEnum.TOTP;
        }
        return TwoFactorTypeEnum.valueOf(normalized);
    }

    private TwoFactorOtpPurpose normalizePurpose(String purpose) {
        String normalized = purpose == null || purpose.isBlank() ? "LOGIN" : purpose.trim().toUpperCase();
        return TwoFactorOtpPurpose.valueOf(normalized);
    }
}
