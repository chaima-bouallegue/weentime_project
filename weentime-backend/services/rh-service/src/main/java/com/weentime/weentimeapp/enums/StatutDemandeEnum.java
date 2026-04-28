package com.weentime.weentimeapp.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public enum StatutDemandeEnum {
    EN_ATTENTE_MANAGER("EN_ATTENTE_MANAGER"),
    EN_ATTENTE_RH("EN_ATTENTE_RH"),
    APPROUVE("APPROUVEE"),
    REFUSE("REFUSEE"),
    ANNULE("ANNULEE");

    private static final Map<String, StatutDemandeEnum> VALUES = Map.ofEntries(
            Map.entry("EN_ATTENTE_MANAGER", EN_ATTENTE_MANAGER),
            Map.entry("EN_ATTENTE_RH", EN_ATTENTE_RH),
            Map.entry("APPROUVE", APPROUVE),
            Map.entry("APPROUVEE", APPROUVE),
            Map.entry("VALIDEE", APPROUVE),
            Map.entry("REFUSE", REFUSE),
            Map.entry("REFUSEE", REFUSE),
            Map.entry("REJETEE", REFUSE),
            Map.entry("ANNULE", ANNULE),
            Map.entry("ANNULEE", ANNULE)
    );

    private static final Map<String, Set<StatutDemandeEnum>> FILTER_VALUES = Map.ofEntries(
            Map.entry("EN_ATTENTE", EnumSet.of(EN_ATTENTE_MANAGER, EN_ATTENTE_RH)),
            Map.entry("EN_ATTENTE_MANAGER", EnumSet.of(EN_ATTENTE_MANAGER)),
            Map.entry("EN_ATTENTE_RH", EnumSet.of(EN_ATTENTE_RH)),
            Map.entry("APPROUVE", EnumSet.of(APPROUVE)),
            Map.entry("APPROUVEE", EnumSet.of(APPROUVE)),
            Map.entry("VALIDEE", EnumSet.of(APPROUVE)),
            Map.entry("REFUSE", EnumSet.of(REFUSE)),
            Map.entry("REFUSEE", EnumSet.of(REFUSE)),
            Map.entry("REJETEE", EnumSet.of(REFUSE)),
            Map.entry("ANNULE", EnumSet.of(ANNULE)),
            Map.entry("ANNULEE", EnumSet.of(ANNULE))
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
        StatutDemandeEnum statut = VALUES.get(value.trim().toUpperCase(Locale.ROOT));
        if (statut == null) {
            throw new IllegalArgumentException("Unsupported statut value: " + value);
        }
        return statut;
    }

    public static Set<StatutDemandeEnum> resolveFilterValues(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return FILTER_VALUES.getOrDefault(
                value.trim().toUpperCase(Locale.ROOT),
                Collections.emptySet()
        );
    }
}
