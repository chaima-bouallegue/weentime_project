package com.weentime.weentimeapp.enums;

public enum OvertimeStatus {
    NO_OVERTIME,
    NONE,
    EN_ATTENTE_MANAGER,
    APPROUVEE_MANAGER,
    REFUSEE_MANAGER,
    EN_ATTENTE_RH,
    APPROUVEE_RH,
    REFUSEE_RH,

    // Legacy values kept so existing rows can still be read safely.
    PENDING_APPROVAL,
    APPROVED,
    REJECTED
}
