package com.weentime.weentimeapp.config;

import com.fasterxml.jackson.databind.SerializationFeature;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.ZoneId;
import java.util.TimeZone;

@Configuration
@RequiredArgsConstructor
public class JacksonDateTimeConfig {

    private final PresenceProperties presenceProperties;

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer presenceDateTimeCustomizer() {
        return builder -> {
            ZoneId zoneId = ZoneId.of(presenceProperties.getTimezone());
            builder.timeZone(TimeZone.getTimeZone(zoneId));
            builder.featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        };
    }
}
