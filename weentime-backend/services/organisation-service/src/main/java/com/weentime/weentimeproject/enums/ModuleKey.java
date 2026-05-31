package com.weentime.weentimeproject.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum ModuleKey {
    PRESENCE    ("Présence"),
    CONGES      ("Congés"),
    RECRUTEMENT ("Recrutement");


    private final String label;
}