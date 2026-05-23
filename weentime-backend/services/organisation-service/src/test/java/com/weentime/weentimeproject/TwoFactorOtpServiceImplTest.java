package com.weentime.weentimeproject;

import com.weentime.weentimeproject.dto.request.VerifyTwoFactorOtpRequest;
import com.weentime.weentimeproject.dto.response.OtpVerificationResponse;
import com.weentime.weentimeproject.entity.TwoFactorOtp;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.TwoFactorOtpPurpose;
import com.weentime.weentimeproject.enums.TwoFactorTypeEnum;
import com.weentime.weentimeproject.repository.TwoFactorOtpRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import com.weentime.weentimeproject.service.impl.TwoFactorOtpServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TwoFactorOtpServiceImplTest {

    private final TwoFactorOtpRepository otpRepository = mock(TwoFactorOtpRepository.class);
    private final UtilisateurRepository utilisateurRepository = mock(UtilisateurRepository.class);
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final TwoFactorOtpServiceImpl service = new TwoFactorOtpServiceImpl(
            otpRepository,
            utilisateurRepository,
            passwordEncoder
    );

    @Test
    void valid_email_otp_consumes_hash() {
        TwoFactorOtp otp = otp("123456", LocalDateTime.now().plusMinutes(5));
        when(otpRepository.findTopByUserEmailIgnoreCaseAndMethodAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(
                "user@test.com", TwoFactorTypeEnum.EMAIL, TwoFactorOtpPurpose.LOGIN
        )).thenReturn(Optional.of(otp));

        OtpVerificationResponse response = service.verifyOtp(request("123456"));

        assertThat(response.isValid()).isTrue();
        assertThat(otp.getConsumedAt()).isNotNull();
        verify(otpRepository).save(otp);
    }

    @Test
    void invalid_email_otp_increments_attempts_without_exposing_code() {
        TwoFactorOtp otp = otp("123456", LocalDateTime.now().plusMinutes(5));
        when(otpRepository.findTopByUserEmailIgnoreCaseAndMethodAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(
                "user@test.com", TwoFactorTypeEnum.EMAIL, TwoFactorOtpPurpose.LOGIN
        )).thenReturn(Optional.of(otp));

        OtpVerificationResponse response = service.verifyOtp(request("000000"));

        assertThat(response.isValid()).isFalse();
        assertThat(response.getReason()).isEqualTo("INVALID_OTP");
        assertThat(otp.getAttempts()).isEqualTo(1);
        verify(otpRepository).save(otp);
    }

    @Test
    void expired_email_otp_is_rejected_and_consumed() {
        TwoFactorOtp otp = otp("123456", LocalDateTime.now().minusSeconds(1));
        when(otpRepository.findTopByUserEmailIgnoreCaseAndMethodAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(
                "user@test.com", TwoFactorTypeEnum.EMAIL, TwoFactorOtpPurpose.LOGIN
        )).thenReturn(Optional.of(otp));

        OtpVerificationResponse response = service.verifyOtp(request("123456"));

        assertThat(response.isValid()).isFalse();
        assertThat(response.getReason()).isEqualTo("OTP_EXPIRED");
        assertThat(otp.getConsumedAt()).isNotNull();
        verify(otpRepository).save(otp);
    }

    private VerifyTwoFactorOtpRequest request(String code) {
        VerifyTwoFactorOtpRequest request = new VerifyTwoFactorOtpRequest();
        request.setEmail("user@test.com");
        request.setMethod("EMAIL");
        request.setPurpose("LOGIN");
        request.setCode(code);
        return request;
    }

    private TwoFactorOtp otp(String rawCode, LocalDateTime expiresAt) {
        return TwoFactorOtp.builder()
                .user(Utilisateur.builder().id(1L).email("user@test.com").build())
                .method(TwoFactorTypeEnum.EMAIL)
                .purpose(TwoFactorOtpPurpose.LOGIN)
                .codeHash(passwordEncoder.encode(rawCode))
                .expiresAt(expiresAt)
                .createdAt(LocalDateTime.now().minusMinutes(1))
                .build();
    }
}
