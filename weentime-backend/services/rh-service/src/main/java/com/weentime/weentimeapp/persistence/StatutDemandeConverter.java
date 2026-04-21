package com.weentime.weentimeapp.persistence;

import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class StatutDemandeConverter implements AttributeConverter<StatutDemandeEnum, String> {

    @Override
    public String convertToDatabaseColumn(StatutDemandeEnum attribute) {
        return attribute == null ? null : attribute.toJson();
    }

    @Override
    public StatutDemandeEnum convertToEntityAttribute(String dbData) {
        return StatutDemandeEnum.fromValue(dbData);
    }
}
