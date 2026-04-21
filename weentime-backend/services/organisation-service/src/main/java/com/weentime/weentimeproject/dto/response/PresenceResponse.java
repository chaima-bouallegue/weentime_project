package com.weentime.weentimeproject.dto.response;

import com.weentime.weentimeproject.enums.PresenceStatus;
import lombok.Builder;
import lombok.Value;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Value
@Builder
public class PresenceResponse {
    LocalDate date;
    LocalDateTime clockIn;
    LocalDateTime clockOut;
    BigDecimal hours;
    BigDecimal overtime;
    PresenceStatus status;
}
