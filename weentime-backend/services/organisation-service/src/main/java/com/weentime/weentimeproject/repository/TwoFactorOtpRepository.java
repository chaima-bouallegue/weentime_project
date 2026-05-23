package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.TwoFactorOtp;
import com.weentime.weentimeproject.enums.TwoFactorOtpPurpose;
import com.weentime.weentimeproject.enums.TwoFactorTypeEnum;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TwoFactorOtpRepository extends JpaRepository<TwoFactorOtp, Long> {
    Optional<TwoFactorOtp> findTopByUserEmailIgnoreCaseAndMethodAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(
            String email,
            TwoFactorTypeEnum method,
            TwoFactorOtpPurpose purpose
    );
}
