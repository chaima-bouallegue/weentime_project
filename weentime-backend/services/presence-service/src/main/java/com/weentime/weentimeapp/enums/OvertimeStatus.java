package com.weentime.weentimeapp.enums;

public enum OvertimeStatus {
    NO_OVERTIME,
    NONE,
    PENDING_MANAGER,
    APPROVED_MANAGER,
    REJECTED_MANAGER,
    PENDING_RH,
    APPROVED_RH,
    REJECTED_RH,
    CANCELLED,

    // Legacy French values kept so existing rows can still be read safely.
    EN_ATTENTE_MANAGER,
    APPROUVEE_MANAGER,
    REFUSEE_MANAGER,
    EN_ATTENTE_RH,
    APPROUVEE_RH,
    REFUSEE_RH,

    // Legacy generic values kept so existing rows can still be read safely.
    PENDING_APPROVAL,
    APPROVED,
    REJECTED
}
