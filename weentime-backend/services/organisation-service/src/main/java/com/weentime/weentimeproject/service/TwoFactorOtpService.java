package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.request.StoreTwoFactorOtpRequest;
import com.weentime.weentimeproject.dto.request.VerifyTwoFactorOtpRequest;
import com.weentime.weentimeproject.dto.response.OtpVerificationResponse;

public interface TwoFactorOtpService {
    void storeOtp(StoreTwoFactorOtpRequest request);
    OtpVerificationResponse verifyOtp(VerifyTwoFactorOtpRequest request);
}
