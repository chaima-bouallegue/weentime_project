package com.weentime.weentimeapp.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;
import java.util.Map;

public enum StatutDemandeEnum {
    EN_ATTENTE_MANAGER("EN_ATTENTE_MANAGER"),
    EN_ATTENTE_RH("EN_ATTENTE_RH"),
    APPROUVE("APPROUVEE"),
    REFUSE("REFUSEE"),
    ANNULE("ANNULEE");

    private static final Map<String, StatutDemandeEnum> VALUES = Map.of(
            "EN_ATTENTE_MANAGER", EN_ATTENTE_MANAGER,
            "EN_ATTENTE_RH", EN_ATTENTE_RH,
            "APPROUVE", APPROUVE,
            "APPROUVEE", APPROUVE,
            "REFUSE", REFUSE,
            "REFUSEE", REFUSE,
            "ANNULE", ANNULE,
            "ANNULEE", ANNULE
    );

    private final String jsonValue;

    StatutDemandeEnum(String jsonValue) {
        this.jsonValue = jsonValue;
    }

    @JsonValue
    public String toJson() {
        return jsonValue;
    }

    @JsonCreator
    public static StatutDemandeEnum fromValue(String value) {
        if (value == null) {
            return null;
        }
        StatutDemandeEnum statut = VALUES.get(value.toUpperCase(Locale.ROOT));
        if (statut == null) {
            throw new IllegalArgumentException("Unsupported statut value: " + value);
        }
        return statut;
    }
}
