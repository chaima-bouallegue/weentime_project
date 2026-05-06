package com.weentime.communication.entity;

public enum OutboxStatus {
    PENDING,
    SENT,
    FAILED,
    DEAD_LETTER
}
