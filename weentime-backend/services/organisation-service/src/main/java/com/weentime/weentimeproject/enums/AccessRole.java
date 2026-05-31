package com.weentime.weentimeproject.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum AccessRole {
    ROLE_RH("Gestionnaire RH"),
    ROLE_MANAGER("Manager"),
    ROLE_EMPLOYE("Employé");

    private final String label;
}