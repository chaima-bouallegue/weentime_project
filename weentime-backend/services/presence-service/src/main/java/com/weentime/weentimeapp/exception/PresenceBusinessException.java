package com.weentime.weentimeapp.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class PresenceBusinessException extends RuntimeException {
    private final String code;
    private final HttpStatus status;

    public PresenceBusinessException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
